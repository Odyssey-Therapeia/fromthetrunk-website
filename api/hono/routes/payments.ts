import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createHash, randomUUID } from "crypto";
import { and, count, eq, gt, inArray, isNotNull, lt, or } from "drizzle-orm";
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
import { insertReservation, releaseReservationsByProducts } from "@/db/queries/reservations";
import { findDiscountByCode, toValidatedDiscount } from "@/db/queries/discounts";
import { getCollectionProductIds } from "@/db/queries/collections";
import { collections, orders, products, productTypes } from "@/db/schema";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { verifyReservationToken } from "@/lib/cart/reservation-token";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { GST_RATE } from "@/lib/config/order-pricing";
import { isInventoryV2 } from "@/lib/config/flags";
import { createOrderAccessToken, verifyOrderAccessToken } from "@/lib/orders/order-access-token";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import { validateOrderItemSelectedOptions } from "@/lib/orders/selected-options";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { validateDiscountCode } from "@/lib/discounts/validate";
import {
  findReusablePaymentOrder,
  recordPaymentAttempt,
} from "@/lib/payments/checkout-idempotency";
import { evaluatePaymentHost } from "@/lib/payments/payment-host-guard";
import {
  calculateOrderTotals,
  createRazorpayPaymentLink,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  fetchRazorpayPaymentLink,
  getRazorpayPaymentLinkReferenceId,
  isRazorpayAuthError,
  RAZORPAY_PAYMENT_LINK_HOLD_MINUTES,
  RAZORPAY_MIN_AMOUNT_PAISE,
  type RazorpayPaymentLinkResponse,
  verifyPaymentLinkSignature,
  verifyPaymentSignature,
} from "@/lib/payments/razorpay";
import { timed, timedRows } from "@/lib/perf/timed";

const logCreateOrder = createLogger("payments:create-order");
const logPaymentLinkCallback = createLogger("payments:payment-link-callback");
const CHECKOUT_IN_PROGRESS_RETRY_SECONDS = 2;
const ORDERS_IDEMPOTENCY_UNIQUE_INDEX = "orders_idempotency_key_unique";

const availabilityErrorMessages = {
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

const orderHoldStillValid = (order: OrderWithRelations, nowMs = Date.now()) =>
  order.createdAt.getTime() + RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000 > nowMs;

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

const resolveClaimedCheckoutAttempt = async ({
  attemptId,
  cartFingerprint,
  userId,
}: {
  attemptId: string;
  cartFingerprint: string;
  userId: string;
}) => {
  const existing = await getOrderByIdempotencyKey(attemptId);
  if (!existing) {
    return { kind: "progress" as const };
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
  if (!orderHoldStillValid(existing)) {
    return { kind: "notReusable" as const };
  }
  if (!existing.razorpayOrderId) {
    return { kind: "progress" as const };
  }
  const paymentLinkUrl = paymentLinkUrlFromOrderEvents(existing);
  if (!paymentLinkUrl) {
    return { kind: "progress" as const };
  }
  return {
    kind: "reusable" as const,
    response: reusableOrderResponse(existing, paymentLinkUrl),
  };
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
      const reservationTokenByProductId = new Map(
        body.items.map((item) => [
          item.productId,
          verifyReservationToken(item.reservationToken),
        ]),
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
      const now = new Date();
      const validReservationTokens = new Map<string, Date>();
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
            orderHoldStillValid(claimedOrder) &&
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

        if (product.stockStatus === "sold") {
          return c.json(availabilityError("PRODUCT_SOLD", productId, product.name), 409);
        }

        const reservationToken = reservationTokenByProductId.get(productId);
        if (reservationToken && reservationToken.reservedUntil <= now) {
          return c.json(
            availabilityError("RESERVATION_EXPIRED", productId, product.name),
            409
          );
        }

        const isReserved = product.stockStatus === "reserved";
        const reservationExpired =
          isReserved &&
          (!product.reservedUntil || product.reservedUntil <= now);
        if (reservationExpired) {
          return c.json(
            availabilityError("RESERVATION_EXPIRED", productId, product.name),
            409
          );
        }

        const isActiveReserved =
          isReserved && product.reservedUntil != null && product.reservedUntil > now;
        const hasMatchingReservationToken =
          reservationToken != null &&
          reservationToken.productId === productId &&
          reservationToken.reservedUntil > now &&
          product.reservedUntil != null &&
          Math.abs(product.reservedUntil.getTime() - reservationToken.reservedUntil.getTime()) <
            1000;
        const activeReservationBelongsToAttempt =
          isActiveReserved && checkoutAttemptId
            ? await isClaimedCheckoutAttemptProduct(productId)
            : false;

        if (isActiveReserved && !reservationToken && !activeReservationBelongsToAttempt) {
          return c.json(
            availabilityError("PRODUCT_RESERVED", productId, product.name),
            409
          );
        }

        if (isActiveReserved && !hasMatchingReservationToken && !activeReservationBelongsToAttempt) {
          return c.json(
            availabilityError("RESERVATION_CONFLICT", productId, product.name),
            409
          );
        }

        if (isActiveReserved && reservationToken) {
          validReservationTokens.set(productId, reservationToken.reservedUntil);
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

      if (checkoutAttemptId) {
        const reusable = await findReusablePaymentOrder({
          attemptId: checkoutAttemptId,
          cartFingerprint: serverCartFingerprint,
          userId: authUserOrResponse.id,
        });
        if (reusable) {
          return c.json(reusable, 200);
        }
      }

	      // Cap check: max 3 live pending payment links per authenticated customer.
	      // Race window exists; durable limiting is P2-06.
	      const linkExpiryMs = RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000;
	      const pendingCount = await timedRows("payments.createOrder.pendingCount", () =>
	        db
          .select({ c: count() })
          .from(orders)
	          .where(
	            and(
	              eq(orders.userId, authUserOrResponse.id),
	              eq(orders.paymentStatus, "pending"),
	              gt(orders.createdAt, new Date(Date.now() - linkExpiryMs))
	            )
          ),
	      );
      if ((pendingCount[0]?.c ?? 0) >= 3) {
        return c.json(
          {
            code: "TOO_MANY_PENDING_ORDERS",
            message: "Too many pending orders for this email.",
          },
          429
        );
      }

      let order: OrderWithRelations;
      try {
        order = await timed("payments.createOrder.createOrder", () => createOrder({
          cartFingerprint: checkoutAttemptId ? serverCartFingerprint : null,
          idempotencyKey: checkoutAttemptId,
          items: normalizedItems,
          paymentGateway: "razorpay",
          paymentStatus: "pending",
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
        }));
      } catch (error) {
        if (!checkoutAttemptId || !isOrderIdempotencyConflict(error)) {
          throw error;
        }

        const resolution = await resolveClaimedCheckoutAttempt({
          attemptId: checkoutAttemptId,
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
        c.header("Retry-After", String(CHECKOUT_IN_PROGRESS_RETRY_SECONDS));
        return c.json(checkoutInProgressBody, 409);
      }

      // Fire-and-forget: order_created event — emitted immediately after order is persisted.
      // emitAnalyticsEvent() never throws; errors are caught + logged inside.
      void emitAnalyticsEvent({
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

      const reservedUntil = new Date(
        Date.now() + RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000
      );

      // ── Inventory claim ──────────────────────────────────────────────────
      // FLAG OFF (default): existing stock_status atomic claim — EXACTLY as before.
      // FLAG ON: insertReservation is now the atomic single-statement quantity
      //   pre-check (P4-05); it eliminates the read-then-insert window but is NOT
      //   the authoritative concurrency guard. Both flag states fall through to the
      //   stock_status UPDATE below, which is the authoritative concurrency guard
      //   in both flag states (see comment above that UPDATE).
      // Dual-write (quantity_available + reservations table) occurs in BOTH paths.

      if (isInventoryV2()) {
        // Pre-check: ensure quantity_available >= 1 for every product.
        // Throws "QUANTITY_INSUFFICIENT" if any product has qty=0.
        for (const productId of productIds) {
          try {
            await insertReservation({
              orderId: order.id,
              productId,
              qty: 1,
              expiresAt: reservedUntil,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === "QUANTITY_INSUFFICIENT") {
              // Clean up any reservations already inserted for earlier products
              await releaseReservationsByProducts(productIds.slice(0, productIds.indexOf(productId)));
              await db
                .update(orders)
                .set({ paymentStatus: "failed", updatedAt: new Date() })
                .where(eq(orders.id, order.id));
              return c.json(
                availabilityError("PRODUCT_RESERVED", productId),
                409
              );
            }
            throw err;
          }
        }
      }

      // Atomic stock_status claim (both flag OFF and flag ON use this as the
      // primary concurrency guard; it is unchanged from the pre-P2-05 code).
      const reservedRows = await db
        .update(products)
        .set({
          reservedUntil,
          stockStatus: "reserved",
          // Dual-write: quantity_available stays at 1 during reserve phase
          // (the reservation row tracks the hold; qty drops to 0 only on sold).
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(products.id, productIds),
            or(
              eq(products.stockStatus, "available"),
              and(
                eq(products.stockStatus, "reserved"),
                isNotNull(products.reservedUntil),
                lt(products.reservedUntil, now)
              ),
              ...Array.from(validReservationTokens.entries()).map(
                ([productId, reservedUntil]) =>
                  and(
                    eq(products.id, productId),
                    eq(products.stockStatus, "reserved"),
                    eq(products.reservedUntil, reservedUntil),
                  ),
              )
            )
          )
        )
        .returning({ id: products.id, slug: products.slug });

      if (reservedRows.length !== productIds.length) {
        const reservedProductIds = reservedRows.map((row) => row.id);
        if (reservedProductIds.length > 0) {
          await db
            .update(products)
            .set({
              reservedUntil: null,
              stockStatus: "available",
              updatedAt: new Date(),
            })
            .where(inArray(products.id, reservedProductIds));

          revalidateProductsCache(reservedRows.map((row) => row.slug));
        }

        // Dual-write: release any reservations rows we inserted in the v2 path
        if (isInventoryV2()) {
          await releaseReservationsByProducts(productIds);
        }

        await db
          .update(orders)
          .set({
            paymentStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        await addOrderEvent(order.id, "Checkout reservation failed", "pending", {
          requestedProductIds: productIds,
          reservedProductIds,
        });

        return c.json(
          availabilityError("PRODUCT_RESERVED", productIds[0] ?? "unknown"),
          409
        );
      }

      revalidateProductsCache(reservedRows.map((row) => row.slug));

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
          expireBy: reservedUntil,
          notes: {
            orderId: order.id,
            userId: authUserOrResponse.id,
	            ...(checkoutAttemptId ? { checkoutAttemptId } : {}),
	            ...(checkoutAttemptId ? { cartFingerprint: serverCartFingerprint } : {}),
	          },
          referenceId: getRazorpayPaymentLinkReferenceId(order.id),
        });
      } catch (error) {
        await db
          .update(products)
          .set({
            reservedUntil: null,
            stockStatus: "available",
            updatedAt: new Date(),
          })
          .where(inArray(products.id, productIds));
        revalidateProductsCache(productRows.map((product) => product.slug));

        // Dual-write: release reservation rows on Razorpay failure
        if (isInventoryV2()) {
          await releaseReservationsByProducts(productIds);
        }

        await db
          .update(orders)
          .set({ paymentStatus: "failed", updatedAt: new Date() })
          .where(eq(orders.id, order.id));

        if (isRazorpayAuthError(error)) {
          return c.json(
            {
              code: "RAZORPAY_AUTH_FAILED",
              message: "Razorpay authentication failed.",
            },
            401
          );
        }

        logCreateOrder.error("Razorpay payment link creation failed", { err: error as Record<string, unknown> });
        return c.json(
          {
            code: "RAZORPAY_PAYMENT_LINK_CREATE_FAILED",
            message: "Unable to create Razorpay payment link.",
          },
          500
        );
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
            expiresAt: reservedUntil,
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
      if (!order.razorpayOrderId) {
        return c.json(
          { code: "PAYMENT_WINDOW_EXPIRED", message: "This order's payment window has expired. Please reorder the pieces." },
          409
        );
      }

      let link: RazorpayPaymentLinkResponse;
      try {
        link = await fetchRazorpayPaymentLink(order.razorpayOrderId);
      } catch {
        return c.json(
          { code: "PAYMENT_WINDOW_EXPIRED", message: "This order's payment window has expired. Please reorder the pieces." },
          409
        );
      }

      if (link.status === "paid") {
        return c.json(
          { code: "ALREADY_PAID", message: "Payment was already received for this order — please refresh." },
          409
        );
      }
      if (link.status && link.status !== "created" && link.status !== "partially_paid") {
        return c.json(
          { code: "PAYMENT_WINDOW_EXPIRED", message: "This order's payment window has expired. Please reorder the pieces." },
          409
        );
      }

      return c.json({ orderId: order.id, paymentLinkUrl: link.short_url }, 200);
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
      const failureUrl = getOrderConfirmationUrl(c.req.url, query.orderId, "review");

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

      const redirectUrl = getOrderConfirmationUrl(c.req.url, order.id);
      const signedByRazorpay = verifyPaymentLinkSignature({
        paymentId: query.razorpay_payment_id,
        paymentLinkId: query.razorpay_payment_link_id,
        paymentLinkReferenceId: query.razorpay_payment_link_reference_id,
        paymentLinkStatus: query.razorpay_payment_link_status,
        signature: query.razorpay_signature,
      });

      if (!signedByRazorpay || order.razorpayOrderId !== query.razorpay_payment_link_id) {
        await addOrderEvent(order.id, "Razorpay payment link signature rejected", order.status, {
          paymentLinkId: query.razorpay_payment_link_id,
          paymentLinkStatus: query.razorpay_payment_link_status,
        });
        redirectUrl.searchParams.set("payment", "review");
        return c.redirect(redirectUrl.toString());
      }

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
