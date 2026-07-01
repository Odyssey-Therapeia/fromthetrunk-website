// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCheckoutAttempt,
  computeCartFingerprint,
  getCheckoutAttempt,
} from "@/lib/checkout/checkout-attempt";

type Payload = Parameters<typeof computeCartFingerprint>[0];

const payload = (over: Partial<Payload> = {}): Payload =>
  ({
    items: [{ productId: "p1", quantity: 1, selectedOptions: { size: "M" } }],
    shippingAddress: {
      name: "A",
      line1: "L1",
      city: "City",
      postalCode: "560001",
      country: "IN",
      email: "a@b.com",
    },
    shippingMethod: "standard",
    ...over,
  }) as Payload;

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("computeCartFingerprint", () => {
  it("is stable for the same cart", () => {
    expect(computeCartFingerprint(payload())).toBe(
      computeCartFingerprint(payload()),
    );
  });

  it("changes when a payment-relevant field changes", () => {
    const base = computeCartFingerprint(payload());
    expect(computeCartFingerprint(payload({ shippingMethod: "express" }))).not.toBe(base);
    expect(computeCartFingerprint(payload({ discountCode: "SAVE10" }))).not.toBe(base);
    expect(
      computeCartFingerprint(
        payload({
          items: [
            { productId: "p1", quantity: 1, selectedOptions: { size: "L" } },
          ],
        }),
      ),
    ).not.toBe(base);
    expect(
      computeCartFingerprint(
        payload({
          items: [{ productId: "p2", quantity: 1 }],
        }),
      ),
    ).not.toBe(base);
  });
});

describe("getCheckoutAttempt", () => {
  it("reuses the same attempt id across retries of the same cart", () => {
    const first = getCheckoutAttempt(payload());
    const retry = getCheckoutAttempt(payload());
    expect(retry.checkoutAttemptId).toBe(first.checkoutAttemptId);
  });

  it("mints a new attempt id when the cart changes", () => {
    const first = getCheckoutAttempt(payload());
    const changed = getCheckoutAttempt(payload({ shippingMethod: "express" }));
    expect(changed.checkoutAttemptId).not.toBe(first.checkoutAttemptId);
  });

  it("prefixes the attempt id with the cart fingerprint", () => {
    const attempt = getCheckoutAttempt(payload());
    expect(
      attempt.checkoutAttemptId.startsWith(`${attempt.cartFingerprint}-`),
    ).toBe(true);
  });

  it("clearCheckoutAttempt forces a fresh id", () => {
    const first = getCheckoutAttempt(payload());
    clearCheckoutAttempt();
    const next = getCheckoutAttempt(payload());
    expect(next.checkoutAttemptId).not.toBe(first.checkoutAttemptId);
  });
});
