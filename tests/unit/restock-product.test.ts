/**
 * A refund never restocks a one-of-one saree.
 *
 * A refunded piece may still be in transit, damaged, or already promised
 * elsewhere, so it stays Sold until an admin has checked it and restores it on
 * purpose (admin-product-restore.test.ts). The helper that used to flip a sold
 * product back to available during a refund is gone; these guards keep it
 * gone. The refund route's behaviour is proven in admin-orders-refund.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
  withRetry: (operation: () => Promise<unknown>) => operation(),
}));

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("refunds never restock a saree", () => {
  it("offers no automatic restock helper in the product queries", async () => {
    const productQueries = await import("@/db/queries/products");
    const exported = Object.keys(productQueries);

    expect(exported).not.toContain("restockProduct");
    // The admin editor's explicit write is the one way back to the shelf.
    expect(exported).toContain("updateProduct");
  });

  it("keeps both refund paths free of any restock call", () => {
    // The admin refund and Razorpay's refund.processed webhook.
    expect(source("api/hono/routes/admin-orders.ts")).not.toContain(
      "restockProduct",
    );
    expect(source("api/hono/routes/webhooks.ts")).not.toContain(
      "restockProduct",
    );
  });
});
