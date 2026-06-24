import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HonoBindings } from "@/api/hono/types";

const listProductsMock = vi.hoisted(() => vi.fn());
const getProductBySlugMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/products", () => ({
  bulkSetProductTags: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  deriveQuantityAvailable: vi.fn(),
  duplicateProduct: vi.fn(),
  getProduct: vi.fn(),
  getProductBySlug: getProductBySlugMock,
  getProductsByIds: vi.fn(),
  getPublicProductStockBySlug: vi.fn(),
  listProducts: listProductsMock,
  updateProduct: vi.fn(),
  updateProductsBatch: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  refreshProductEmbedding: vi.fn(),
}));

vi.mock("@/lib/ai/recommendations", () => ({
  recommendProducts: vi.fn(),
}));

vi.mock("@/lib/ai/tag-suggestions", () => ({
  suggestTagIds: vi.fn(),
}));

// P4-06: products route now imports collections for bulk ops; mock to avoid DB connection
vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: vi.fn(),
  bulkRemoveProductsFromCollection: vi.fn(),
}));

vi.mock("@/lib/config/flags", () => ({
  isInventoryV2: vi.fn().mockReturnValue(false),
}));

import { registerProductRoutes } from "@/api/hono/routes/products";

const productRoutes = () => {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", null);
    await next();
  });
  registerProductRoutes(app);
  return app;
};

const sampleProduct = {
  id: "product-1",
  artisanId: null,
  attributes: {},
  collectionId: null,
  createdAt: new Date("2026-06-20T07:00:00.000Z"),
  detailsCondition: null,
  detailsDesigner: null,
  detailsFabric: null,
  detailsLength: null,
  detailsWidth: null,
  featured: false,
  images: [],
  metadata: null,
  name: "Published Saree",
  originalPricePaise: null,
  pricePaise: 1200000,
  quantityAvailable: 1,
  reservedUntil: null,
  slug: "published-saree",
  soldAt: null,
  status: "published",
  stockStatus: "available",
  storyEra: null,
  storyNarrative: null,
  storyProvenance: null,
  storyTitle: "Published story",
  typeId: null,
  updatedAt: new Date("2026-06-24T07:00:00.000Z"),
  collection: null,
  tags: [],
};

describe("public product API draft visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_API_SECRET;
    listProductsMock.mockResolvedValue({ rows: [sampleProduct], totalCount: 1 });
    getProductBySlugMock.mockResolvedValue(sampleProduct);
  });

  it("ignores includeDrafts=true for anonymous list requests", async () => {
    const response = await productRoutes().request("/?includeDrafts=true");

    expect(response.status).toBe(200);
    expect(listProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeDrafts: false })
    );
  });

  it("honors includeDrafts=true only for admin-secret list requests", async () => {
    process.env.ADMIN_API_SECRET = "test-admin-secret";

    const response = await productRoutes().request("/?includeDrafts=true", {
      headers: { authorization: "Bearer test-admin-secret" },
    });

    expect(response.status).toBe(200);
    expect(listProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeDrafts: true })
    );
  });

  it("does not expose drafts from the public product detail route", async () => {
    const response = await productRoutes().request("/draft-saree");

    expect(response.status).toBe(200);
    expect(getProductBySlugMock).toHaveBeenCalledWith("draft-saree", {
      includeDrafts: false,
    });
  });
});
