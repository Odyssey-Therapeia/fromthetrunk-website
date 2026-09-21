import crypto from "crypto";
import Razorpay from "razorpay";

import { isGstInclusive } from "@/lib/config/flags";
import { ENABLE_FREE_SHIPPING, ENABLE_GST, ENABLE_SHIPPING_CHARGES, GST_RATE, SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";
import { applyDiscountToPaise, type ValidatedDiscount } from "@/lib/discounts/validate";
import { isLiveRazorpayMode, isUnsafeLiveHost } from "@/lib/payments/payment-host-guard";
import { PAYMENT_LINK_HOLD_MINUTES } from "@/lib/cart/reservation-policy";

export const RAZORPAY_MIN_AMOUNT_PAISE = 100;
/** One number, shared with the data layer that has to bound the same window. */
export const RAZORPAY_PAYMENT_LINK_HOLD_MINUTES = PAYMENT_LINK_HOLD_MINUTES;
/**
 * Razorpay rejects a Payment Link whose expire_by is less than 15 minutes
 * away ("timestamp must be atleast 15 minutes in future"):
 * https://razorpay.com/docs/api/payments/payment-links/create-standard/
 */
export const RAZORPAY_PAYMENT_LINK_MIN_EXPIRY_MS = 15 * 60 * 1000;
/** Absorbs request latency and clock skew between this server and Razorpay. */
const RAZORPAY_PAYMENT_LINK_EXPIRY_MARGIN_MS = 60 * 1000;

let instance: Razorpay | null = null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

const readNumber = (value: unknown, key: string): number | null => {
  const record = asRecord(value);
  if (!record) return null;
  const raw = record[key];
  return typeof raw === "number" ? raw : null;
};

/** The SDK types statusCode as string | number. */
const readStatusCode = (value: unknown): number | null => {
  const raw = asRecord(value)?.statusCode;
  if (typeof raw === "number") return raw;
  return typeof raw === "string" && /^\d{3}$/.test(raw) ? Number(raw) : null;
};

export function isRazorpayAuthError(error: unknown): boolean {
  const directStatus = readNumber(error, "statusCode");
  const nestedStatus = readNumber(asRecord(error)?.error, "statusCode");
  return directStatus === 401 || nestedStatus === 401;
}

/**
 * Razorpay refused the request itself: a validation error, or a link whose
 * state no longer allows the change. Unlike a timeout, nothing happened.
 * Razorpay also labels 401s BAD_REQUEST_ERROR, so the status wins when present.
 */
export function isRazorpayBadRequest(error: unknown): boolean {
  const record = asRecord(error);
  const status = readStatusCode(error) ?? readStatusCode(record?.error);
  if (status != null) return status === 400;
  return asRecord(record?.error)?.code === "BAD_REQUEST_ERROR";
}

const timingSafeHexEqual = (expectedSignature: string, signature: string): boolean => {
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

export function getRazorpayInstance(): Razorpay {
  if (!instance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        "Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }

    instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return instance;
}

export type RazorpayPaymentLinkResponse = {
  amount?: number;
  amount_paid?: number;
  currency?: string;
  id: string;
  reference_id?: string;
  payments?: Array<{
    amount?: number | string;
    method?: string;
    payment_id?: string;
    plink_id?: string;
    status?: string;
  }> | {
    amount?: number | string;
    method?: string;
    payment_id?: string;
    plink_id?: string;
    status?: string;
  } | null;
  short_url: string;
  status?: string;
};

export type RazorpayPaymentResponse = {
  amount?: number;
  captured?: boolean;
  created_at?: number;
  currency?: string;
  id: string;
  method?: string;
  order_id?: null | string;
  status?: string;
};

export type RazorpayOrderResponse = {
  amount?: number;
  amount_paid?: number;
  currency?: string;
  id: string;
  status?: string;
};

export type CreateRazorpayPaymentLinkInput = {
  amountPaise: number;
  callbackUrl: string;
  customer: {
    contact?: string | null;
    email: string;
    name: string;
  };
  description: string;
  expireBy?: Date;
  notes?: Record<string, string>;
  referenceId: string;
};

export const getRazorpayPaymentLinkReferenceId = (orderId: string) =>
  `ftt_${orderId.replace(/-/g, "").slice(0, 32)}`;

const PRODUCTION_PAYMENT_HOST = "www.fromthetrunk.shop";

const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase();

export function shouldNotifyRazorpayCustomer({
  callbackUrl,
}: {
  callbackUrl: string;
}): boolean {
  if (!isLiveRazorpayMode()) return false;

  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return false;
  }

  const hostname = normalizeHostname(url.hostname);
  return (
    url.protocol === "https:" &&
    hostname === PRODUCTION_PAYMENT_HOST &&
    !isUnsafeLiveHost(url.host)
  );
}

export async function createRazorpayPaymentLink({
  amountPaise,
  callbackUrl,
  customer,
  description,
  expireBy,
  notes,
  referenceId,
}: CreateRazorpayPaymentLinkInput): Promise<RazorpayPaymentLinkResponse> {
  const razorpay = getRazorpayInstance();
  const now = Date.now();
  const serverDeadline =
    expireBy ?? new Date(now + RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000);
  /*
   * Only the provider link is floored to Razorpay's minimum. The database
   * holds keep the caller's deadline, and reconciliation cancels a link that
   * is still open once that deadline has passed.
   */
  const providerExpiresAt = Math.max(
    serverDeadline.getTime(),
    now + RAZORPAY_PAYMENT_LINK_MIN_EXPIRY_MS + RAZORPAY_PAYMENT_LINK_EXPIRY_MARGIN_MS,
  );
  const notifyCustomer = shouldNotifyRazorpayCustomer({ callbackUrl });

  const paymentLink = await razorpay.paymentLink.create({
    accept_partial: false,
    amount: amountPaise,
    callback_method: "get",
    callback_url: callbackUrl,
    currency: "INR",
    customer: {
      contact: customer.contact ?? undefined,
      email: customer.email,
      name: customer.name,
    },
    description,
    expire_by: Math.floor(providerExpiresAt / 1000),
    notes,
    notify: {
      email: notifyCustomer,
      sms: notifyCustomer && Boolean(customer.contact),
    },
    reference_id: referenceId,
    reminder_enable: notifyCustomer,
  });

  return paymentLink as RazorpayPaymentLinkResponse;
}

/**
 * Razorpay cancels only a link still in the "created" state; a paid or expired
 * link is refused with a 400, so callers re-read the link rather than infer.
 * https://razorpay.com/docs/api/payments/payment-links/cancel-standard/
 */
export async function cancelRazorpayPaymentLink(
  paymentLinkId: string,
): Promise<RazorpayPaymentLinkResponse> {
  const razorpay = getRazorpayInstance();
  return razorpay.paymentLink.cancel(paymentLinkId) as Promise<RazorpayPaymentLinkResponse>;
}

export async function fetchRazorpayPayment(
  paymentId: string
): Promise<RazorpayPaymentResponse> {
  const razorpay = getRazorpayInstance();
  return razorpay.payments.fetch(paymentId) as Promise<RazorpayPaymentResponse>;
}

export async function fetchRazorpayOrder(
  orderId: string
): Promise<RazorpayOrderResponse> {
  const razorpay = getRazorpayInstance();
  return razorpay.orders.fetch(orderId) as Promise<RazorpayOrderResponse>;
}

export async function fetchRazorpayOrderPayments(
  orderId: string
): Promise<RazorpayPaymentResponse[]> {
  const razorpay = getRazorpayInstance();
  const result = await razorpay.orders.fetchPayments(orderId);
  return (result.items ?? []) as RazorpayPaymentResponse[];
}

export async function fetchRazorpayPaymentLink(
  paymentLinkId: string
): Promise<RazorpayPaymentLinkResponse> {
  const razorpay = getRazorpayInstance();
  return razorpay.paymentLink.fetch(paymentLinkId) as Promise<RazorpayPaymentLinkResponse>;
}

/**
 * Recover a Payment Link when creation succeeded at Razorpay but its response
 * was lost before this server could persist the returned id and URL.
 *
 * Razorpay documents `reference_id` as a Fetch All filter and requires it to
 * be unique. The installed SDK forwards the parameter at runtime although its
 * pagination type has not caught up with that documented field.
 */
export type RazorpayPaymentLinkReferenceLookup =
  | { kind: "absent" }
  | { kind: "ambiguous" }
  | { kind: "found"; paymentLink: RazorpayPaymentLinkResponse };

/**
 * Distinguish a confirmed empty provider result from a malformed or duplicate
 * result. Expiry reconciliation may release a hold for the former, but must
 * defer the latter.
 */
export async function lookupRazorpayPaymentLinkByReferenceId(
  referenceId: string,
): Promise<RazorpayPaymentLinkReferenceLookup> {
  const razorpay = getRazorpayInstance();
  const list = razorpay.paymentLink.all as unknown as (params: {
    count: number;
    reference_id: string;
  }) => Promise<{ payment_links?: RazorpayPaymentLinkResponse[] }>;
  const result = await list.call(razorpay.paymentLink, {
    count: 2,
    reference_id: referenceId,
  });
  const returned = result.payment_links ?? [];
  if (returned.length === 0) return { kind: "absent" };

  const exact = returned.filter(
    (link) => link.reference_id === referenceId,
  );
  return exact.length === 1 && returned.length === 1
    ? { kind: "found", paymentLink: exact[0]! }
    : { kind: "ambiguous" };
}

export async function findRazorpayPaymentLinkByReferenceId(
  referenceId: string,
): Promise<RazorpayPaymentLinkResponse | null> {
  const result = await lookupRazorpayPaymentLinkByReferenceId(referenceId);
  return result.kind === "found" ? result.paymentLink : null;
}

/**
 * Verify Razorpay payment signature.
 * See: https://razorpay.com/docs/payments/server-integration/nodejs/payment-verification/
 */
export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return timingSafeHexEqual(expectedSignature, signature);
}

/**
 * Verify the redirect signature Razorpay sends after a Payment Link payment.
 */
export function verifyPaymentLinkSignature({
  paymentId,
  paymentLinkId,
  paymentLinkReferenceId,
  paymentLinkStatus,
  signature,
}: {
  paymentId: string;
  paymentLinkId: string;
  paymentLinkReferenceId: string;
  paymentLinkStatus: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) return false;

  const body = `${paymentLinkId}|${paymentLinkReferenceId}|${paymentLinkStatus}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return timingSafeHexEqual(expectedSignature, signature);
}

/**
 * Compute shipping cost in PAISE from a paise subtotal.
 *
 * This is the single shipping-cost rule used by every order-charge path. The
 * SHIPPING_TIERS values (freeThreshold, standard, express) are expressed in
 * rupees, so they are scaled to paise here. Free above the threshold.
 *
 * Both /api/v2/payments/create-order and /api/v2/orders MUST call this (via
 * calculateOrderTotals) so the customer-charged shipping is identical across
 * routes.
 */
export function toShippingCostPaise(
  subtotalPaise: number,
  shippingMethod: ShippingMethod = "standard"
): number {
  // LAUNCH: shipping is FREE. Gate kept so the original tiered charge below can
  // be restored by enabling ENABLE_SHIPPING_CHARGES.
  if (!ENABLE_SHIPPING_CHARGES) return 0;
  const freeThresholdPaise = SHIPPING_TIERS.freeThreshold * 100;
  if (ENABLE_FREE_SHIPPING && subtotalPaise >= freeThresholdPaise) return 0;
  return SHIPPING_TIERS[shippingMethod] * 100;
}

export type OrderTotals = {
  discountAmountPaise: number;
  shippingCostPaise: number;
  shippingMethod: ShippingMethod;
  subtotalPaise: number;
  taxAmountPaise: number;
  taxRate: number;
  totalPaise: number;
};

/**
 * The single source of truth for the amount a customer is charged.
 *
 * Both the payment-link route (api/hono/routes/payments.ts) and the order
 * route (api/hono/routes/orders.ts) MUST call this with the same inputs they
 * already compute (a paise subtotal + the requested shipping method). It owns
 * shipping (via toShippingCostPaise), GST, and the grand total so the three
 * persisted fields — subtotalPaise, taxAmountPaise, totalPaise — and the
 * Razorpay charge can never drift apart.
 *
 * P6-02 DISCOUNT ORDER (documented as required by packet):
 *
 *   Flag OFF (default / GST-exclusive):
 *     1. discountAmountPaise = applyDiscountToPaise(discountableSubtotalPaise, discount)
 *        — clamped so discountAmountPaise ≤ discountableSubtotalPaise.
 *        — When discount.collectionId is set, discountableSubtotalPaise is the sum
 *          of pricePaise*quantity ONLY for items in the collection (scoped base).
 *          When there is no scope, discountableSubtotalPaise === subtotalPaise.
 *     2. discountedSubtotal = subtotalPaise - discountAmountPaise
 *        — out-of-scope items are not discounted; they remain in subtotalPaise.
 *     3. shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod)
 *        — shipping is computed on the discounted subtotal so the free-shipping
 *          threshold is evaluated post-discount (industry-standard behaviour).
 *     4. taxAmountPaise = round(discountedSubtotal × GST_RATE)
 *        — GST is computed on the DISCOUNTED subtotal, not the original.
 *     5. totalPaise = max(0, discountedSubtotal + shippingCostPaise + taxAmountPaise)
 *
 *   Flag ON (GST-inclusive):
 *     1–2. Same discount computation on discountableSubtotalPaise.
 *     3. shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod)
 *     4. taxAmountPaise = round(discountedSubtotal × GST_RATE / (1 + GST_RATE))
 *        — backed out for display only; not added to total.
 *     5. totalPaise = max(0, discountedSubtotal + shippingCostPaise)
 *
 * INVARIANTS guaranteed:
 *   - discountAmountPaise ≤ discountableSubtotalPaise (clamp in applyDiscountToPaise)
 *   - totalPaise ≥ 0 (Math.max clamp)
 *   - The CLIENT never computes or sends the discount amount — only the CODE.
 *   - Collection-scoped discounts apply ONLY to the in-collection base, not the
 *     full subtotal. Out-of-scope items are never discounted.
 *
 * When FTT_FEATURE_GST_INCLUSIVE is "true":
 *   - pricePaise / subtotalPaise is treated as the all-in (GST-inclusive) price.
 *   - No GST is added on top; the GST component is backed OUT for display only.
 *
 * When the flag is OFF (default, every current environment):
 *   - taxAmountPaise = round(discountedSubtotal × rate)
 *   - totalPaise = discountedSubtotal + shippingCostPaise + taxAmountPaise
 *
 * totalPaise is never negative.
 *
 * @param discountableSubtotalPaise - The base on which the discount is applied.
 *   When a discount has a collectionId, the caller computes this as the sum of
 *   pricePaise*quantity for items IN the collection only. When there is no scope
 *   (discount.collectionId === null), the caller passes subtotalPaise here.
 *   If omitted, defaults to subtotalPaise (backward-compatible).
 */
export function calculateOrderTotals(
  subtotalPaise: number,
  shippingMethod: ShippingMethod = "standard",
  discount?: ValidatedDiscount,
  discountableSubtotalPaise?: number
): OrderTotals {
  // P6-02: Apply discount to the SCOPED discountable base.
  // When discount.collectionId is set, discountableSubtotalPaise is the sum of
  // in-collection item lines (computed by the route). When there is no scope,
  // or no discount at all, it equals subtotalPaise.
  const effectiveDiscountBase = discountableSubtotalPaise ?? subtotalPaise;
  // The discount amount is clamped to [0, effectiveDiscountBase] by applyDiscountToPaise,
  // so the reduction never exceeds the discountable portion.
  const discountAmountPaise = discount ? applyDiscountToPaise(effectiveDiscountBase, discount) : 0;
  // Apply discount against the FULL subtotal: out-of-scope items are still in the
  // total, they just don't receive the discount. Math.max(0,...) is a safety clamp
  // but discountAmountPaise ≤ effectiveDiscountBase ≤ subtotalPaise, so it is never negative.
  const discountedSubtotal = Math.max(0, subtotalPaise - discountAmountPaise);

  // Shipping is computed on the discounted subtotal: the buyer earns free shipping
  // based on what they actually pay, not the pre-discount price.
  const shippingCostPaise = toShippingCostPaise(discountedSubtotal, shippingMethod);

  let taxAmountPaise: number;
  let totalPaise: number;

  if (!ENABLE_GST) {
    // LAUNCH: GST removed — no tax component and nothing added to the total.
    // The inclusive/exclusive branches below are kept intact; restore by
    // enabling ENABLE_GST.
    taxAmountPaise = 0;
    totalPaise = Math.max(0, discountedSubtotal + shippingCostPaise);
  } else if (isGstInclusive()) {
    // Inclusive: back-calculate the GST component from the discounted all-in price
    // for transparency display only. No GST is added on top.
    taxAmountPaise = Math.round((discountedSubtotal * GST_RATE) / (1 + GST_RATE));
    totalPaise = Math.max(0, discountedSubtotal + shippingCostPaise);
  } else {
    // Exclusive (default): add GST on top of the DISCOUNTED subtotal.
    // GST is computed AFTER discount (not on the original subtotal).
    taxAmountPaise = Math.round(discountedSubtotal * GST_RATE);
    totalPaise = Math.max(0, discountedSubtotal + shippingCostPaise + taxAmountPaise);
  }

  return {
    discountAmountPaise,
    shippingCostPaise,
    shippingMethod,
    subtotalPaise,
    taxAmountPaise,
    taxRate: GST_RATE,
    totalPaise,
  };
}
