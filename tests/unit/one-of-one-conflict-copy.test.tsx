import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrderSummary } from "@/components/checkout/order-summary";
import {
  getOneOfOneConflictCopy,
  type OneOfOneConflictCode,
} from "@/lib/checkout/one-of-one-conflict-copy";
import type { CartItem } from "@/lib/store/cart-store";

describe("one-of-one checkout conflict copy", () => {
  it("maps PRODUCT_RESERVED without saying bought", () => {
    const copy = getOneOfOneConflictCopy("PRODUCT_RESERVED");

    expect(copy.title).toBe("This saree is currently reserved");
    expect(copy.message).toContain("You have not been charged");
    expect(copy.message.toLowerCase()).not.toContain("bought");
    expect(copy.ctaHref).toBe("/collection");
    expect(copy.ctaLabel).toBe("Explore other sarees");
  });

  it("maps PRODUCT_SOLD to bought copy with no-charge reassurance", () => {
    const copy = getOneOfOneConflictCopy("PRODUCT_SOLD");

    expect(copy.title).toBe("This saree has just been bought");
    expect(copy.message).toContain("You have not been charged");
    expect(copy.ctaHref).toBe("/collection");
  });

  it.each([
    ["PRODUCT_UNAVAILABLE", "This piece is no longer available"],
    ["CHECKOUT_IN_PROGRESS", "We’re preparing your checkout"],
    ["PAYMENT_IN_PROGRESS", "Your payment is already in progress"],
    ["TOO_MANY_PENDING_ORDERS", "You already have pending checkouts"],
  ] satisfies Array<[OneOfOneConflictCode, string]>)(
    "maps %s to approved customer copy",
    (code, title) => {
      expect(getOneOfOneConflictCopy(code).title).toBe(title);
    },
  );

  it("keeps the shopper's own in-progress payment in the bag while blocking a second payment", () => {
    const copy = getOneOfOneConflictCopy("PAYMENT_IN_PROGRESS");

    // Not an unknown code falling back to the generic retry copy.
    expect(copy.code).toBe("PAYMENT_IN_PROGRESS");
    expect(copy.removeProduct).toBe(false);
    expect(copy.blockPayment).toBe(true);
    expect(copy.message).toContain("already in progress");
    // It is the shopper's own payment, never another shopper's claim.
    expect(copy.message.toLowerCase()).not.toContain("another shopper");
    expect(copy.message.toLowerCase()).not.toContain("no longer available");
    expect(copy.ctaHref).toBeUndefined();
  });

  it("removes a line only for codes that mean the piece is no longer the shopper's", () => {
    const removing = (
      [
        "CHECKOUT_ATTEMPT_NOT_REUSABLE",
        "CHECKOUT_CART_CHANGED",
        "CHECKOUT_IN_PROGRESS",
        "GENERIC_CREATE_ORDER_FAILURE",
        "INVALID_PRODUCT_IDS",
        "PAYMENT_IN_PROGRESS",
        "PRODUCT_RESERVED",
        "PRODUCT_SOLD",
        "PRODUCT_UNAVAILABLE",
        "RESERVATION_CONFLICT",
        "RESERVATION_EXPIRED",
        "TOO_MANY_PENDING_ORDERS",
      ] satisfies OneOfOneConflictCode[]
    ).filter((code) => getOneOfOneConflictCopy(code).removeProduct);

    expect(removing).toEqual([
      "INVALID_PRODUCT_IDS",
      "PRODUCT_RESERVED",
      "PRODUCT_SOLD",
      "PRODUCT_UNAVAILABLE",
      "RESERVATION_CONFLICT",
      "RESERVATION_EXPIRED",
    ]);
  });

  it("does not expose raw backend codes in customer copy", () => {
    const rawCodes = [
      "PRODUCT_RESERVED",
      "PRODUCT_SOLD",
      "PRODUCT_UNAVAILABLE",
      "CHECKOUT_IN_PROGRESS",
      "PAYMENT_IN_PROGRESS",
      "TOO_MANY_PENDING_ORDERS",
      "409",
    ];

    for (const code of rawCodes) {
      const copy = getOneOfOneConflictCopy(code);
      const visible = `${copy.title} ${copy.message} ${copy.ctaLabel}`;
      expect(visible).not.toContain("PRODUCT_");
      expect(visible).not.toContain("CHECKOUT_");
      expect(visible).not.toContain("409");
      expect(visible.toLowerCase()).not.toContain("backend");
    }
  });

  it("renders an inline aria-live message with the collection CTA", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        conflict={getOneOfOneConflictCopy("PRODUCT_RESERVED")}
        discount={{
          applied: null,
          code: "",
          error: null,
          isValidating: false,
          onApply: () => undefined,
          onCodeChange: () => undefined,
          onRemove: () => undefined,
        }}
        disabled={false}
        error={null}
        items={[
          {
            id: "product-1",
            image: "",
            name: "Silk Saree",
            price: 15000,
            quantity: 1,
          } satisfies CartItem,
        ]}
        onRemoveItem={() => undefined}
        shippingCost={0}
        shippingMethod="standard"
        subtotal={15000}
        taxAmount={0}
        taxRateLabel="0%"
        total={15000}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("This saree is currently reserved");
    expect(html).toContain("You have not been charged");
    expect(html).toContain('href="/collection"');
    expect(html).not.toContain("PRODUCT_RESERVED");
  });
});
