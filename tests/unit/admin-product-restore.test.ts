/**
 * A refunded saree stays Sold until an admin restores it explicitly.
 *
 * Refunds no longer touch inventory (restock-product.test.ts guards that). The
 * only way back to the shelf is the admin product editor's PATCH, sent after
 * the piece has physically returned and been checked. These tests pin that
 * path to an explicit admin action.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getProductMock = vi.hoisted(() => vi.fn());
const updateProductMock = vi.hoisted(() => vi.fn());
const isInventoryV2Mock = vi.hoisted(() => vi.fn());
const refreshProductEmbeddingMock = vi.hoisted(() => vi.fn());
const revalidateProductsCacheMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/products", () => ({
  bulkSetProductTags: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  deriveQuantityAvailable: (stockStatus: string) =>
    stockStatus === "sold" ? 0 : 1,
  duplicateProduct: vi.fn(),
  getProduct: getProductMock,
  getProductsByIds: vi.fn(),
  getPublicProductStockByIds: vi.fn(),
  getPublicProductStockBySlug: vi.fn(),
  listProducts: vi.fn(),
  updateProduct: updateProductMock,
  updateProductsBatch: vi.fn(),
}));

vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: vi.fn(),
  bulkRemoveProductsFromCollection: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  refreshProductEmbedding: refreshProductEmbeddingMock,
}));

vi.mock("@/lib/ai/recommendations", () => ({
  recommendProducts: vi.fn(),
}));

vi.mock("@/lib/ai/tag-suggestions", () => ({
  suggestTagIds: vi.fn(),
}));

vi.mock("@/lib/cache/product-cache", () => ({
  revalidateProductsCache: revalidateProductsCacheMock,
}));

vi.mock("@/lib/config/flags", () => ({
  isInventoryV2: isInventoryV2Mock,
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/data/products", () => ({
  getTimedPublicProductBySlug: vi.fn(),
}));

import { registerProductRoutes } from "@/api/hono/routes/products";
import type { AuthUser } from "@/api/hono/types";
import { createRouteHarness } from "../helpers/route-harness";

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const refundedSoldProduct = {
  id: PRODUCT_ID,
  reservedUntil: null,
  slug: "maroon-chettinad-cotton",
  soldAt: new Date("2026-09-01T10:00:00.000Z"),
  stockStatus: "sold" as const,
};

const restoreAsViewer = (authUser: AuthUser | null) =>
  createRouteHarness({ authUser, register: registerProductRoutes }).request(
    `/${PRODUCT_ID}`,
    {
      body: JSON.stringify({ stockStatus: "available" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );

describe("restoring a refunded saree to the shelf", () => {
  beforeEach(() => {
    getProductMock.mockReset();
    updateProductMock.mockReset();
    isInventoryV2Mock.mockReset();
    refreshProductEmbeddingMock.mockReset();
    revalidateProductsCacheMock.mockReset();

    getProductMock.mockResolvedValue(refundedSoldProduct);
    updateProductMock.mockImplementation(
      async (id: string, input: Record<string, unknown>) => ({
        ...refundedSoldProduct,
        ...input,
        id,
      }),
    );
    isInventoryV2Mock.mockReturnValue(false);
    refreshProductEmbeddingMock.mockResolvedValue(undefined);
  });

  it("lets an admin make the piece available again explicitly", async () => {
    const response = await restoreAsViewer({
      email: "admin@example.com",
      id: "admin-1",
      role: "admin",
    });

    expect(response.status).toBe(200);
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    expect(updateProductMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.objectContaining({ stockStatus: "available" }),
    );
    // Storefront caches learn about the restoration straight away.
    expect(revalidateProductsCacheMock).toHaveBeenCalledWith([
      refundedSoldProduct.slug,
      refundedSoldProduct.slug,
    ]);
  });

  it("restores the one-of-one quantity with it under inventory v2", async () => {
    isInventoryV2Mock.mockReturnValue(true);

    const response = await restoreAsViewer({
      email: "admin@example.com",
      id: "admin-1",
      role: "admin",
    });

    expect(response.status).toBe(200);
    expect(updateProductMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.objectContaining({ quantityAvailable: 1, stockStatus: "available" }),
    );
  });

  it("refuses a signed-in customer", async () => {
    const response = await restoreAsViewer({
      email: "customer@example.com",
      id: "customer-1",
      role: "customer",
    });

    expect([401, 403]).toContain(response.status);
    expect(getProductMock).not.toHaveBeenCalled();
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request", async () => {
    const response = await restoreAsViewer(null);

    expect(response.status).toBe(401);
    expect(updateProductMock).not.toHaveBeenCalled();
  });
});
