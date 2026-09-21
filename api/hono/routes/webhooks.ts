import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import {
  getEventByEventId,
  markEventProcessed,
} from "@/db/queries/events";
import { addOrderEvent, getOrder } from "@/db/queries/orders";
import { orders } from "@/db/schema";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { createLogger } from "@/lib/log";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import {
  fetchRazorpayOrderPayments,
  getRazorpayPaymentLinkReferenceId,
} from "@/lib/payments/razorpay";
import {
  reconcilePaymentHoldForOrder,
  type PaymentHoldOrderReconciliation,
} from "@/lib/payments/reconcile-expired-holds";

const log = createLogger("webhooks:razorpay");

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        amount?: number;
        captured?: boolean;
        created_at?: number;
        currency?: string;
        id?: string;
        method?: string;
        order_id?: string;
        status?: string;
      };
    };
    payment_link?: {
      entity?: {
        amount?: number;
        amount_paid?: number;
        currency?: string;
        id?: string;
        reference_id?: string;
        short_url?: string;
        status?: string;
      };
    };
    order?: {
      entity?: {
        amount?: number;
        amount_paid?: number;
        currency?: string;
        id?: string;
        status?: string;
      };
    };
    refund?: {
      entity?: {
        payment_id?: string;
      };
    };
  };
};

type RazorpayWebhookPaymentEntity = NonNullable<
  NonNullable<NonNullable<RazorpayWebhookEvent["payload"]>["payment"]>["entity"]
>;
type RazorpayWebhookPaymentLinkEntity = NonNullable<
  NonNullable<NonNullable<RazorpayWebhookEvent["payload"]>["payment_link"]>["entity"]
>;
type PaymentOrderForVerification = {
  id: string;
  status: "confirmed" | "delivered" | "pending" | "shipped";
  totalPaise: number;
};
type PaymentForVerification = Omit<RazorpayWebhookPaymentEntity, "order_id"> & {
  order_id?: null | string;
};

/*
 * completePaidOrder outcomes that no redelivery can change. Answering non-2xx
 * would make Razorpay retry for a day and then disable the endpoint, which
 * would also stop payment_link.paid deliveries.
 */
const FINAL_COMPLETION_ERRORS = new Set([
  "PAYMENT_CLAIM_CONFLICT",
  "PAYMENT_ID_MISMATCH",
  "PRODUCT_SOLD",
]);

const findOrderByRazorpayOrderId = async (razorpayOrderId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayOrderId))
    .limit(1);

  return order ?? null;
};

const paidAtFromUnixSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : undefined;

const isCapturedPayment = (payment: {
  captured?: boolean;
  status?: string;
}) => payment.status === "captured" && payment.captured !== false;

const paymentMatchesOrder = (
  order: PaymentOrderForVerification,
  payment: PaymentForVerification | undefined,
  expectedReference?: string
) => {
  if (!payment?.id || !isCapturedPayment(payment)) return "PAYMENT_NOT_CAPTURED";
  if (payment.currency !== "INR") return "CURRENCY_MISMATCH";
  if (payment.amount !== order.totalPaise) return "AMOUNT_MISMATCH";
  if (expectedReference?.startsWith("order_") && payment.order_id !== expectedReference) {
    return "ORDER_ID_MISMATCH";
  }
  return null;
};

const paymentLinkMatchesOrder = (
  order: PaymentOrderForVerification,
  paymentLink: RazorpayWebhookPaymentLinkEntity | undefined
) => {
  if (!paymentLink?.id || paymentLink.status !== "paid") return "PAYMENT_LINK_NOT_PAID";
  if (paymentLink.currency !== "INR") return "CURRENCY_MISMATCH";
  if (paymentLink.amount !== order.totalPaise || paymentLink.amount_paid !== order.totalPaise) {
    return "AMOUNT_MISMATCH";
  }
  const expectedReferenceId = getRazorpayPaymentLinkReferenceId(order.id);
  if (paymentLink.reference_id && paymentLink.reference_id !== expectedReferenceId) {
    return "PAYMENT_LINK_REFERENCE_MISMATCH";
  }
  return null;
};

const rejectWebhookCompletion = async (
  orderId: string,
  status: PaymentOrderForVerification["status"],
  source: string,
  code: string,
  payload: Record<string, unknown>
) => {
  await addOrderEvent(orderId, `${source} verification rejected`, status, {
    code,
    ...payload,
  });
};

/** Complete a verified payment; a final rejection is audited and acknowledged. */
const completeFromWebhook = async (
  order: Pick<PaymentOrderForVerification, "id" | "status">,
  input: Parameters<typeof completePaidOrder>[0],
) => {
  try {
    await completePaidOrder(input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (!FINAL_COMPLETION_ERRORS.has(code)) throw error;
    await addOrderEvent(order.id, `${input.source} completion rejected`, order.status, {
      code,
      paymentId: input.paymentId,
      paymentReference: input.paymentReference ?? null,
    });
  }
};

const findOrderByRazorpayReference = async (razorpayReference: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayReference))
    .limit(1);

  return order ? getOrder(order.id) : null;
};

const orderIdFromPaymentLinkReference = (
  referenceId: null | string | undefined,
): null | string => {
  const match = /^ftt_([a-f0-9]{32})$/i.exec(referenceId ?? "");
  if (!match) return null;
  const value = match[1]!.toLowerCase();
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

/**
 * Normal path is the stored provider id. The reference fallback covers the
 * narrow but important case where Razorpay created the link and our response
 * was lost before its id could be persisted.
 */
const findOrderForPaymentLink = async (
  paymentLink: RazorpayWebhookPaymentLinkEntity,
) => {
  if (!paymentLink.id) return null;
  const byProviderId = await findOrderByRazorpayReference(paymentLink.id);
  if (byProviderId) return byProviderId;

  const orderId = orderIdFromPaymentLinkReference(paymentLink.reference_id);
  if (!orderId) return null;
  const byReference = await getOrder(orderId);
  if (
    !byReference ||
    getRazorpayPaymentLinkReferenceId(byReference.id) !==
      paymentLink.reference_id ||
    (byReference.razorpayOrderId != null &&
      byReference.razorpayOrderId !== paymentLink.id)
  ) {
    return null;
  }
  return byReference;
};

const findOrderByPaymentId = async (paymentId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, paymentId))
    .limit(1);

  return order ?? null;
};

export const registerWebhookRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/razorpay",
      responses: {
        200: {
          description: "Webhook received",
        },
      },
      tags: ["Webhooks"],
    }),
    async (c) => {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return c.json(
          {
            code: "WEBHOOK_SECRET_MISSING",
            message: "Webhook secret not configured.",
          },
          500
        );
      }

      const rawBody = await c.req.raw.text();
      const signature = c.req.header("x-razorpay-signature");
      if (!signature) {
        return c.json({ code: "MISSING_SIGNATURE", message: "Missing signature." }, 400);
      }

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signature);
      if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        return c.json(
          {
            code: "INVALID_SIGNATURE",
            message: "Invalid webhook signature.",
          },
          400
        );
      }

      let event: RazorpayWebhookEvent;
      try {
        event = JSON.parse(rawBody) as RazorpayWebhookEvent;
      } catch {
        return c.json({ code: "INVALID_PAYLOAD", message: "Invalid webhook payload." }, 400);
      }

      const razorpayEventId = c.req.header("x-razorpay-event-id");
      const claimedEventId = razorpayEventId
        ? `razorpay_webhook:${razorpayEventId}`
        : null;
      if (claimedEventId) {
        const existingReceipt = await getEventByEventId(claimedEventId);
        if (existingReceipt?.type === "razorpay_webhook_processed") {
          return c.json({ duplicate: true, received: true }, 200);
        }
      }

      try {
        switch (event.event) {
        case "payment.authorized": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id || !payment.id) break;

          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          await addOrderEvent(order.id, "Webhook payment.authorized", order.status, {
            paymentId: payment.id,
            paymentReference: payment.order_id,
          });
          break;
        }
        case "payment_link.paid": {
          const payment = event.payload?.payment?.entity;
          const paymentLink = event.payload?.payment_link?.entity;
          if (!payment?.id || !paymentLink?.id) break;

          const order = await findOrderForPaymentLink(paymentLink);
          if (!order) {
            // The order is written before its link is created, so no
            // redelivery will ever find one (for example a link made by hand
            // in the dashboard). Answering non-2xx would only get the endpoint
            // disabled. A failed lookup still throws and is retried.
            log.warn("payment_link.paid for a link with no matching order", {
              paymentId: payment.id,
              paymentLinkId: paymentLink.id,
              referenceId: paymentLink.reference_id ?? null,
            });
            break;
          }

          const linkFailure = paymentLinkMatchesOrder(order, paymentLink);
          const paymentFailure = paymentMatchesOrder(order, payment);
          const failure = linkFailure ?? paymentFailure;
          if (failure) {
            await rejectWebhookCompletion(order.id, order.status, "Razorpay payment link webhook", failure, {
              paymentId: payment.id,
              paymentLinkId: paymentLink.id,
            });
            break;
          }

          await completeFromWebhook(order, {
            orderId: order.id,
            paidAt: paidAtFromUnixSeconds(payment.created_at),
            paymentId: payment.id,
            paymentMethod: payment.method ?? "razorpay_payment_link",
            paymentReference: paymentLink.id,
            paymentUrl: paymentLink.short_url,
            source: "Razorpay payment link webhook",
          });
          break;
        }
        case "payment_link.cancelled":
        case "payment_link.expired": {
          const paymentLink = event.payload?.payment_link?.entity;
          if (!paymentLink?.id) break;

          const order = await findOrderForPaymentLink(paymentLink);
          if (!order) break;

          /*
           * Webhooks are not delivered in event order: a capture just before
           * expiry can arrive after this terminal snapshot. The payload is
           * therefore never trusted to release anything. Reconciliation
           * re-reads the link from Razorpay and restores or releases only a
           * confirmed unpaid hold; anything it cannot prove stays protected
           * until provider-aware reconciliation settles it, and the delivery
           * is still acknowledged.
           */
          let reconciliation: PaymentHoldOrderReconciliation | null = null;
          if (order.paymentStatus === "pending") {
            try {
              reconciliation = await reconcilePaymentHoldForOrder({
                now: new Date(),
                orderId: order.id,
              });
            } catch (error) {
              log.warn("Terminal link reconciliation failed; the scheduled run retries it", {
                error,
                orderId: order.id,
              });
              reconciliation = { kind: "deferred", reason: "RECONCILIATION_FAILED" };
            }
          }
          if (reconciliation?.kind === "released") {
            revalidateProductsCache([
              ...reconciliation.releasedSlugs,
              ...reconciliation.restoredSlugs,
            ]);
          }

          await addOrderEvent(order.id, `Webhook ${event.event}`, order.status, {
            reconciliation: reconciliation?.kind ?? "skipped",
            releaseDeferred:
              reconciliation?.kind === "deferred" ||
              reconciliation?.kind === "conflict",
            ...(reconciliation?.kind === "deferred"
              ? { reason: reconciliation.reason }
              : {}),
            terminal: true,
          });
          break;
        }
        case "payment.captured": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id || !payment.id) break;

          // Payment Link payments carry Razorpay's own order_ id, which no
          // order stores. A redelivery would never find one either.
          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          const failure = paymentMatchesOrder(order, payment, payment.order_id);
          if (failure) {
            await rejectWebhookCompletion(order.id, order.status, "Razorpay payment.captured webhook", failure, {
              paymentId: payment.id,
              paymentReference: payment.order_id,
            });
            break;
          }

          await completeFromWebhook(order, {
            orderId: order.id,
            paidAt: paidAtFromUnixSeconds(payment.created_at),
            paymentId: payment.id,
            paymentMethod: payment.method ?? "razorpay",
            paymentReference: payment.order_id,
            source: "Razorpay payment.captured webhook",
          });
          break;
        }
        case "payment.failed": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id) break;

          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          /*
           * One failed payment attempt is not terminal for the Razorpay order
           * or its open payment link: the shopper can retry and later succeed.
           * Releasing here would let a second shopper buy the saree before that
           * capture arrives. Only provider-aware reconciliation of a terminal
           * link restores or releases the exact hold.
           */
          await addOrderEvent(order.id, "Webhook payment.failed", order.status, {
            paymentId: payment.id ?? null,
            paymentReference: payment.order_id,
            terminal: false,
          });
          break;
        }
        case "order.paid": {
          const razorpayOrder = event.payload?.order?.entity;
          if (!razorpayOrder?.id) break;

          // As with payment.captured, no stored order means none ever will.
          const order = await findOrderByRazorpayOrderId(razorpayOrder.id);
          if (!order) break;

          if (
            razorpayOrder.status !== "paid" ||
            razorpayOrder.currency !== "INR" ||
            razorpayOrder.amount !== order.totalPaise ||
            razorpayOrder.amount_paid !== order.totalPaise
          ) {
            await rejectWebhookCompletion(order.id, order.status, "Razorpay order.paid webhook", "ORDER_MISMATCH", {
              paymentReference: razorpayOrder.id,
            });
            break;
          }

          const payments = await fetchRazorpayOrderPayments(razorpayOrder.id);
          const capturedPayment = payments.find((payment) =>
            payment.id && paymentMatchesOrder(order, payment, razorpayOrder.id) === null
          );
          if (!capturedPayment?.id) {
            // Razorpay can deliver order.paid before the captured payment is
            // visible in the order-payments list. This is a retryable provider
            // propagation gap, not a final verification rejection.
            throw new Error("WEBHOOK_CAPTURE_NOT_READY");
          }

          await completeFromWebhook(order, {
            orderId: order.id,
            paidAt: paidAtFromUnixSeconds(capturedPayment.created_at),
            paymentId: capturedPayment.id,
            paymentMethod: capturedPayment.method ?? "razorpay",
            paymentReference: razorpayOrder.id,
            source: "Razorpay order.paid webhook",
          });
          break;
        }
        case "refund.processed": {
          const paymentId = event.payload?.refund?.entity?.payment_id;
          if (!paymentId) break;

          const order = await findOrderByPaymentId(paymentId);
          if (!order) break;

          /*
           * A refund changes only the order's payment record. The saree stays
           * Sold until an admin has checked it and restores it explicitly.
           */
          await db
            .update(orders)
            .set({
              paymentStatus: "refunded",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(orders.id, order.id),
                inArray(orders.paymentStatus, ["paid", "refunded"]),
              ),
            );

          await addOrderEvent(order.id, "Webhook refund.processed", order.status, {
            paymentId,
          });
          break;
        }
        }

        if (claimedEventId) {
          await markEventProcessed({
            eventId: claimedEventId,
            occurredAt: new Date(),
            payload: {
              eventId: razorpayEventId!,
              eventType: event.event,
            },
            type: "razorpay_webhook_processed",
          });
        }
      } catch {
        /*
         * No completed receipt is written until dispatch succeeds. Returning a
         * non-2xx response therefore lets Razorpay retry a transient lookup,
         * provider call, database failure, or interrupted serverless run.
         */
        return c.json(
          {
            code: "WEBHOOK_PROCESSING_RETRY",
            message: "Webhook processing is incomplete; retry later.",
          },
          503,
        );
      }

      return c.json({ received: true }, 200);
    }
  );
};
