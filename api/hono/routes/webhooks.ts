import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { claimEvent } from "@/db/queries/events";
import { addOrderEvent, getOrder } from "@/db/queries/orders";
import { releaseReservationsByOrder } from "@/db/queries/reservations";
import { orders, products } from "@/db/schema";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import {
  fetchRazorpayOrderPayments,
  getRazorpayPaymentLinkReferenceId,
} from "@/lib/payments/razorpay";

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

const findOrderByRazorpayReference = async (razorpayReference: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayReference))
    .limit(1);

  return order ? getOrder(order.id) : null;
};

const findOrderByPaymentId = async (paymentId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, paymentId))
    .limit(1);

  return order ?? null;
};

const releaseOrderReservation = async (orderId: string, eventNote: string) => {
  const order = await getOrder(orderId);
  if (!order || order.paymentStatus === "paid") return;

  const productIds = order.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  if (productIds.length > 0) {
    const released = await db
      .update(products)
      .set({
        reservedUntil: null,
        stockStatus: "available",
        updatedAt: new Date(),
      })
      .where(and(inArray(products.id, productIds), eq(products.stockStatus, "reserved")))
      .returning({ slug: products.slug });
    revalidateProductsCache(released.map((product) => product.slug));
  }

  await releaseReservationsByOrder(order.id);

  await db
    .update(orders)
    .set({
      paymentStatus: "failed",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  await addOrderEvent(order.id, eventNote, order.status, null);
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

      const razorpayEventId = c.req.header("x-razorpay-event-id");
      if (razorpayEventId) {
        const claimed = await claimEvent({
          eventId: `razorpay_webhook:${razorpayEventId}`,
          occurredAt: new Date(),
          payload: { eventId: razorpayEventId },
          type: "razorpay_webhook_received",
        });
        if (!claimed) {
          return c.json({ duplicate: true, received: true }, 200);
        }
      }

      let event: RazorpayWebhookEvent;
      try {
        event = JSON.parse(rawBody) as RazorpayWebhookEvent;
      } catch {
        return c.json({ code: "INVALID_PAYLOAD", message: "Invalid webhook payload." }, 400);
      }

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

          const order = await findOrderByRazorpayReference(paymentLink.id);
          if (!order) break;

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

          await completePaidOrder({
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

          const order = await findOrderByRazorpayReference(paymentLink.id);
          if (!order) break;

          await releaseOrderReservation(order.id, `Webhook ${event.event}`);
          break;
        }
        case "payment.captured": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id || !payment.id) break;

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

          await completePaidOrder({
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

          await releaseOrderReservation(order.id, "Webhook payment.failed");
          break;
        }
        case "order.paid": {
          const razorpayOrder = event.payload?.order?.entity;
          if (!razorpayOrder?.id) break;

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
            await rejectWebhookCompletion(order.id, order.status, "Razorpay order.paid webhook", "CAPTURED_PAYMENT_NOT_FOUND", {
              paymentReference: razorpayOrder.id,
            });
            break;
          }

          await completePaidOrder({
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

          await db
            .update(orders)
            .set({
              paymentStatus: "refunded",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await addOrderEvent(order.id, "Webhook refund.processed", order.status, {
            paymentId,
          });
          break;
        }
      }

      return c.json({ received: true }, 200);
    }
  );
};
