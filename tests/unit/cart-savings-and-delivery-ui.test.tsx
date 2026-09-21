import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartDeliveryEstimateCard } from "@/components/cart/cart-delivery-estimate-card";
import { CartSavingsBanner } from "@/components/cart/cart-savings-banner";
import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const drawer = read("components/cart/cart-drawer.tsx");
const cartPage = read("components/cart/cart-page-client.tsx");
const checkoutSummary = read("components/checkout/order-summary.tsx");
const deliveryCard = read("components/cart/cart-delivery-estimate-card.tsx");

describe("savings banner", () => {
  it("is hidden at zero, negative, and unknown savings", () => {
    expect(renderToStaticMarkup(<CartSavingsBanner savingsPaise={0} />)).toBe("");
    expect(renderToStaticMarkup(<CartSavingsBanner savingsPaise={-100} />)).toBe("");
    expect(
      renderToStaticMarkup(<CartSavingsBanner savingsPaise={Number.NaN} />),
    ).toBe("");
  });

  it("shows the formatted amount when savings exist", () => {
    const html = renderToStaticMarkup(<CartSavingsBanner savingsPaise={115_000} />);

    expect(html).toContain("saving");
    expect(html).toContain("1,150");
    expect(html).toContain(
      "Compared with the original listed prices of the selected pieces.",
    );
  });

  it("uses the project currency formatter, not raw paise", () => {
    const html = renderToStaticMarkup(<CartSavingsBanner savingsPaise={115_000} />);

    expect(html).not.toContain("115000");
    expect(html).toContain("₹");
  });

  it("renders a green treatment that does not rely on colour alone", () => {
    const html = renderToStaticMarkup(<CartSavingsBanner savingsPaise={5_000} />);

    expect(html).toContain("#E7F5EC");
    expect(html).toContain("#0F5132");
    expect(html).toContain("svg");
    expect(html).toContain("saving");
  });

  it("supports a compact drawer variant", () => {
    const drawerHtml = renderToStaticMarkup(
      <CartSavingsBanner savingsPaise={5_000} variant="drawer" />,
    );
    const pageHtml = renderToStaticMarkup(
      <CartSavingsBanner savingsPaise={5_000} variant="page" />,
    );

    expect(drawerHtml).not.toBe(pageHtml);
    expect(drawerHtml).toContain("p-3");
  });

  it("renders only when the current bag has genuine product savings", () => {
    expect(drawer).toContain("{hasSavings ? (");
    expect(drawer).toContain('kind="savings"');
    expect(cartPage.indexOf("<CartSavingsBanner")).toBeLessThan(
      cartPage.indexOf("<OrderSummaryPanel"),
    );

    // The full page keeps its prominent banner above the order summary. The
    // existing drawer UI keeps the same amount in its compact footer strip.
    expect(cartPage).toContain(
      "{hasHydrated && items.length > 0 ? (\n          <CartSavingsBanner",
    );
    expect(drawer).toContain("hasHydrated && savingsPaise > 0");
  });

  it("derives both surfaces from the same integer-paise totals", () => {
    for (const source of [drawer, cartPage]) {
      expect(source).toContain('from "@/lib/store/cart-store"');
      expect(source).toContain("getCartTotals(items)");
      expect(source).toContain("savingsPaise");
    }
  });

  it("keeps coupon savings out of the product markdown line", () => {
    // Coupons live only in the checkout summary's discount row.
    expect(drawer).not.toContain("discount.applied");
    expect(cartPage).not.toContain("discount.applied");
    expect(drawer).not.toContain("<DiscountField");
    expect(cartPage).not.toContain("<DiscountField");
    expect(checkoutSummary).toContain("Discount (");
  });
});

describe("delivery estimate", () => {
  it("keeps the agreed business copy", () => {
    expect(CART_DELIVERY_ESTIMATE.title).toBe("Estimated delivery");
    expect(CART_DELIVERY_ESTIMATE.shortLabel).toBe("7–10 days");
    expect(CART_DELIVERY_ESTIMATE.description).toBe(
      "Your order will be delivered in 7 to 10 days.",
    );
  });

  it("renders the card from the shared constant", () => {
    const html = renderToStaticMarkup(<CartDeliveryEstimateCard />);

    expect(html).toContain(CART_DELIVERY_ESTIMATE.title);
    expect(html).toContain("7–10 days");
    expect(html).toContain(CART_DELIVERY_ESTIMATE.description);
  });

  it("supports a compact drawer variant", () => {
    expect(
      renderToStaticMarkup(<CartDeliveryEstimateCard variant="drawer" />),
    ).not.toBe(renderToStaticMarkup(<CartDeliveryEstimateCard variant="page" />));
  });

  it("appears in the drawer and in the non-empty full cart", () => {
    // The drawer keeps its existing compact footer strip, including for an
    // empty bag; the full-page card is intentionally guarded by real items.
    expect(drawer).toContain('kind="delivery"');
    expect(cartPage).toContain("hasHydrated && hasItems ? (");
    expect(cartPage).toContain("<CartDeliveryEstimateCard variant=\"page\"");
  });

  it("has a single source of truth used by checkout too", () => {
    expect(drawer).toContain(
      'import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate"',
    );
    expect(drawer).toContain("CART_DELIVERY_ESTIMATE.title");
    expect(drawer).toContain("CART_DELIVERY_ESTIMATE.drawerLabel");
    expect(deliveryCard).toContain(
      'import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate"',
    );
    expect(cartPage).toContain(
      'from "@/components/cart/cart-delivery-estimate-card"',
    );
    expect(checkoutSummary).toContain(
      'import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate"',
    );
    expect(checkoutSummary).toContain("{CART_DELIVERY_ESTIMATE.description}");
  });

  it("has no contradictory duplicated delivery strings left in the tree", () => {
    const constants = read("lib/cart/delivery-estimate.ts");

    // The literal promise appears only in the shared constant.
    expect(constants).toContain("Your order will be delivered in 7 to 10 days.");
    for (const source of [drawer, cartPage, checkoutSummary, deliveryCard]) {
      expect(source).not.toContain(
        "Your order will be delivered in 7 to 10 days.",
      );
    }
  });

  it("stays an estimate, separate from shipping price and reservation copy", () => {
    const html = renderToStaticMarkup(<CartDeliveryEstimateCard />);

    expect(html.toLowerCase()).not.toContain("guarantee");
    expect(html).not.toContain("Free");
    expect(html.toLowerCase()).not.toContain("reserv");
    expect(html.toLowerCase()).not.toContain("return");
    expect(html).toContain("Estimated");
  });
});

describe("restock notify button", () => {
  const notify = read("components/product/restock-notify-button.tsx");

  it("pins brand colours instead of relying on theme accent tokens", () => {
    // The stock `outline` variant hovers to bg-accent/text-accent-foreground,
    // which the active admin theme resolves to two near-identical darks.
    expect(notify).toContain("hover:bg-[#601D1C]");
    expect(notify).toContain("hover:text-[#FDF7F1]");
    expect(notify).not.toContain("hover:bg-accent");
  });

  it("applies the same treatment to the registered state", () => {
    expect(notify).toContain("notifyButtonClass");
    expect(notify.match(/notifyButtonClass/g)!.length).toBeGreaterThanOrEqual(2);
    expect(notify).toContain("submitted &&");
    expect(notify).toContain("hover:bg-[#601D1C]/8");
  });

  it("still posts the restock intent to the shared endpoint", () => {
    expect(notify).toContain('fetch("/api/v2/wishlist/notify"');
    expect(notify).toContain('method: "POST"');
  });
});
