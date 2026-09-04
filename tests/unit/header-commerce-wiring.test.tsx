import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CommerceCountBadge,
  formatCommerceCount,
} from "@/components/layout/commerce-count-badge";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const layout = read("app/(site)/layout.tsx");
const serverHeader = read("components/layout/site-header-server.tsx");
const island = read("components/layout/site-header-commerce-controls.tsx");
const drawer = read("components/cart/cart-drawer.tsx");

describe("active header wiring", () => {
  it("renders SiteHeaderServer from the site layout", () => {
    expect(layout).toContain(
      'import { SiteHeaderServer } from "@/components/layout/site-header-server"',
    );
    expect(layout).toContain("<SiteHeaderServer />");
  });

  it("keeps SiteHeaderServer a server component", () => {
    expect(serverHeader.trimStart().startsWith('"use client"')).toBe(false);
    expect(serverHeader).not.toContain('"use client"');
  });

  it("mounts the commerce client island inside the header icon row", () => {
    expect(serverHeader).toContain(
      'import { SiteHeaderCommerceControls } from "@/components/layout/site-header-commerce-controls"',
    );
    expect(serverHeader).toContain("<SiteHeaderCommerceControls />");
    expect(island.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("does not mount the old monolithic header alongside the active one", () => {
    for (const source of [layout, serverHeader, island]) {
      expect(source).not.toContain("site-header-controls");
      expect(source).not.toContain('from "@/components/layout/site-header"');
      expect(source).not.toContain("<SiteHeader ");
      expect(source).not.toContain("<SiteHeader>");
    }
  });

  it("keeps the header's commerce island small — no catalogue or Drape Room imports", () => {
    expect(island).not.toContain("drape-room");
    expect(island).not.toContain("@/db");
    expect(island).not.toContain("setInterval");
    // The cart count comes from the persisted client store via CartDrawer,
    // never from a network call of the header's own.
    expect(island).not.toContain("/api/v2/cart");
  });

  it("wraps only the island in the extracted commerce providers", () => {
    expect(island).toContain(
      'import { CommerceProviders } from "@/components/providers"',
    );
    expect(island).toContain("<CommerceProviders>");
    // The guest-merge worker belongs to route-level Providers; mounting it here
    // would run the merge twice.
    expect(island).not.toContain("WishlistMergeOnLogin");
    expect(layout).not.toContain("CommerceProviders");
    expect(layout).not.toContain("QueryClientProvider");
    expect(layout).not.toContain("SessionProvider");
  });
});

describe("header cart control", () => {
  it("is a Sheet trigger button, not a link to /cart", () => {
    expect(drawer).toContain("<SheetTrigger asChild>");
    expect(drawer).toContain('type="button"');
    expect(island).not.toContain('href="/cart"');
    // The only /cart href in the drawer is the explicit full-bag action.
    expect(drawer.match(/href="\/cart"/g)).toHaveLength(1);
  });

  it("reuses the existing CartDrawer rather than a second drawer", () => {
    expect(island).toContain(
      'import { CartDrawer } from "@/components/cart/cart-drawer"',
    );
    expect(drawer).toContain('from "@/components/ui/sheet"');
    expect(island).not.toContain("SheetContent");
  });

  it("offers View full bag as the explicit route to /cart", () => {
    expect(drawer).toContain("View full bag");
    expect(drawer).toContain('<Link href="/cart" onClick={() => setOpen(false)}>');
  });

  it("preserves the add-to-cart animation hooks", () => {
    expect(drawer).toContain("data-ftt-cart-target");
    expect(drawer).toContain("data-ftt-cart-count");

    const commerceRow = read("components/product/product-card-commerce-row.tsx");
    expect(commerceRow).toContain('querySelector<HTMLElement>("[data-ftt-cart-target]")');
    expect(commerceRow).toContain('querySelector<HTMLElement>("[data-ftt-cart-count]")');
  });

  it("exposes a count-bearing accessible label", () => {
    expect(drawer).toContain("`Open bag, ${totalItems}");
    expect(drawer).toContain('"Open bag, empty"');
    expect(island).toContain("Wishlist, empty");
    expect(island).toContain("`Wishlist, ${wishlistCount} saved");
  });

  it("gives the drawer both a title and a description", () => {
    expect(drawer).toContain("<SheetTitle");
    expect(drawer).toContain("<SheetDescription");
  });
});

describe("cart auto-open", () => {
  it("has exactly one auto-open authority", () => {
    // The store-total effect is the single opener; the product-card event is
    // animation-only and must not open a second time.
    expect(drawer).not.toContain('addEventListener("ftt:cart-updated"');
    expect(drawer.match(/setOpen\(true\)/g)).toHaveLength(1);
  });

  it("records a baseline before opening so a persisted cart stays closed", () => {
    expect(drawer).toContain("if (previousTotalItems.current === null)");
    expect(drawer).toContain("if (totalItems > previousTotalItems.current)");
    expect(drawer).toContain("if (!hasHydrated) return;");
  });
});

describe("commerce count badge", () => {
  it("hides at zero and below", () => {
    expect(renderToStaticMarkup(<CommerceCountBadge count={0} />)).toBe("");
    expect(renderToStaticMarkup(<CommerceCountBadge count={-3} />)).toBe("");
  });

  it("renders small counts verbatim", () => {
    expect(renderToStaticMarkup(<CommerceCountBadge count={1} />)).toContain(">1<");
    expect(renderToStaticMarkup(<CommerceCountBadge count={12} />)).toContain(">12<");
  });

  it("caps above ninety-nine", () => {
    expect(formatCommerceCount(99)).toBe("99");
    expect(formatCommerceCount(100)).toBe("99+");
    expect(renderToStaticMarkup(<CommerceCountBadge count={250} />)).toContain(
      ">99+<",
    );
  });

  it("stays decorative — the count is announced by the control's label", () => {
    const html = renderToStaticMarkup(<CommerceCountBadge count={2} />);
    expect(html).toContain('aria-hidden="true"');
  });

  it("forwards the animation hook attribute", () => {
    const html = renderToStaticMarkup(
      <CommerceCountBadge count={2} data-ftt-cart-count />,
    );
    expect(html).toContain("data-ftt-cart-count");
  });

  it("is the single badge implementation for cart and wishlist", () => {
    for (const source of [drawer, island]) {
      expect(source).toContain("CommerceCountBadge");
    }
  });
});

describe("product card border lifecycle", () => {
  const commerceRow = read("components/product/product-card-commerce-row.tsx");
  const productCard = read("components/product/product-card.tsx");

  it("keeps the steady in-bag glow declarative, driven by the cart store", () => {
    expect(productCard).toContain('data-ftt-in-bag={inCart ? "true" : undefined}');
  });

  it("clears the imperative border attribute when the piece leaves the bag", () => {
    // Removal can happen from the drawer, the cart page, an expired reservation
    // or another tab — none of which run this component's own click handler.
    expect(commerceRow).toContain("if (inCart || state !== \"idle\") return;");
    expect(commerceRow).toContain(
      'rowRef.current?.closest<HTMLElement>("[data-ftt-product-card]")',
    );
    expect(commerceRow).toContain('card?.removeAttribute("data-ftt-cart-border")');
  });

  it("hands the glow back to data-ftt-in-bag once the added flash ends", () => {
    const addedTimer = commerceRow.slice(
      commerceRow.indexOf("}, ADDED_HOLD_MS);") - 320,
      commerceRow.indexOf("}, ADDED_HOLD_MS);"),
    );
    expect(addedTimer).toContain(
      'sourceCard?.removeAttribute("data-ftt-cart-border")',
    );
  });
});
