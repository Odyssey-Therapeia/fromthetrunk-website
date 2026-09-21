"use client";

/**
 * Payment reliability: client-side checkout idempotency key.
 *
 * A `checkoutAttemptId` is a stable id for one payment attempt over a specific
 * cart/address/shipping/discount combination. It is sent to
 * `POST /api/v2/payments/create-order` (both as the `Idempotency-Key` header and
 * in the body) so a retry/abort/refresh of the SAME checkout reuses the first
 * order + Razorpay payment link instead of creating a duplicate pending order
 * and stock hold.
 *
 * The id is persisted in sessionStorage keyed by a fingerprint of the
 * payment-relevant request. When any payment-relevant field changes (items,
 * size, shipping method, discount, gift details, or the delivery name, contact
 * and address), the fingerprint changes and a fresh attempt id is minted. It is
 * cleared on a terminal success.
 */

import type { CheckoutOrderPayload } from "./use-checkout-payment";

const ATTEMPT_STORAGE_KEY = "ftt-checkout-attempt-v1";

export type CheckoutAttempt = {
  checkoutAttemptId: string;
  cartFingerprint: string;
};

// Deterministic, dependency-free 32-bit hash (djb2). Only used to detect
// payment-relevant changes — not for security.
function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the non-crypto fallback below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Same normalisation as the server's cart fingerprint, so an edit the server
// ignores (case, spacing) never mints an attempt it would treat as new.
const normalizeText = (value: null | string | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Fingerprint of everything that changes the resulting order/amount, so a real
 * change starts a new attempt but a pure retry keeps the same one.
 *
 * It covers every request field the server fingerprints. A field the server
 * compared but this one skipped (name, phone, line 2, state, gift details)
 * kept the old attempt id after an edit, so each retry came back as a changed
 * cart.
 */
export function computeCartFingerprint(payload: CheckoutOrderPayload): string {
  const items = payload.items
    .map(
      (item) =>
        `${item.productId}:${item.selectedOptions?.size ?? ""}:${item.quantity}`,
    )
    .sort()
    .join("|");
  const address = payload.shippingAddress;
  const isGift = Boolean(payload.isGift);
  const parts = [
    items,
    payload.shippingMethod ?? "",
    normalizeText(payload.discountCode),
    isGift ? "gift" : "",
    // The server drops gift details from a non-gift order.
    isGift ? normalizeText(payload.giftFrom) : "",
    isGift ? normalizeText(payload.giftMessage) : "",
    normalizeText(address.name),
    normalizeText(address.email),
    normalizeText(address.phone),
    normalizeText(address.line1),
    normalizeText(address.line2),
    normalizeText(address.city),
    normalizeText(address.state),
    normalizeText(address.postalCode),
    normalizeText(address.country),
  ];
  return stableHash(parts.join("~"));
}

/**
 * Returns the current attempt id for this payload, reusing the stored one when
 * the fingerprint is unchanged and minting a new one otherwise.
 */
export function getCheckoutAttempt(payload: CheckoutOrderPayload): CheckoutAttempt {
  const cartFingerprint = computeCartFingerprint(payload);
  const mint = (): CheckoutAttempt => ({
    cartFingerprint,
    checkoutAttemptId: `${cartFingerprint}-${randomId()}`,
  });

  if (typeof window === "undefined") return mint();

  try {
    const raw = window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CheckoutAttempt>;
      if (
        parsed.cartFingerprint === cartFingerprint &&
        typeof parsed.checkoutAttemptId === "string" &&
        parsed.checkoutAttemptId.length > 0
      ) {
        return {
          cartFingerprint,
          checkoutAttemptId: parsed.checkoutAttemptId,
        };
      }
    }
    const next = mint();
    window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    // Private mode / storage disabled — still return a usable (ephemeral) id.
    return mint();
  }
}

/** Clear the stored attempt after a terminal success so the next order is fresh. */
export function clearCheckoutAttempt(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  } catch {
    // non-fatal
  }
}
