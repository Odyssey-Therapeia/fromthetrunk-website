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

describe("restock notify is live", () => {
  it("renders one live action on the PDP", () => {
    // AddToCartButton follows the live viewer verdict. Keeping a second,
    // server-rendered RestockNotifyButton here would show two Notify controls
    // for an initially reserved product.
    expect(pdpPage).not.toContain("RestockNotifyButton");
    expect(pdpButton).toContain('viewerState === "reserved_by_other"');
    expect(pdpButton).toContain('type: "notify-me"');
  });

  it("offers the wait only for a piece that can come back", () => {
    // A sold saree is gone for good; a held one is not. Both branches read the
    // server verdict, and Sold is decided before Notify me can be offered.
    const soldBranch = pdpButton.indexOf('if (viewerState === "sold") {');
    const notifyBranch = pdpButton.indexOf(
      'if (viewerState === "reserved_by_other") {',
    );
    expect(soldBranch).toBeGreaterThan(-1);
    expect(notifyBranch).toBeGreaterThan(soldBranch);
  });

  it("leaves the sold and reserved notices in place", () => {
    expect(pdpPage).toContain("This piece has found its next wardrobe.");
    expect(pdpPage).toContain("This piece is currently reserved by another buyer.");
    // Rendered from the live verdict, so the holder never reads the second.
    expect(pdpPage).toContain("<PdpAvailabilityNotice");
  });

  it("keeps the component and endpoint intact for a later re-enable", () => {
    expect(() => read("components/product/restock-notify-button.tsx")).not.toThrow();
    expect(read("api/hono/routes/wishlist.ts")).toContain('path: "/notify"');
  });
});
