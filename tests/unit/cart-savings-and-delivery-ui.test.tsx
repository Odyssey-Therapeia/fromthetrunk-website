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

  it("sits above the items in both surfaces and never in the empty state", () => {
    expect(drawer.indexOf("CartSavingsBanner")).toBeLessThan(
      drawer.indexOf("<CartItem item={item} />"),
    );
    expect(cartPage.indexOf("<CartSavingsBanner")).toBeLessThan(
      cartPage.indexOf("<OrderSummaryPanel"),
    );

    // Both guard on a non-empty, hydrated cart.
    expect(cartPage).toContain(
      "{hasHydrated && items.length > 0 ? (\n          <CartSavingsBanner",
    );
    expect(drawer).toContain("savingsPaise={savingsPaise} variant=\"drawer\"");
  });

  it("is one component shared by the drawer and the cart page", () => {
    for (const source of [drawer, cartPage]) {
      expect(source).toContain(
        'from "@/components/cart/cart-savings-banner"',
      );
    }
  });

  it("keeps coupon savings out of the product markdown line", () => {
    // Coupons live only in the checkout summary's discount row.
    expect(drawer).not.toContain("discount");
    expect(cartPage).not.toContain("discount");
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

  it("appears for a non-empty cart only, in drawer and cart page", () => {
    expect(drawer).toContain('<CartDeliveryEstimateCard variant="drawer" />');
    // Inside the non-empty branch, after the item list — never in the empty state.
    expect(drawer.indexOf("<CartDeliveryEstimateCard")).toBeGreaterThan(
      drawer.indexOf("Your bag is empty."),
    );
    expect(cartPage).toContain("hasHydrated && hasItems ? (");
    expect(cartPage).toContain("<CartDeliveryEstimateCard variant=\"page\"");
  });

  it("has a single source of truth used by checkout too", () => {
    for (const source of [drawer, cartPage]) {
      expect(source).toContain(
        'from "@/components/cart/cart-delivery-estimate-card"',
      );
    }
    expect(checkoutSummary).toContain(
      'import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate"',
    );
    expect(checkoutSummary).toContain("{CART_DELIVERY_ESTIMATE.description}");
  });

  it("has no contradictory duplicated delivery strings left in the tree", () => {
    const card = read("components/cart/cart-delivery-estimate-card.tsx");
    const constants = read("lib/cart/delivery-estimate.ts");

    // The literal promise appears only in the shared constant.
    expect(constants).toContain("Your order will be delivered in 7 to 10 days.");
    for (const source of [drawer, cartPage, checkoutSummary, card]) {
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
    expect(notify.match(/notifyButtonClass/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("still posts the restock intent to the shared endpoint", () => {
    expect(notify).toContain('fetch("/api/v2/wishlist/notify"');
    expect(notify).toContain('method: "POST"');
  });
});
