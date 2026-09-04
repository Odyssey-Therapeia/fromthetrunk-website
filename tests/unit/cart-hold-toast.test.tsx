import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CART_RESERVATION_MINUTES } from "@/lib/cart/reservation-policy";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const toastSource = read("lib/cart/reservation-toast.tsx");
/** JSX wraps mid-sentence, so match copy on collapsed whitespace. */
const toastCopy = toastSource.replace(/\s+/g, " ");
const pdpButton = read("components/cart/add-to-cart-button.tsx");
const productCard = read("components/product/product-card-commerce-row.tsx");
const pdpPage = read("app/(site)/collection/[slug]/page.tsx");

describe("add-to-cart hold toast", () => {
  it("derives the window from the reservation policy, never a literal", () => {
    expect(CART_RESERVATION_MINUTES).toBe(60);
    expect(toastSource).toContain(
      'import { CART_RESERVATION_MINUTES } from "@/lib/cart/reservation-policy"',
    );
    expect(toastSource).toContain("formatHoldWindow(CART_RESERVATION_MINUTES)");
    // The copy must not hardcode the duration next to the constant.
    expect(toastSource).not.toContain("for the next one hour");
  });

  it("emphasises the window with real markup, not asterisks", () => {
    expect(toastSource).toContain("<strong>{CART_HOLD_WINDOW_LABEL}</strong>");
  });

  it("says the piece stays for the window and to buy before it leaves", () => {
    expect(toastCopy).toContain("will stay in your cart for the next");
    expect(toastCopy).toContain(
      "so please complete your purchase before it leaves your bag.",
    );
  });

  it("fires from every add-to-cart surface", () => {
    // PDP, blouse, and Drape Room all route through AddToCartButton.
    expect(pdpButton).toContain("showAddedToCartToast({");
    // The product card previously showed no success toast at all.
    expect(productCard).toContain("showAddedToCartToast({");
  });

  it("uses the right noun for blouses", () => {
    for (const source of [pdpButton, productCard]) {
      expect(source).toContain('noun: isBlouse ? "blouse" : "saree"');
    }
  });

  it("is one shared implementation, not copy duplicated per surface", () => {
    for (const source of [pdpButton, productCard]) {
      expect(source).toContain(
        'from "@/lib/cart/reservation-toast"',
      );
      expect(source).not.toContain("will stay in your cart");
    }
  });
});

describe("restock notify is parked", () => {
  it("no longer renders on the PDP", () => {
    expect(pdpPage).toContain("Restock notify is parked");
    // The import is commented out, so nothing can render it.
    expect(pdpPage).toContain(
      '// import { RestockNotifyButton } from "@/components/product/restock-notify-button"',
    );
    expect(pdpPage).not.toMatch(
      /^import \{ RestockNotifyButton \}/m,
    );
  });

  it("leaves the sold and reserved notices in place", () => {
    expect(pdpPage).toContain("This piece has found its next wardrobe.");
    expect(pdpPage).toContain("This piece is currently reserved by another buyer.");
  });

  it("keeps the component and endpoint intact for a later re-enable", () => {
    expect(() => read("components/product/restock-notify-button.tsx")).not.toThrow();
    expect(read("api/hono/routes/wishlist.ts")).toContain('path: "/notify"');
  });
});
