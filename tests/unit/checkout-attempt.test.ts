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

  // The server fingerprints these too (api/hono/routes/payments.ts). Missing
  // any of them kept a stale attempt id that the server refused as changed.
  it.each([
    ["name", { name: "B" }],
    ["phone", { phone: "+919876543210" }],
    ["line 2", { line2: "Flat 4" }],
    ["state", { state: "Karnataka" }],
    ["email", { email: "c@d.com" }],
    ["postal code", { postalCode: "560002" }],
    ["line 1", { line1: "L2" }],
    ["city", { city: "Town" }],
    ["country", { country: "US" }],
  ] satisfies Array<[string, Partial<Payload["shippingAddress"]>]>)(
    "changes when the delivery %s changes",
    (_label, addressChange) => {
      const base = payload();
      expect(
        computeCartFingerprint(
          payload({ shippingAddress: { ...base.shippingAddress, ...addressChange } }),
        ),
      ).not.toBe(computeCartFingerprint(base));
    },
  );

  it("changes when gift details change on a gift order", () => {
    const gift = computeCartFingerprint(
      payload({ giftFrom: "Asha", giftMessage: "Happy Onam", isGift: true }),
    );
    expect(gift).not.toBe(computeCartFingerprint(payload()));
    expect(
      computeCartFingerprint(
        payload({ giftFrom: "Ravi", giftMessage: "Happy Onam", isGift: true }),
      ),
    ).not.toBe(gift);
    expect(
      computeCartFingerprint(
        payload({ giftFrom: "Asha", giftMessage: "Happy Diwali", isGift: true }),
      ),
    ).not.toBe(gift);
  });

  it("ignores gift details the server drops from a non-gift order", () => {
    expect(
      computeCartFingerprint(payload({ giftFrom: "Asha", giftMessage: "Hi" })),
    ).toBe(computeCartFingerprint(payload()));
  });

  it("ignores case and spacing the server normalises away", () => {
    const base = payload({ discountCode: "SAVE10" });
    expect(
      computeCartFingerprint(
        payload({
          discountCode: " save10 ",
          shippingAddress: {
            ...base.shippingAddress,
            city: "  CITY ",
            email: "A@B.com",
            name: " a ",
          },
        }),
      ),
    ).toBe(computeCartFingerprint(base));
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
