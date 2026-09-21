/**
 * The batched collection stock source and the surfaces reading it.
 *
 * Cards used to run the live hook with `enabled: false`, so a collection page
 * never saw a reservation change. The fix must not swing the other way into
 * one subscription per card.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/*
 * Cadence, visibility, offline, overlap, back-off, the seed fallback and the
 * malformed-answer rules are proven by running the provider in
 * collection-stock-polling.test.tsx. What stays here is structure that a
 * behavioural run cannot see.
 */
describe("collection stock source", () => {
  const hook = source("lib/realtime/use-collection-stock.tsx");

  it("asks for a whole grid in one request", () => {
    // The server decides ownership now, so this posts ids and reads verdicts.
    expect(hook).toContain("/api/v2/products/viewer-state");
    expect(hook).toContain("productIds:");
    // One request site for the whole grid, not one per card.
    expect(hook.match(/fetch\(/g)).toHaveLength(1);
    // One request per cycle, capped by the route's own shared limit rather
    // than a private chunk size.
    expect(hook).toContain("MAX_VIEWER_STATE_IDS");
    expect(hook).not.toContain("MAX_IDS_PER_REQUEST");
  });

  it("refreshes immediately on a local cart change", () => {
    // The shopper's own add or release must not wait for the next tick.
    expect(hook).toContain('window.addEventListener("ftt:cart-updated"');
  });

  it("ref-counts registrations so shared cards do not silence each other", () => {
    expect(hook).toContain("subscriberCounts");
    expect(hook).toContain("remaining <= 0");
  });

  it("does not re-register every card whenever one verdict changes", () => {
    expect(hook).toContain("const register = context?.register");
    expect(hook).toContain("[productId, register]");
    expect(hook).not.toContain("[context, productId]");
  });

  it("drops stale in-flight verdicts when the signed-in viewer changes", () => {
    expect(hook).toContain("requestViewerKey");
    expect(hook).toContain("viewerKeyRef.current !== requestViewerKey");
    expect(hook).toContain("stockSnapshot.viewerKey === viewerKey");
    expect(hook).toContain("announcement.viewerKey !== viewerKey");
  });
});

describe("batch stock endpoint", () => {
  const route = source("api/hono/routes/products.ts");

  it("is gone, so a grid's only batched answer is the viewer-state verdict", () => {
    // Nothing requested it, and it called a payment-protected lapsed hold
    // available, contradicting the verdict every card polls for. The HTTP
    // behaviour is proven in viewer-state-route.test.ts.
    expect(route).not.toContain('path: "/stock"');
    expect(route).not.toContain("products.stock-batch");
    expect(route).not.toContain("getPublicProductStockByIds");
    expect(route).toContain('path: "/viewer-state"');
  });
});

describe("product card availability", () => {
  const row = source("components/product/product-card-commerce-row.tsx");

  it("renders the server's verdict rather than inferring one", () => {
    // Ownership is decided where both facts live — the product's hold and this
    // shopper's own bag row.
    expect(row).toContain("useCollectionStock");
    expect(row).toContain("viewer.state");
    expect(row).not.toContain("resolveViewerAvailability");
  });

  it("never offers a saree another shopper is holding", () => {
    expect(row).toContain('viewerState === "reserved_by_other"');
    expect(row).toContain('viewerState === "sold"');
  });

  it("shows a release in flight instead of offering the piece again", () => {
    // The only state the client adds: the server cannot see a request that is
    // still travelling.
    expect(row).toContain('isReleasing ? "releasing"');
    expect(row).toContain("Releasing…");
  });

  it("gives the badge and the button the same verdict", () => {
    const card = source("components/product/product-card.tsx");
    expect(card).toContain("useCollectionStock");
    expect(card).toContain('viewerState === "reserved_by_other"');
    // Neither may infer ownership on its own; that is how the corner came to
    // read "Reserved" over an "In your bag" button.
    expect(card).not.toContain("resolveViewerAvailability");
  });
});

describe("drawer and checkout use canonical server state", () => {
  it("keeps no browser-side ownership resolver", () => {
    const drawer = source("components/cart/cart-drawer.tsx");
    const checkout = source("components/checkout/checkout-page-client.tsx");

    expect(drawer).not.toContain("resolveViewerAvailability");
    expect(checkout).not.toContain("resolveViewerAvailability");
    // One recheck request. The import of lib/commerce/viewer-state is not a
    // request and must not be counted as one.
    expect(checkout.match(/\/api\/v2\/products\/viewer-state/g)).toHaveLength(1);
    expect(checkout).not.toContain("/stock`");
  });
});
