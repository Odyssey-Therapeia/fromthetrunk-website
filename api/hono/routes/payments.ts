import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createHash, randomUUID } from "crypto";
import { and, count, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { createLogger } from "@/lib/log";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import { createPaymentOrderSchema, verifyPaymentSchema } from "@/api/hono/schemas/payments";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import {
  addOrderEvent,
  createOrder,
  getOrder,
  getOrderByIdempotencyKey,
  type OrderWithRelations,
} from "@/db/queries/orders";
import {
  getLivePaymentHoldForOrder,
  listLapsedOwnPaymentOrderIds,
  listUserCartItems,
  releasePaymentCartItems,
  startPaymentForOwnedCartItems,
  type UserCartItemRow,
} from "@/db/queries/user-cart";
import { fillMissingCheckoutProfile } from "@/db/queries/users";
import { findDiscountByCode, toValidatedDiscount } from "@/db/queries/discounts";
import { getCollectionProductIds } from "@/db/queries/collections";
import {
  collections,
  orders,
  products,
  productTypes,
  reservations,
} from "@/db/schema";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";
import {
  getCartReservationExpiresAt,
  getPaymentLinkDeadline,
  isPaymentLinkDeadlineUsable,
} from "@/lib/cart/reservation-policy";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { GST_RATE } from "@/lib/config/order-pricing";
import { createOrderAccessToken, verifyOrderAccessToken } from "@/lib/orders/order-access-token";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import { validateOrderItemSelectedOptions } from "@/lib/orders/selected-options";
import { isBlouseProduct } from "@/lib/products/product-type";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { consentFromRequest } from "@/lib/analytics/server-consent";
import { validateDiscountCode } from "@/lib/discounts/validate";
import { recordPaymentAttempt } from "@/lib/payments/checkout-idempotency";
import { evaluatePaymentHost } from "@/lib/payments/payment-host-guard";
import {
  calculateOrderTotals,
  createRazorpayPaymentLink,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  fetchRazorpayPaymentLink,
  getRazorpayPaymentLinkReferenceId,
  isRazorpayAuthError,
  isRazorpayBadRequest,
  lookupRazorpayPaymentLinkByReferenceId,
  RAZORPAY_PAYMENT_LINK_HOLD_MINUTES,
  RAZORPAY_MIN_AMOUNT_PAISE,
  type RazorpayPaymentLinkResponse,
  verifyPaymentLinkSignature,
  verifyPaymentSignature,
} from "@/lib/payments/razorpay";
import { reconcilePaymentHoldForOrder } from "@/lib/payments/reconcile-expired-holds";
import { timed, timedRows } from "@/lib/perf/timed";

const logCreateOrder = createLogger("payments:create-order");
const logPaymentLinkCallback = createLogger("payments:payment-link-callback");
const CHECKOUT_IN_PROGRESS_RETRY_SECONDS = 2;
// Each inline reconciliation may call Razorpay, so one request settles at most
// this many of the shopper's own lapsed payment orders.
const INLINE_PAYMENT_RECONCILE_LIMIT = 3;
const ORDERS_IDEMPOTENCY_UNIQUE_INDEX = "orders_idempotency_key_unique";

const availabilityErrorMessages = {
  PAYMENT_IN_PROGRESS: "A payment for this piece is already in progress.",
  PRODUCT_RESERVED: "This piece has just been reserved.",
  PRODUCT_SOLD: "This saree has found its next home.",
  RESERVATION_CONFLICT: "This piece has just been reserved.",
  RESERVATION_EXPIRED: "Your reservation expired. Please add it again if still available.",
} as const;

type AvailabilityErrorCode = keyof typeof availabilityErrorMessages;

const availabilityError = (
  code: AvailabilityErrorCode,
  productId: string,
  productName?: string
) => ({
  code,
  details: {
    productId,
    ...(productName ? { productName } : {}),
  },
  message: availabilityErrorMessages[code],
});

const checkoutInProgressBody = {
  code: "CHECKOUT_IN_PROGRESS",
  message: "Your secure checkout is still being prepared. Please wait a moment and try again.",
};

const checkoutAttemptNotReusableBody = {
  code: "CHECKOUT_ATTEMPT_NOT_REUSABLE",
  message: "Unable to reuse this checkout attempt. Please try again.",
};

const checkoutCartChangedBody = {
  code: "CHECKOUT_CART_CHANGED",
  message: "Checkout details changed. Please try again.",
};

const paymentWindowExpiredBody = {
  code: "PAYMENT_WINDOW_EXPIRED",
  message: "This order's payment window has expired. Please reorder the pieces.",
};

const asErrorRecord = (error: unknown): Record<string, unknown> | null =>
  typeof error === "object" && error !== null ? error as Record<string, unknown> : null;

const isOrderIdempotencyConflict = (error: unknown) => {
  const record = asErrorRecord(error);
  const cause = asErrorRecord(record?.cause);
  const code = record?.code ?? cause?.code;
  const constraint = record?.constraint ?? cause?.constraint;
  const message = String(record?.message ?? cause?.message ?? "");
  return (
    code === "23505" &&
    (constraint === ORDERS_IDEMPOTENCY_UNIQUE_INDEX ||
      message.includes(ORDERS_IDEMPOTENCY_UNIQUE_INDEX) ||
      message.includes("idempotency_key"))
  );
};

const stableCheckoutFingerprint = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

const normalizeFingerprintText = (value: null | string | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const buildServerCartFingerprint = ({
  discountAmountPaise,
  discountCode,
  discountId,
  giftFrom,
  giftMessage,
  isGift,
  items,
  shippingAddress,
  shippingCostPaise,
  shippingMethod,
  subtotalPaise,
  taxAmountPaise,
  totalPaise,
}: {
  discountAmountPaise: number;
  discountCode?: null | string;
  discountId?: null | string;
  giftFrom?: null | string;
  giftMessage?: null | string;
  isGift: boolean;
  items: Array<{
    pricePaise: number;
    productId: string;
    quantity: number;
    selectedOptions: Record<string, string>;
  }>;
  shippingAddress: {
    city: string;
    country: string;
    email: string;
    line1: string;
    line2?: string;
    name: string;
    phone?: string;
    postalCode: string;
    state?: string;
  };
  shippingCostPaise: number;
  shippingMethod: string;
  subtotalPaise: number;
  taxAmountPaise: number;
  totalPaise: number;
}) =>
  stableCheckoutFingerprint({
    discount: {
      amountPaise: discountAmountPaise,
      code: normalizeFingerprintText(discountCode),
      id: discountId ?? null,
    },
    gift: {
      from: normalizeFingerprintText(giftFrom),
      isGift,
      message: normalizeFingerprintText(giftMessage),
    },
    items: items
      .map((item) => ({
        pricePaise: item.pricePaise,
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    shippingAddress: {
      city: normalizeFingerprintText(shippingAddress.city),
      country: normalizeFingerprintText(shippingAddress.country),
      email: normalizeFingerprintText(shippingAddress.email),
      line1: normalizeFingerprintText(shippingAddress.line1),
      line2: normalizeFingerprintText(shippingAddress.line2),
      name: normalizeFingerprintText(shippingAddress.name),
      phone: normalizeFingerprintText(shippingAddress.phone),
      postalCode: normalizeFingerprintText(shippingAddress.postalCode),
      state: normalizeFingerprintText(shippingAddress.state),
    },
    shippingMethod,
    totals: {
      shippingCostPaise,
      subtotalPaise,
      taxAmountPaise,
      totalPaise,
    },
  });

const paymentLinkUrlFromOrderEvents = (order: OrderWithRelations) => {
  for (const event of order.events) {
    const payload = asErrorRecord(event.payload);
    const paymentLinkUrl = payload?.paymentLinkUrl;
    if (typeof paymentLinkUrl === "string" && paymentLinkUrl.length > 0) {
      return paymentLinkUrl;
    }
  }
  return null;
};

const orderHoldStillValid = (
  order: OrderWithRelations,
  cartDeadlines: Date[],
  now = new Date(),
) =>
  isPaymentLinkDeadlineUsable(
    getPaymentLinkDeadline({
      cartDeadlines,
      paymentStartedAt: order.placedAt,
    }),
    now,
  );

const reusableOrderResponse = (
  order: OrderWithRelations,
  paymentLinkUrl: string,
) => ({
  amountPaise: order.totalPaise,
  amount: order.totalPaise,
  currency: "INR",
  orderAccessToken: createOrderAccessToken(order.id),
  order_id: order.razorpayOrderId,
  orderId: order.id,
  paymentLinkId: order.razorpayOrderId,
  paymentLinkUrl,
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
  razorpayOrderId: order.razorpayOrderId,
  reused: true,
});

const isOpenPaymentLinkForOrder = (
  order: Pick<OrderWithRelations, "id" | "totalPaise">,
  paymentLink: RazorpayPaymentLinkResponse | null | undefined,
): paymentLink is RazorpayPaymentLinkResponse =>
  Boolean(
    paymentLink &&
      paymentLink.reference_id === getRazorpayPaymentLinkReferenceId(order.id) &&
      paymentLink.currency === "INR" &&
      paymentLink.amount === order.totalPaise &&
      paymentLink.short_url &&
      (paymentLink.status == null || paymentLink.status === "created"),
  );

/**
 * Ask Razorpay for this order's link by its unique reference.
 *
 * Only "absent" proves no link exists. A link that exists but is not this
 * order's open link, or a malformed listing, stays "unresolved": nothing may be
 * released or created again against it until reconciliation decides.
 */
const recoverPaymentLinkByReference = async (
  order: Pick<OrderWithRelations, "id" | "totalPaise">,
): Promise<
  | { kind: "absent" }
  | { kind: "open"; paymentLink: RazorpayPaymentLinkResponse }
  | { kind: "unresolved" }
> => {
  const lookup = await lookupRazorpayPaymentLinkByReferenceId(
    getRazorpayPaymentLinkReferenceId(order.id),
  );
  if (lookup.kind === "absent") return { kind: "absent" };
  if (
    lookup.kind === "found" &&
    isOpenPaymentLinkForOrder(order, lookup.paymentLink)
  ) {
    return { kind: "open", paymentLink: lookup.paymentLink };
  }
  return { kind: "unresolved" };
};

const persistRecoveredPaymentLink = async (
  order: OrderWithRelations,
  paymentLink: RazorpayPaymentLinkResponse,
) => {
  const attached = await db
    .update(orders)
    .set({
      razorpayOrderId: paymentLink.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.paymentStatus, "pending"),
        or(
          isNull(orders.razorpayOrderId),
          eq(orders.razorpayOrderId, paymentLink.id),
        ),
      ),
    )
    .returning({ id: orders.id });

  if (attached.length === 0) {
    const current = await getOrder(order.id);
    if (
      current?.paymentStatus !== "pending" ||
      current.razorpayOrderId !== paymentLink.id
    ) {
      throw new Error("RECOVERED_PAYMENT_LINK_CONFLICT");
    }
    return;
  }

  await addOrderEvent(order.id, "Razorpay payment link recovered", "pending", {
    paymentLinkId: paymentLink.id,
    paymentLinkUrl: paymentLink.short_url,
  });
};

const resolveClaimedCheckoutAttempt = async ({
  attemptId,
  cartDeadlines,
  cartFingerprint,
  existingOrder,
  userId,
}: {
  attemptId: string;
  cartDeadlines: Date[];
  cartFingerprint: string;
  existingOrder?: OrderWithRelations | null;
  userId: string;
}) => {
  const existing =
    existingOrder === undefined
      ? await getOrderByIdempotencyKey(attemptId)
      : existingOrder;
  if (!existing) {
    return { kind: "missing" as const };
  }
  if (existing.userId !== userId) {
    return { kind: "progress" as const };
  }
  if (existing.cartFingerprint && existing.cartFingerprint !== cartFingerprint) {
    return { kind: "cartChanged" as const };
  }
  if (existing.paymentStatus !== "pending") {
    return { kind: "notReusable" as const };
  }
  if (!orderHoldStillValid(existing, cartDeadlines)) {
    return { kind: "notReusable" as const };
  }
  if (!existing.razorpayOrderId) {
    try {
      const recovery = await recoverPaymentLinkByReference(existing);
      // Only a confirmed empty lookup makes creating the link again safe.
      if (recovery.kind === "absent") {
        return { kind: "resume" as const, order: existing };
      }
      if (recovery.kind === "unresolved") return { kind: "progress" as const };
      await persistRecoveredPaymentLink(existing, recovery.paymentLink);
      return {
        kind: "reusable" as const,
        response: reusableOrderResponse(
          { ...existing, razorpayOrderId: recovery.paymentLink.id },
          recovery.paymentLink.short_url,
        ),
      };
    } catch {
      // An unreadable provider answer is not proof that no link exists, and
      // resuming would ask Razorpay to create the same reference again.
      return { kind: "progress" as const };
    }
  }
  const paymentLinkUrl = paymentLinkUrlFromOrderEvents(existing);
  if (!paymentLinkUrl) {
    try {
      const recovered = await fetchRazorpayPaymentLink(
        existing.razorpayOrderId,
      );
      if (!isOpenPaymentLinkForOrder(existing, recovered)) {
        return { kind: "progress" as const };
      }
      return {
        kind: "reusable" as const,
        response: reusableOrderResponse(existing, recovered.short_url),
      };
    } catch {
      return { kind: "progress" as const };
    }
  }
  return {
    kind: "reusable" as const,
    response: reusableOrderResponse(existing, paymentLinkUrl),
  };
};

/**
 * Settle the shopper's own lapsed payment holds before checkout decides.
 *
 * Only a payment_pending line on this checkout can carry the exact current
 * payment hold, so an ordinary checkout reads nothing extra. Each lapsed order
 * goes through the same provider-aware command the cron and webhook use: an
 * unpaid link hands back only the remaining cart time, a captured one
 * completes, and anything unproven stays protected. A failure is logged and
 * leaves the hold as it was. Returns true when any order was attempted, so
 * the caller re-reads the bag before trusting it.
 */
const reconcileLapsedOwnPaymentHolds = async ({
  cartItems,
  productIds,
  userId,
}: {
  cartItems: UserCartItemRow[];
  productIds: string[];
  userId: string;
}) => {
  const requestedProductIds = new Set(productIds);
  const paymentPendingProductIds = cartItems
    .filter(
      (item) =>
        item.status === "payment_pending" &&
        requestedProductIds.has(item.productId),
    )
    .map((item) => item.productId);
  if (paymentPendingProductIds.length === 0) return false;

  let lapsedOrderIds: string[];
  try {
    lapsedOrderIds = await listLapsedOwnPaymentOrderIds({
      now: new Date(),
      productIds: paymentPendingProductIds,
      userId,
    });
  } catch (error) {
    logCreateOrder.warn("Lapsed payment hold lookup failed; holds stay protected", {
      err: error as Record<string, unknown>,
    });
    return false;
  }

  const orderIds = lapsedOrderIds.slice(0, INLINE_PAYMENT_RECONCILE_LIMIT);
  for (const orderId of orderIds) {
    try {
      const reconciliation = await reconcilePaymentHoldForOrder({
        now: new Date(),
        orderId,
      });
      if (reconciliation.kind === "released") {
        const changedSlugs = [
          ...new Set([
            ...reconciliation.releasedSlugs,
            ...reconciliation.restoredSlugs,
          ]),
        ];
        if (changedSlugs.length > 0) revalidateProductsCache(changedSlugs);
      }
    } catch (error) {
      logCreateOrder.warn("Inline payment hold reconciliation failed; the hold stays protected", {
        err: error as Record<string, unknown>,
        orderId,
      });
    }
  }
  return orderIds.length > 0;
};

const paymentLinkCallbackSchema = z.object({
  orderId: z.string().uuid().optional(),
  razorpay_payment_id: z.string().trim().min(1).max(128).optional(),
  razorpay_payment_link_id: z.string().trim().min(1).max(128).optional(),
  razorpay_payment_link_reference_id: z.string().trim().min(1).max(128).optional(),
  razorpay_payment_link_status: z.string().trim().min(1).max(64).optional(),
  razorpay_signature: z.string().trim().min(1).max(256).optional(),
}).strict();

const paymentStatusQuerySchema = z.object({
  key: z.string().trim().min(1).max(512).optional(),
  orderId: z.string().uuid(),
}).strict();

type PaymentVerificationFailure = {
  code: string;
  message: string;
  status: 400 | 409 | 502;
};

const asPaiseNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const paidAtFromUnixSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : undefined;

const isCapturedPayment = (payment: { captured?: boolean; status?: string }) =>
  payment.status === "captured" && payment.captured !== false;

const validateFetchedPayment = (
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  payment: Awaited<ReturnType<typeof fetchRazorpayPayment>>,
  expectedReference?: string
): PaymentVerificationFailure | null => {
  if (!isCapturedPayment(payment)) {
    return {
      code: "PAYMENT_NOT_CAPTURED",
      message: "Payment is not captured yet.",
      status: 409,
    };
  }

  if (payment.currency !== "INR") {
    return {
      code: "CURRENCY_MISMATCH",
      message: "Payment currency does not match this order.",
      status: 400,
    };
  }

  if (payment.amount !== order.totalPaise) {
    return {
      code: "AMOUNT_MISMATCH",
      message: "Payment amount does not match this order.",
      status: 400,
    };
  }

  if (expectedReference?.startsWith("order_") && payment.order_id !== expectedReference) {
    return {
      code: "ORDER_ID_MISMATCH",
      message: "Payment does not match this Razorpay order.",
      status: 400,
    };
  }

  return null;
};

const validateFetchedOrder = async (
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  razorpayOrderId: string
): Promise<PaymentVerificationFailure | null> => {
  if (!razorpayOrderId.startsWith("order_")) return null;

  const razorpayOrder = await fetchRazorpayOrder(razorpayOrderId);
  if (razorpayOrder.id !== razorpayOrderId) {
    return {
      code: "ORDER_ID_MISMATCH",
      message: "Payment does not match this Razorpay order.",
      status: 400,
    };
  }

  if (razorpayOrder.currency !== "INR" || razorpayOrder.amount !== order.totalPaise) {
    return {
      code: "ORDER_AMOUNT_MISMATCH",
      message: "Razorpay order amount does not match this order.",
      status: 400,
    };
  }

  if (razorpayOrder.status && razorpayOrder.status !== "paid") {
    return {
      code: "ORDER_NOT_PAID",
      message: "Razorpay order is not paid yet.",
      status: 409,
    };
  }

  return null;
};

const validateFetchedPaymentLink = (
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  paymentLink: Awaited<ReturnType<typeof fetchRazorpayPaymentLink>>,
  expectedPaymentLinkId: string
): PaymentVerificationFailure | null => {
  if (paymentLink.id !== expectedPaymentLinkId) {
    return {
      code: "PAYMENT_LINK_MISMATCH",
      message: "Payment link does not match this order.",
      status: 400,
    };
  }

  if (paymentLink.status !== "paid") {
    return {
      code: "PAYMENT_LINK_NOT_PAID",
      message: "Payment link is not paid yet.",
      status: 409,
    };
  }

  if (paymentLink.currency !== "INR") {
    return {
      code: "CURRENCY_MISMATCH",
      message: "Payment link currency does not match this order.",
      status: 400,
    };
  }

  const amount = asPaiseNumber(paymentLink.amount);
  const paidAmount = asPaiseNumber(paymentLink.amount_paid);
  if (amount !== order.totalPaise || paidAmount !== order.totalPaise) {
    return {
      code: "AMOUNT_MISMATCH",
      message: "Payment link amount does not match this order.",
      status: 400,
    };
  }

  const expectedReferenceId = getRazorpayPaymentLinkReferenceId(order.id);
  if (paymentLink.reference_id && paymentLink.reference_id !== expectedReferenceId) {
    return {
      code: "PAYMENT_LINK_REFERENCE_MISMATCH",
      message: "Payment link reference does not match this order.",
      status: 400,
    };
  }

  return null;
};

const normalizeVerifyPaymentBody = (body: z.infer<typeof verifyPaymentSchema>) => ({
  orderId: body.orderId,
  razorpayOrderId: body.razorpayOrderId ?? body.razorpay_order_id ?? "",
  razorpayPaymentId: body.razorpayPaymentId ?? body.razorpay_payment_id ?? "",
  razorpaySignature: body.razorpaySignature ?? body.razorpay_signature ?? "",
});

const getRequestOrigin = (url: string) => new URL(url).origin;

const getServerOrigin = (requestUrl: string) =>
  process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXTAUTH_URL || getRequestOrigin(requestUrl);

const getOrderConfirmationUrl = (requestUrl: string, orderId?: string, status?: string) => {
  const url = new URL("/checkout/confirmation", getServerOrigin(requestUrl));
  if (orderId) {
    url.searchParams.set("orderId", orderId);
    url.searchParams.set("key", createOrderAccessToken(orderId));
  }
  if (status) {
    url.searchParams.set("payment", status);
  }
  return url;
};

const findOrderByRazorpayReference = async (razorpayReference: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayReference))
    .limit(1);

  return order ? getOrder(order.id) : null;
};

const toPaymentDescription = (
  orderId: string,
  items: Array<{ name: string; quantity: number }>
) => {
  const itemSummary = items.map((item) => `${item.name} x${item.quantity}`).join(", ");
  return `From the Trunk order #${orderId.slice(0, 8).toUpperCase()}: ${itemSummary}`.slice(
    0,
    2048
  );
};

export const registerPaymentRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/create-order",
      request: {
        body: {
          content: {
            "application/json": { schema: createPaymentOrderSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Payment order created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
      },
      tags: ["Payments"],
	    }),
	    async (c) => {
	      const authUserOrResponse = requireAuth(c);
	      if (authUserOrResponse instanceof Response) return authUserOrResponse;

	      const rateLimited = await rateLimitResponse(c.req.raw, `payment:create:${authUserOrResponse.id}`, {
	        limit: 5,
	        requireDurable: true,
	        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      /*
       * Read once, here, while the shopper's cookies are on the request. It is
       * stored on the order and reused when payment completes, which can
       * happen in a webhook where no cookie exists.
       */
      const trackingConsent = consentFromRequest(c.req.raw);

      const body = c.req.valid("json");

      // Payment reliability: block live payments on unsafe hosts (vercel.app /
      // localhost) so real money is never taken against a non-production origin.
      const hostGuard = evaluatePaymentHost(c.req.url);
      if (!hostGuard.allowed) {
        logCreateOrder.warn("Blocked payment on unsafe host", {
          reason: hostGuard.reason,
        });
        return c.json(
          {
            code: "PAYMENT_HOST_NOT_ALLOWED",
            message: "Payments are not available on this domain.",
          },
          403,
        );
      }

      // Payment reliability: idempotent retry. If this checkout attempt already
      // produced a still-valid pending order + payment link, return it instead
      // of creating a duplicate order + stock hold.
      const checkoutAttemptId =
        (body.checkoutAttemptId ?? c.req.header("Idempotency-Key") ?? "").trim() ||
        null;

      const productIds = Array.from(new Set(body.items.map((item) => item.productId)));
      /*
       * Reservation ownership comes from the authenticated account's bag, not
       * from a token supplied by the browser. The request still accepts the old
       * optional field during the compatibility window, but it has no authority
       * here and is never read.
       */
      let serverCartItems = await listUserCartItems(authUserOrResponse.id);
      // Settle the shopper's own lapsed payment before anything below is read.
      // A restored line then checks out as active under its original cart
      // deadline, a released line is gone, a completed one answers sold, and a
      // deferred one still answers PAYMENT_IN_PROGRESS with no new link.
      if (
        await reconcileLapsedOwnPaymentHolds({
          cartItems: serverCartItems,
          productIds,
          userId: authUserOrResponse.id,
        })
      ) {
        serverCartItems = await listUserCartItems(authUserOrResponse.id);
      }
      const serverCartItemByProductId = new Map(
        serverCartItems.map((item) => [item.productId, item]),
      );
      const productRows = await timedRows("payments.createOrder.products", () =>
        db
          .select()
          .from(products)
          .where(and(inArray(products.id, productIds), eq(products.status, "published"))),
      );

      const productById = new Map(productRows.map((product) => [product.id, product]));
      const typeIds = Array.from(
        new Set(
          productRows
            .map((product) => product.typeId)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const typeRows =
        typeIds.length > 0
          ? await timedRows("payments.createOrder.productTypes", () =>
              db
                .select()
                .from(productTypes)
                .where(inArray(productTypes.id, typeIds)),
            )
          : [];
      const typeById = new Map(typeRows.map((type) => [type.id, type]));
      const typeSlugForProductId = (productId: string) => {
        const product = productById.get(productId);
        return product?.typeId ? typeById.get(product.typeId)?.slug ?? null : null;
      };
      // Payment ownership is persisted on the account-bag row. Catalogue type
      // is mutable, so it cannot decide whether a line already carrying a hold
      // participates in the one-of-one payment claim.
      const reservableProductIds = productIds.filter(
        (productId) => {
          const cartItem = serverCartItemByProductId.get(productId);
          return Boolean(cartItem?.reservationToken || cartItem?.reservedUntil);
        },
      );
      const reservableProductIdSet = new Set(reservableProductIds);
      const cartDeadlineByProductId = new Map(
        reservableProductIds.flatMap((productId) => {
          const item = serverCartItemByProductId.get(productId);
          return item
            ? [[productId, getCartReservationExpiresAt(item.addedAt)] as const]
            : [];
        }),
      );
      const reservableCartDeadlines = [
        ...cartDeadlineByProductId.values(),
      ];
      const now = new Date();
      const ownedReservationTokens = new Map<string, string>();
      let claimedCheckoutAttemptOrderPromise: Promise<OrderWithRelations | null> | null = null;
      const getClaimedCheckoutAttemptOrder = () => {
        if (!checkoutAttemptId) return Promise.resolve(null);
        claimedCheckoutAttemptOrderPromise ??= getOrderByIdempotencyKey(checkoutAttemptId);
        return claimedCheckoutAttemptOrderPromise;
      };
      const isClaimedCheckoutAttemptProduct = async (productId: string) => {
        const claimedOrder = await getClaimedCheckoutAttemptOrder();
        return Boolean(
          claimedOrder &&
            claimedOrder.userId === authUserOrResponse.id &&
            claimedOrder.paymentStatus === "pending" &&
            orderHoldStillValid(claimedOrder, reservableCartDeadlines) &&
            claimedOrder.items.some((item) => item.productId === productId),
        );
      };
      for (const productId of productIds) {
        const product = productById.get(productId);
        if (!product) {
          return c.json(
            {
              code: "PRODUCT_UNAVAILABLE",
              details: { productId },
              message: "One or more products are unavailable.",
            },
            400
          );
        }

        const cartItem = serverCartItemByProductId.get(productId);

        // Sold is final. Product type is mutable, so the blouse exception may
        // never run before this guard or a sold one-of-one product could be
        // reclassified, treated as unreserved, and purchased again.
        if (product.stockStatus === "sold") {
          return c.json(
            availabilityError("PRODUCT_SOLD", productId, product.name),
            409,
          );
        }

        // Blouses carry no stock hold, but they must still belong to this
        // authenticated bag. Product ids posted directly by a browser are not
        // checkout authority.
        if (
          !reservableProductIdSet.has(productId) &&
          isBlouseProduct({ typeSlug: typeSlugForProductId(productId) })
        ) {
          if (!cartItem || cartItem.status !== "active") {
            return c.json(
              availabilityError("RESERVATION_CONFLICT", productId, product.name),
              409,
            );
          }
          continue;
        }

        const isReserved = product.stockStatus === "reserved";
        const isActiveReserved =
          isReserved && product.reservedUntil != null && product.reservedUntil > now;
        const reservationToken = verifyReservationToken(
          cartItem?.reservationToken,
        );
        const originalCartDeadline = cartDeadlineByProductId.get(productId);
        const reservationWithinOriginalCartWindow =
          cartItem?.reservedUntil != null &&
          originalCartDeadline != null &&
          (cartItem.status === "payment_pending"
            ? cartItem.reservedUntil <= originalCartDeadline
            : cartItem.reservedUntil.getTime() ===
              originalCartDeadline.getTime());
        const hasExactReservationIdentity =
          cartItem != null &&
          cartItem.reservedUntil != null &&
          reservationWithinOriginalCartWindow &&
          reservationToken != null &&
          reservationToken.productId === productId &&
          reservationToken.reservedUntil > now &&
          reservationToken.reservedUntil.getTime() ===
            cartItem.reservedUntil.getTime() &&
          product.reservedUntil != null &&
          product.reservedUntil.getTime() === cartItem.reservedUntil.getTime();
        /*
         * The shopper's own open payment is answered before any expiry or
         * ownership verdict. Only the exact hold of the attempt being resumed
         * may continue. Any other payment_pending line stays protected until
         * provider-aware reconciliation, even after its link deadline, so it
         * must never read as expired or as another shopper's claim, and the
         * client must never remove it.
         */
        if (cartItem?.status === "payment_pending") {
          const hasMatchingPaymentReservation =
            isActiveReserved &&
            hasExactReservationIdentity &&
            checkoutAttemptId != null &&
            (await isClaimedCheckoutAttemptProduct(productId));
          if (!hasMatchingPaymentReservation || !cartItem.reservationToken) {
            return c.json(
              availabilityError("PAYMENT_IN_PROGRESS", productId, product.name),
              409,
            );
          }
          ownedReservationTokens.set(productId, cartItem.reservationToken);
          continue;
        }

        const reservationExpired =
          isReserved &&
          (!product.reservedUntil || product.reservedUntil <= now);
        if (reservationExpired) {
          return c.json(
            availabilityError("RESERVATION_EXPIRED", productId, product.name),
            409
          );
        }

        // No bag row is left for this line. Only a live hold on the piece is
        // another shopper's claim. A piece that is free again means this
        // shopper's own hold ended, for example released by the inline
        // reconciliation above once its cart deadline had passed.
        if (!cartItem) {
          return c.json(
            availabilityError(
              isActiveReserved ? "PRODUCT_RESERVED" : "RESERVATION_EXPIRED",
              productId,
              product.name,
            ),
            409
          );
        }

        const hasMatchingReservationToken =
          cartItem.status === "active" && hasExactReservationIdentity;
        if (!isActiveReserved || !hasMatchingReservationToken) {
          return c.json(
            availabilityError("RESERVATION_CONFLICT", productId, product.name),
            409
          );
        }

        if (cartItem.reservationToken) {
          ownedReservationTokens.set(productId, cartItem.reservationToken);
        }
      }

      const normalizedItems: Array<{
        imageUrl: null | string;
        name: string;
        pricePaise: number;
        productId: string;
        quantity: number;
        selectedOptions: Record<string, string>;
      }> = [];
      for (const item of body.items) {
        const product = productById.get(item.productId)!;
        const optionValidation = validateOrderItemSelectedOptions({
          product: {
            ...product,
            typeSlug: product.typeId
              ? (typeById.get(product.typeId)?.slug ?? null)
              : null,
          },
          selectedOptions: item.selectedOptions,
        });
        if ("error" in optionValidation) {
          return c.json(optionValidation.error, 400);
        }
        const selectedOptions: Record<string, string> = optionValidation
          .selectedOptions.size
          ? { size: optionValidation.selectedOptions.size }
          : {};
        normalizedItems.push({
          imageUrl: null,
          name: product.name,
          pricePaise: product.pricePaise,
          productId: product.id,
          quantity: item.quantity,
          selectedOptions,
        });
      }

      const subtotalPaise = normalizedItems.reduce(
        (sum, item) => sum + item.pricePaise * item.quantity,
        0
      );

      // P6-02: Resolve optional discount code SERVER-SIDE.
      // The client sends only the code string; the server computes the amount.
      let validatedDiscount: ReturnType<typeof toValidatedDiscount> | undefined;
      // P6-02 (CRITICAL): when the discount is collection-scoped, the discount
      // applies ONLY to the sum of in-collection line items (scoped base). This
      // variable is passed as discountableSubtotalPaise to calculateOrderTotals.
      // When there is no scope, it equals subtotalPaise.
      let discountableSubtotalPaise: number = subtotalPaise;
      if (body.discountCode) {
        const discountRow = await findDiscountByCode(body.discountCode);
        if (!discountRow) {
          return c.json(
            { code: "DISCOUNT_INVALID", message: "Discount code is invalid or inactive." },
            400
          );
        }

        // Resolve collection product IDs for scope check (empty if no scope).
        let collectionProductIds: string[] = [];
        if (discountRow.collectionId) {
          // getCollectionProductIds requires the full collection object with rules.
          // We do a targeted lookup for the collection row.
          const [collectionRow] = await db
            .select()
            .from(collections)
            .where(eq(collections.id, discountRow.collectionId))
            .limit(1);
          if (collectionRow) {
            collectionProductIds = await getCollectionProductIds({
              id: collectionRow.id,
              rules: collectionRow.rules ?? null,
            });
          }
        }

        const validation = validateDiscountCode(toValidatedDiscount(discountRow), {
          subtotalPaise,
          itemProductIds: normalizedItems.map((i) => i.productId),
          collectionProductIds,
          now: new Date(),
          usageCount: discountRow.usageCount,
        });

        if (!validation.valid) {
          return c.json(
            { code: "DISCOUNT_INELIGIBLE", message: validation.error },
            400
          );
        }

        validatedDiscount = toValidatedDiscount(discountRow);

        // Compute the scoped discountable base:
        //   - Collection-scoped: sum of pricePaise*quantity for items IN the collection.
        //   - No scope: full subtotalPaise.
        if (discountRow.collectionId && collectionProductIds.length > 0) {
          const collectionSet = new Set(collectionProductIds);
          discountableSubtotalPaise = normalizedItems
            .filter((i) => collectionSet.has(i.productId))
            .reduce((s, i) => s + i.pricePaise * i.quantity, 0);
        }
      }

      // Single source of truth for the charged amount (shipping + GST + total).
      // Flag OFF (default) reproduces the previous inline math byte-for-byte.
      // P6-02: passes the server-validated discount + scoped base to calculateOrderTotals.
      const { shippingCostPaise, taxAmountPaise, totalPaise, discountAmountPaise } = calculateOrderTotals(
        subtotalPaise,
        body.shippingMethod,
        validatedDiscount,
        discountableSubtotalPaise
      );

      if (totalPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
        return c.json(
          {
            code: "AMOUNT_TOO_LOW",
            message: "Razorpay orders must be at least 100 paise.",
          },
          400
        );
      }

      const shippingName = body.shippingAddress.name;
      const emailLower = body.shippingAddress.email.toLowerCase();
      const isGiftOrder = body.isGift ?? false;
      const giftFrom = isGiftOrder ? body.giftFrom?.trim() || null : null;
      const giftMessage = isGiftOrder ? body.giftMessage?.trim() || null : null;
      const serverCartFingerprint = buildServerCartFingerprint({
        discountAmountPaise,
        discountCode: validatedDiscount?.code ?? null,
        discountId: validatedDiscount?.id ?? null,
        giftFrom,
        giftMessage,
        isGift: isGiftOrder,
        items: normalizedItems,
        shippingAddress: body.shippingAddress,
        shippingCostPaise,
        shippingMethod: body.shippingMethod,
        subtotalPaise,
        taxAmountPaise,
        totalPaise,
      });

      let resumableOrder: OrderWithRelations | null = null;
      if (checkoutAttemptId) {
        const claimedOrder = claimedCheckoutAttemptOrderPromise
          ? await claimedCheckoutAttemptOrderPromise
          : undefined;
        const resolution = await resolveClaimedCheckoutAttempt({
          attemptId: checkoutAttemptId,
          cartDeadlines: reservableCartDeadlines,
          cartFingerprint: serverCartFingerprint,
          existingOrder: claimedOrder,
          userId: authUserOrResponse.id,
        });
        if (resolution.kind === "reusable") {
          return c.json(resolution.response, 200);
        }
        if (resolution.kind === "cartChanged") {
          return c.json(checkoutCartChangedBody, 409);
        }
        if (resolution.kind === "notReusable") {
          return c.json(checkoutAttemptNotReusableBody, 409);
        }
        if (resolution.kind === "progress") {
          c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
          return c.json(checkoutInProgressBody, 409);
        }
        if (resolution.kind === "resume") {
          resumableOrder = resolution.order;
        }
      }

      // Cap check: max 3 live pending payment links per authenticated customer.
      // A resumed idempotent attempt is already in that count and must not be
      // rejected as if it were a fourth new checkout.
      if (!resumableOrder) {
        const linkExpiryMs = RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000;
        const pendingCount = await timedRows("payments.createOrder.pendingCount", () =>
          db
            .select({ c: count() })
            .from(orders)
            .where(
              and(
                eq(orders.userId, authUserOrResponse.id),
                eq(orders.paymentStatus, "pending"),
                gt(orders.createdAt, new Date(Date.now() - linkExpiryMs)),
              ),
            ),
        );
        if ((pendingCount[0]?.c ?? 0) >= 3) {
          return c.json(
            {
              code: "TOO_MANY_PENDING_ORDERS",
              message: "Too many pending orders for this email.",
            },
            429,
          );
        }
      }

      const requestedPaymentStartedAt = resumableOrder?.placedAt ?? new Date();
      const requestedPaymentDeadline = getPaymentLinkDeadline({
        cartDeadlines: reservableCartDeadlines,
        paymentStartedAt: requestedPaymentStartedAt,
      });
      if (!isPaymentLinkDeadlineUsable(requestedPaymentDeadline)) {
        return c.json(
          availabilityError(
            "RESERVATION_EXPIRED",
            reservableProductIds[0] ?? productIds[0] ?? "unknown",
          ),
          409,
        );
      }

      let order: OrderWithRelations;
      let createdOrderNow = false;
      if (resumableOrder) {
        order = resumableOrder;
      } else {
        try {
          order = await timed("payments.createOrder.createOrder", () =>
            createOrder({
              /*
               * Captured here, while the shopper's browser is present. Payment
               * may complete later through a webhook with no cookies to read,
               * and completePaidOrder reads these back rather than guessing.
               */
              advertisingConsent: trackingConsent.advertising,
              analyticsConsent: trackingConsent.analytics,
              cartFingerprint: checkoutAttemptId
                ? serverCartFingerprint
                : null,
              idempotencyKey: checkoutAttemptId,
              items: normalizedItems,
              paymentGateway: "razorpay",
              paymentStatus: "pending",
              placedAt: requestedPaymentStartedAt,
              razorpayOrderId: null,
              shippingCity: body.shippingAddress.city,
              shippingCostPaise,
              shippingCountry: body.shippingAddress.country,
              shippingEmail: emailLower,
              shippingLine1: body.shippingAddress.line1,
              shippingLine2: body.shippingAddress.line2 ?? null,
              shippingMethod: body.shippingMethod,
              shippingName,
              shippingPhone: body.shippingAddress.phone ?? null,
              shippingPostalCode: body.shippingAddress.postalCode,
              shippingState: body.shippingAddress.state ?? null,
              status: "pending",
              subtotalPaise,
              taxAmountPaise,
              taxRate: String(GST_RATE),
              totalPaise,
              userId: authUserOrResponse.id,
              // P6-02: Persist discount association so completePaidOrder can
              // increment usageCount atomically on payment confirmation.
              discountId: validatedDiscount?.id ?? null,
              discountCode: validatedDiscount?.code ?? null,
              isGift: isGiftOrder,
              giftFrom,
              giftMessage,
              initialEvent: {
                note: "Order created",
                payload: { reservableProductIds },
                status: "pending",
              },
            }),
          );
          createdOrderNow = true;
        } catch (error) {
          if (!checkoutAttemptId || !isOrderIdempotencyConflict(error)) {
            throw error;
          }

          const resolution = await resolveClaimedCheckoutAttempt({
            attemptId: checkoutAttemptId,
            cartDeadlines: reservableCartDeadlines,
            cartFingerprint: serverCartFingerprint,
            userId: authUserOrResponse.id,
          });
          if (resolution.kind === "reusable") {
            return c.json(resolution.response, 200);
          }
          if (resolution.kind === "cartChanged") {
            return c.json(checkoutCartChangedBody, 409);
          }
          if (resolution.kind === "notReusable") {
            return c.json(checkoutAttemptNotReusableBody, 409);
          }
          if (resolution.kind === "resume") {
            order = resolution.order;
          } else {
            c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
            return c.json(checkoutInProgressBody, 409);
          }
        }
      }

      // Fill only what the account is missing, from the owner's own details.
      // A gift order's name and phone belong to the recipient, and the verified
      // login email is never touched. Best effort: it may never block payment.
      if (createdOrderNow && !isGiftOrder) {
        try {
          await fillMissingCheckoutProfile({
            name: shippingName,
            now: new Date(),
            phone: body.shippingAddress.phone,
            userId: authUserOrResponse.id,
          });
        } catch (profileError) {
          logCreateOrder.warn("Failed to fill missing checkout profile (non-fatal)", {
            err: profileError as Record<string, unknown>,
          });
        }
      }

      // Fire-and-forget: order_created event — emitted immediately after order is persisted.
      // emitAnalyticsEvent() never throws; errors are caught + logged inside.
      if (createdOrderNow)
        void emitAnalyticsEvent({
          consent: trackingConsent,
          event_id: randomUUID(),
          type: "order_created",
          payload: {
            orderId: order.id,
            totalPaise,
            subtotalPaise,
            discountAmountPaise,
            discountCode: body.discountCode ?? null,
            shippingCostPaise,
            taxAmountPaise,
            shippingMethod: body.shippingMethod,
            productIds,
          },
          occurredAt: new Date(),
        });

      const paymentLinkExpiresAt = getPaymentLinkDeadline({
        cartDeadlines: reservableCartDeadlines,
        paymentStartedAt: order.placedAt,
      });
      if (!isPaymentLinkDeadlineUsable(paymentLinkExpiresAt)) {
        return c.json(
          availabilityError(
            "RESERVATION_EXPIRED",
            reservableProductIds[0] ?? productIds[0] ?? "unknown",
          ),
          409,
        );
      }

      // ── Inventory + account-bag payment claim ───────────────────────────
      // The old path trusted browser-supplied tokens and updated only products.
      // This command locks the authenticated account's exact bag rows, verifies
      // that every product still carries those holds, re-signs the new payment
      // expiry, writes the order reservation, and marks the rows payment_pending
      // as one guarded SQL statement.
      const paymentClaims = reservableProductIds.flatMap((productId) => {
        const currentReservationToken = ownedReservationTokens.get(productId);
        if (!currentReservationToken) return [];
        return [
          {
            currentReservationToken,
            paymentReservationToken: createReservationToken({
              productId,
              reservedUntil: paymentLinkExpiresAt,
            }),
            productId,
          },
        ];
      });
      const paymentRestorations = paymentClaims.flatMap((claim) => {
        const cartDeadline = cartDeadlineByProductId.get(claim.productId);
        if (!cartDeadline) return [];
        return [
          {
            cartDeadline,
            paymentReservationToken: claim.paymentReservationToken,
            productId: claim.productId,
            restorationReservationToken: createReservationToken({
              productId: claim.productId,
              reservedUntil: cartDeadline,
            }),
          },
        ];
      });
      // The claim's liveness checks take a clock read right here. The order's
      // placedAt was stamped after the handler's `now`, and its ten-minute cap
      // must never be judged against that earlier instant.
      const claimNow = new Date();
      const reservedRows =
        paymentClaims.length === reservableProductIds.length
          ? await startPaymentForOwnedCartItems({
              items: paymentClaims,
              now: claimNow,
              orderId: order.id,
              reservedUntil: paymentLinkExpiresAt,
              userId: authUserOrResponse.id,
            })
          : [];

      if (reservedRows.length !== reservableProductIds.length) {
        // A retry can reach this point after the cart was already upgraded to
        // payment_pending. Bare-marking that order failed would invalidate a
        // possibly-live provider link while leaving its inventory hold alive.
        // Keep ambiguous state pending for exact expiry reconciliation.
        //
        // An order created by this request that claimed nothing is different:
        // it has no hold and no link, so leaving it pending only counted
        // against the pending cap and offered Repay for pieces it never held.
        // The guard refuses the write if anything was attached meanwhile.
        const markedFailed =
          createdOrderNow && reservedRows.length === 0
            ? await db
                .update(orders)
                .set({ paymentStatus: "failed", updatedAt: new Date() })
                .where(
                  and(
                    eq(orders.id, order.id),
                    eq(orders.userId, authUserOrResponse.id),
                    eq(orders.paymentStatus, "pending"),
                    isNull(orders.razorpayOrderId),
                    sql`not exists (select 1 from ${reservations} where ${reservations.orderId} = ${orders.id})`,
                  ),
                )
                .returning({ id: orders.id })
            : [];
        await addOrderEvent(order.id, "Checkout reservation failed", "pending", {
          markedFailed: markedFailed.length > 0,
          requestedProductIds: reservableProductIds,
          reservedProductIds: reservedRows.map((row) => row.productId),
        });

        return c.json(
          availabilityError("PRODUCT_RESERVED", reservableProductIds[0] ?? "unknown"),
          409
        );
      }

      revalidateProductsCache(reservedRows.map((row) => row.slug));

      const resolveDefinitiveUnpaidAttempt = async (cleanupNow: Date) => {
        const result = await releasePaymentCartItems({
          items: paymentRestorations,
          now: cleanupNow,
          orderId: order.id,
          reservedUntil: paymentLinkExpiresAt,
          userId: authUserOrResponse.id,
        });
        const changedSlugs = [
          ...new Set([...result.releasedSlugs, ...result.restoredSlugs]),
        ];
        if (changedSlugs.length > 0) revalidateProductsCache(changedSlugs);
        return result;
      };

      // `expire_by` is a whole Unix second. If the exact capped deadline can no
      // longer be represented as a future second, do not call Razorpay at all.
      // The provider outcome is therefore definitive and the exact local claim
      // can be restored/released atomically.
      const providerCreateStartedAt = new Date();
      if (!isPaymentLinkDeadlineUsable(paymentLinkExpiresAt, providerCreateStartedAt)) {
        const cleanup = await resolveDefinitiveUnpaidAttempt(
          providerCreateStartedAt,
        );
        if (cleanup.kind !== "released" && cleanup.kind !== "already_failed") {
          c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
          return c.json(checkoutInProgressBody, 503);
        }
        return c.json(
          availabilityError(
            "RESERVATION_EXPIRED",
            reservableProductIds[0] ?? productIds[0] ?? "unknown",
          ),
          409,
        );
      }

      let paymentLink: RazorpayPaymentLinkResponse;
      try {
        paymentLink = await createRazorpayPaymentLink({
          amountPaise: totalPaise,
          callbackUrl: `${getServerOrigin(c.req.url)}/api/v2/payments/payment-link/callback?orderId=${order.id}`,
          customer: {
            contact: body.shippingAddress.phone,
            email: emailLower,
            name: shippingName,
          },
          description: toPaymentDescription(order.id, normalizedItems),
          expireBy: paymentLinkExpiresAt,
          notes: {
            orderId: order.id,
            userId: authUserOrResponse.id,
            ...(checkoutAttemptId ? { checkoutAttemptId } : {}),
            ...(checkoutAttemptId ? { cartFingerprint: serverCartFingerprint } : {}),
          },
          referenceId: getRazorpayPaymentLinkReferenceId(order.id),
        });
      } catch (error) {
        if (isRazorpayAuthError(error)) {
          // A 401 is a definitive rejection: Razorpay did not create a link,
          // so the exact payment claim can be safely unwound now.
          const releaseResult = await resolveDefinitiveUnpaidAttempt(new Date());
          if (
            releaseResult.kind !== "released" &&
            releaseResult.kind !== "already_failed"
          ) {
            await addOrderEvent(
              order.id,
              "Razorpay authentication rejection cleanup deferred",
              "pending",
              { cleanupResult: releaseResult.kind },
            );
            c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
            return c.json(
              {
                code: "CHECKOUT_IN_PROGRESS",
                message:
                  "Payment was not started, but checkout cleanup is still being verified. Please try again shortly.",
              },
              503,
            );
          }
          return c.json(
            {
              code: "RAZORPAY_AUTH_FAILED",
              message: "Razorpay authentication failed.",
            },
            401
          );
        }

        /*
         * Anything else is ambiguous until the unique reference answers: a
         * timeout may hide a link Razorpay created, and notified the customer
         * about, that this server never saw. An open link for this order is
         * reused. A validation rejection (400) is definitive only when the
         * lookup confirms no link exists; then the exact claim is unwound to
         * the original cart deadline. Every other outcome keeps the hold
         * protected with no new link until reconciliation resolves it, since
         * releasing could double-sell a link that is already payable.
         */
        const recovery = await recoverPaymentLinkByReference(order).catch(
          () => ({ kind: "unresolved" as const }),
        );
        if (recovery.kind !== "open") {
          if (recovery.kind === "absent" && isRazorpayBadRequest(error)) {
            logCreateOrder.error("Razorpay rejected the payment link request", {
              err: error as Record<string, unknown>,
            });
            const releaseResult = await resolveDefinitiveUnpaidAttempt(new Date());
            if (
              releaseResult.kind !== "released" &&
              releaseResult.kind !== "already_failed"
            ) {
              await addOrderEvent(
                order.id,
                "Razorpay payment link rejection cleanup deferred",
                "pending",
                { cleanupResult: releaseResult.kind },
              );
              c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
              return c.json(
                {
                  code: "CHECKOUT_IN_PROGRESS",
                  message:
                    "Payment was not started, but checkout cleanup is still being verified. Please try again shortly.",
                },
                503,
              );
            }
            return c.json(
              {
                code: "RAZORPAY_PAYMENT_LINK_REJECTED",
                message:
                  "We could not start the payment. You have not been charged. Please try again.",
              },
              502,
            );
          }

          logCreateOrder.error("Razorpay payment link creation outcome unknown", {
            err: error as Record<string, unknown>,
          });
          await addOrderEvent(
            order.id,
            "Razorpay payment link creation outcome unknown",
            "pending",
            { releaseDeferred: true, retryable: true },
          );
          c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
          return c.json(
            {
              code: "RAZORPAY_PAYMENT_LINK_CREATE_UNKNOWN",
              message:
                "Your secure payment link is still being checked. Please try again shortly.",
            },
            503,
          );
        }
        paymentLink = recovery.paymentLink;
      }

      await db
        .update(orders)
        .set({
          razorpayOrderId: paymentLink.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      await addOrderEvent(order.id, "Razorpay payment link created", "pending", {
        paymentLinkId: paymentLink.id,
        paymentLinkUrl: paymentLink.short_url,
      });

      // Payment reliability: remember this attempt → order/link mapping so a
      // retry/abort/refresh of the same checkout reuses it instead of creating a
      // duplicate. Recorded only after success, so a failed create leaves no
      // marker. Best-effort; never blocks the response.
      if (checkoutAttemptId) {
        try {
          await recordPaymentAttempt({
            attemptId: checkoutAttemptId,
            cartFingerprint: serverCartFingerprint,
            userId: authUserOrResponse.id,
            orderId: order.id,
            paymentLinkId: paymentLink.id,
            paymentLinkUrl: paymentLink.short_url,
            amountPaise: totalPaise,
            currency: "INR",
            expiresAt: paymentLinkExpiresAt,
          });
        } catch (attemptErr) {
          logCreateOrder.warn("Failed to record checkout attempt (non-fatal)", {
            err: attemptErr as Record<string, unknown>,
          });
        }
      }

      return c.json(
        {
          amountPaise: totalPaise,
          amount: totalPaise,
          currency: "INR",
          orderAccessToken: createOrderAccessToken(order.id),
          order_id: paymentLink.id,
          orderId: order.id,
          paymentLinkId: paymentLink.id,
          paymentLinkUrl: paymentLink.short_url,
          razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
          razorpayOrderId: paymentLink.id,
        },
        200
      );
    }
  );

  // Repay an unpaid/failed order. Security posture:
  //   - auth required + rate limited + host guard (no live payments on unsafe hosts)
  //   - owner-scoped (admin | userId match | guest-email claim) — same rule as GET order
  //   - only pending/failed orders (never re-charge paid/refunded)
  //   - amount is the ORDER's existing Razorpay link amount (never client-supplied):
  //     we re-surface the order's already-created payment link instead of minting a
  //     new one, which keeps the amount server-authoritative, avoids Razorpay's
  //     duplicate reference_id conflict, and reuses the verified callback.
  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/repay",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Repay payment link" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
        404: { content: { "application/json": { schema: errorSchema } }, description: "Order not found" },
        409: { content: { "application/json": { schema: errorSchema } }, description: "Not repayable" },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const rateLimited = await rateLimitResponse(
        c.req.raw,
        `payment:repay:${authUserOrResponse.id}`,
        { limit: 10, requireDurable: true, windowSeconds: 60 }
      );
      if (rateLimited) return rateLimited;

      const hostGuard = evaluatePaymentHost(c.req.url);
      if (!hostGuard.allowed) {
        return c.json(
          { code: "PAYMENT_HOST_NOT_ALLOWED", message: "Payments are not available on this domain." },
          403
        );
      }

      const { id } = c.req.valid("param");
      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      const isAdmin = authUserOrResponse.role === "admin";
      const isOwner = order.userId === authUserOrResponse.id;
      const sessionEmail = authUserOrResponse.email ?? null;
      const isEmailClaim =
        order.userId === null &&
        order.shippingEmail !== null &&
        sessionEmail !== null &&
        order.shippingEmail.toLowerCase() === sessionEmail.toLowerCase();
      if (!isAdmin && !isOwner && !isEmailClaim) {
        return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
      }

      if (order.paymentStatus === "paid") {
        return c.json({ code: "ALREADY_PAID", message: "This order is already paid." }, 409);
      }
      if (order.paymentStatus === "refunded") {
        return c.json({ code: "ORDER_REFUNDED", message: "This order has been refunded." }, 409);
      }
      /*
       * Repay only re-surfaces a link while the order still owns its exact
       * live hold. A failed order's pieces were already restored or released,
       * and a provider link can outlive the server deadline, so handing it out
       * after that point would open a payment window the policy forbids.
       */
      if (
        order.paymentStatus !== "pending" ||
        !order.userId ||
        !order.razorpayOrderId
      ) {
        return c.json(paymentWindowExpiredBody, 409);
      }
      const liveHold = await getLivePaymentHoldForOrder({
        now: new Date(),
        orderId: order.id,
        userId: order.userId,
      });
      if (!liveHold) {
        return c.json(paymentWindowExpiredBody, 409);
      }

      let link: RazorpayPaymentLinkResponse;
      try {
        link = await fetchRazorpayPaymentLink(order.razorpayOrderId);
      } catch {
        return c.json(paymentWindowExpiredBody, 409);
      }

      if (link.status === "paid") {
        return c.json(
          { code: "ALREADY_PAID", message: "Payment was already received for this order — please refresh." },
          409
        );
      }
      // accept_partial is off, so only a still-created link is payable.
      if (link.status != null && link.status !== "created") {
        return c.json(paymentWindowExpiredBody, 409);
      }

      return c.json(
        {
          expiresAt: liveHold.expiresAt.toISOString(),
          orderId: order.id,
          paymentLinkUrl: link.short_url,
        },
        200,
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/verify",
      request: {
        body: {
          content: {
            "application/json": { schema: verifyPaymentSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Payment verified" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = normalizeVerifyPaymentBody(c.req.valid("json"));
      const order = await getOrder(body.orderId);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      if (order.userId !== authUserOrResponse.id) {
        return c.json({ code: "FORBIDDEN", message: "Order does not belong to this user." }, 403);
      }

      if (order.razorpayOrderId !== body.razorpayOrderId) {
        return c.json(
          { code: "ORDER_ID_MISMATCH", message: "Payment does not match this order." },
          400
        );
      }

      const isValid = verifyPaymentSignature({
        orderId: body.razorpayOrderId,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
      });
      if (!isValid) {
        return c.json({ code: "INVALID_SIGNATURE", message: "Payment verification failed." }, 400);
      }

      if (order.paymentStatus === "paid" && order.paymentId === body.razorpayPaymentId) {
        return c.json(
          {
            orderId: body.orderId,
            status: order.status,
            verified: true,
          },
          200
        );
      }

      let payment: Awaited<ReturnType<typeof fetchRazorpayPayment>>;
      try {
        payment = await fetchRazorpayPayment(body.razorpayPaymentId);
        const paymentFailure = validateFetchedPayment(order, payment, body.razorpayOrderId);
        if (paymentFailure) {
          return c.json(
            { code: paymentFailure.code, message: paymentFailure.message },
            paymentFailure.status
          );
        }

        const orderFailure = await validateFetchedOrder(order, body.razorpayOrderId);
        if (orderFailure) {
          return c.json(
            { code: orderFailure.code, message: orderFailure.message },
            orderFailure.status
          );
        }
      } catch (error) {
        logCreateOrder.error("Razorpay payment verification fetch failed", { err: error as Record<string, unknown> });
        return c.json(
          {
            code: "RAZORPAY_VERIFICATION_UNAVAILABLE",
            message: "Unable to verify payment with Razorpay.",
          },
          502
        );
      }

      try {
        await completePaidOrder({
          orderId: body.orderId,
          paidAt: paidAtFromUnixSeconds(payment.created_at),
          paymentId: body.razorpayPaymentId,
          paymentMethod: payment.method ?? "razorpay_checkout",
          paymentReference: body.razorpayOrderId,
          source: "Razorpay checkout verification",
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PRODUCT_SOLD") {
          return c.json(
            {
              code: "INVENTORY_CONFLICT",
              message: "Payment is verified, but inventory needs manual review.",
            },
            409
          );
        }
        throw error;
      }

      return c.json(
        {
          orderId: body.orderId,
          status: "confirmed",
          verified: true,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/status",
      request: {
        query: paymentStatusQuerySchema,
      },
      responses: {
        200: { description: "Payment status" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const order = await getOrder(query.orderId);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      const authUser = c.get("authUser");
      const sessionEmail = authUser?.email ?? null;
      const canView =
        (authUser?.role === "admin") ||
        (authUser?.id != null && order.userId === authUser.id) ||
        (order.userId === null &&
          order.shippingEmail != null &&
          sessionEmail != null &&
          order.shippingEmail.toLowerCase() === sessionEmail.toLowerCase()) ||
        (query.key != null && verifyOrderAccessToken(order.id, query.key));

      if (!canView) {
        return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
      }

      return c.json(
        {
          canDownloadReceipt: order.paymentStatus === "paid",
          orderId: order.id,
          orderStatus: order.status,
          paidAt: order.paidAt?.toISOString?.() ?? null,
          paymentStatus: order.paymentStatus,
          retryAfterSeconds: order.paymentStatus === "pending" ? 3 : null,
          updatedAt: order.updatedAt?.toISOString?.() ?? null,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/payment-link/callback",
      request: {
        query: paymentLinkCallbackSchema,
      },
      responses: {
        302: { description: "Redirects to checkout confirmation" },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      // Never put a caller-supplied order id or an access token into an error
      // redirect. This endpoint is public because Razorpay calls it; an order
      // key is minted only after the signed callback is bound to the exact
      // provider link and deterministic order reference below.
      const failureUrl = getOrderConfirmationUrl(c.req.url, undefined, "review");

      if (
        !query.razorpay_payment_id ||
        !query.razorpay_payment_link_id ||
        !query.razorpay_payment_link_reference_id ||
        !query.razorpay_payment_link_status ||
        !query.razorpay_signature
      ) {
        return c.redirect(failureUrl.toString());
      }

      let order = query.orderId ? await getOrder(query.orderId) : null;
      order ??= await findOrderByRazorpayReference(query.razorpay_payment_link_id);

      if (!order) {
        return c.redirect(failureUrl.toString());
      }

      const signedByRazorpay = verifyPaymentLinkSignature({
        paymentId: query.razorpay_payment_id,
        paymentLinkId: query.razorpay_payment_link_id,
        paymentLinkReferenceId: query.razorpay_payment_link_reference_id,
        paymentLinkStatus: query.razorpay_payment_link_status,
        signature: query.razorpay_signature,
      });
      const callbackMatchesOrder =
        order.razorpayOrderId === query.razorpay_payment_link_id &&
        query.razorpay_payment_link_reference_id ===
          getRazorpayPaymentLinkReferenceId(order.id);

      if (!signedByRazorpay || !callbackMatchesOrder) {
        await addOrderEvent(order.id, "Razorpay payment link signature rejected", order.status, {
          paymentLinkId: query.razorpay_payment_link_id,
          paymentLinkStatus: query.razorpay_payment_link_status,
        });
        return c.redirect(failureUrl.toString());
      }

      const redirectUrl = getOrderConfirmationUrl(c.req.url, order.id);

      if (query.razorpay_payment_link_status !== "paid") {
        await addOrderEvent(order.id, "Razorpay payment link not paid", order.status, {
          paymentLinkId: query.razorpay_payment_link_id,
          paymentLinkStatus: query.razorpay_payment_link_status,
        });
        redirectUrl.searchParams.set("payment", query.razorpay_payment_link_status);
        return c.redirect(redirectUrl.toString());
      }

      let payment: Awaited<ReturnType<typeof fetchRazorpayPayment>>;
      try {
        const [paymentLink, fetchedPayment] = await Promise.all([
          fetchRazorpayPaymentLink(query.razorpay_payment_link_id),
          fetchRazorpayPayment(query.razorpay_payment_id),
        ]);
        payment = fetchedPayment;

        const paymentLinkFailure = validateFetchedPaymentLink(
          order,
          paymentLink,
          query.razorpay_payment_link_id
        );
        const paymentFailure = validateFetchedPayment(order, payment);
        const failure = paymentLinkFailure ?? paymentFailure;
        if (failure) {
          await addOrderEvent(order.id, "Razorpay payment link verification rejected", order.status, {
            code: failure.code,
            paymentId: query.razorpay_payment_id,
            paymentLinkId: query.razorpay_payment_link_id,
          });
          redirectUrl.searchParams.set("payment", "review");
          return c.redirect(redirectUrl.toString());
        }
      } catch (error) {
        logPaymentLinkCallback.error("Unable to verify Razorpay payment link", { err: error as Record<string, unknown> });
        redirectUrl.searchParams.set("payment", "review");
        return c.redirect(redirectUrl.toString());
      }

      try {
        await completePaidOrder({
          orderId: order.id,
          paidAt: paidAtFromUnixSeconds(payment.created_at),
          paymentId: query.razorpay_payment_id,
          paymentMethod: payment.method ?? "razorpay_payment_link",
          paymentReference: query.razorpay_payment_link_id,
          source: "Razorpay payment link callback",
        });
        redirectUrl.searchParams.set("payment", "paid");
      } catch (error) {
        logPaymentLinkCallback.error("Unable to complete order", { err: error as Record<string, unknown> });
        redirectUrl.searchParams.set("payment", "review");
      }

      return c.redirect(redirectUrl.toString());
    }
  );
};
