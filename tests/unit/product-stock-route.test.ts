import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicProductStockBySlugMock = vi.hoisted(() => vi.fn());
const getProductBySlugMock = vi.hoisted(() => vi.fn());
const isInventoryV2Mock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/products", () => ({
  bulkSetProductTags: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  deriveQuantityAvailable: vi.fn(),
  duplicateProduct: vi.fn(),
  getProduct: vi.fn(),
  getProductBySlug: getProductBySlugMock,
  getProductsByIds: vi.fn(),
  getPublicProductStockBySlug: getPublicProductStockBySlugMock,
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
  updateProductsBatch: vi.fn(),
}));

vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: vi.fn(),
  bulkRemoveProductsFromCollection: vi.fn(),
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

vi.mock("@/lib/config/flags", () => ({
  isInventoryV2: isInventoryV2Mock,
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/data/products", () => ({
  getTimedPublicProductBySlug: getProductBySlugMock,
}));

import { registerProductRoutes } from "@/api/hono/routes/products";
import { createRouteHarness } from "../helpers/route-harness";

const stockRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  quantityAvailable: 1,
  reservedUntil: null,
  slug: "powder-blue-georgette-saree",
  stockStatus: "available" as const,
  updatedAt: new Date("2026-06-24T07:00:00.000Z"),
};

const publicProductRow = {
  id: stockRow.id,
  artisanId: "private-artisan-id",
  attributes: { weave: "private structured attributes" },
  collectionId: "private-collection-id",
  createdAt: new Date("2026-06-20T07:00:00.000Z"),
  detailsCondition: "Excellent",
  detailsDesigner: "FTT",
  detailsFabric: "Georgette",
  detailsLength: "6.1m",
  detailsWidth: "44in",
  featured: true,
  metadata: { internalNote: "never public" },
  name: "Powder Blue Georgette Saree",
  originalPricePaise: 1800000,
  pricePaise: 1200000,
  quantityAvailable: 7,
  reservedUntil: new Date("2999-01-01T00:00:00.000Z"),
  slug: stockRow.slug,
  soldAt: null,
  status: "published" as const,
  stockStatus: "reserved" as const,
  storyEra: "1990s",
  storyNarrative: "A public story.",
  storyProvenance: "Private trunk",
  storyTitle: "A public title",
  typeId: "private-type-id",
  updatedAt: stockRow.updatedAt,
  collection: {
    id: "private-collection-id",
    createdAt: new Date("2026-06-19T07:00:00.000Z"),
    description: "Public collection copy.",
    featured: true,
    heroMediaId: "private-hero-media-id",
    name: "Powder Blues",
    rules: [{ type: "tag", value: "blue" }],
    slug: "powder-blues",
    updatedAt: new Date("2026-06-19T07:00:00.000Z"),
  },
  images: [
    {
      sortOrder: 0,
      media: {
        id: "private-media-id",
        alt: "Saree drape",
        blurDataUrl: "private-blur",
        createdAt: new Date("2026-06-19T07:00:00.000Z"),
        filename: "powder-blue.jpg",
        filesize: 12345,
        height: 1200,
        key: "private/storage/key.jpg",
        metadata: { private: true },
        mimeType: "image/jpeg",
        updatedAt: new Date("2026-06-19T07:00:00.000Z"),
        url: "https://cdn.example.com/powder-blue.jpg",
        width: 900,
      },
    },
  ],
  tags: [
    {
      id: 1,
      createdAt: new Date("2026-06-19T07:00:00.000Z"),
      name: "Zari",
      slug: "zari",
      updatedAt: new Date("2026-06-19T07:00:00.000Z"),
    },
  ],
};

describe("GET /products/:slug/stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isInventoryV2Mock.mockReturnValue(false);
    getPublicProductStockBySlugMock.mockResolvedValue(stockRow);
  });

  it("returns a lightweight public stock payload instead of the full product", async () => {
    const harness = createRouteHarness({ register: registerProductRoutes });

    const response = await harness.request("/powder-blue-georgette-saree/stock");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=5");
    expect(response.headers.get("server-timing")).toMatch(/^route-total;dur=/);
    expect(payload).toEqual({
      id: stockRow.id,
      reservedUntil: null,
      slug: stockRow.slug,
      stockStatus: "available",
      updatedAt: "2026-06-24T07:00:00.000Z",
    });
    expect(payload.images).toBeUndefined();
    expect(payload.tags).toBeUndefined();
    expect(getProductBySlugMock).not.toHaveBeenCalled();
  });

  it("uses the product row as canonical stock when inventory v2 is enabled", async () => {
    isInventoryV2Mock.mockReturnValue(true);
    getPublicProductStockBySlugMock.mockResolvedValue({
      ...stockRow,
      reservedUntil: new Date("2999-01-01T00:00:00.000Z"),
      stockStatus: "reserved",
    });
    const harness = createRouteHarness({ register: registerProductRoutes });

    const response = await harness.request("/powder-blue-georgette-saree/stock");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stockStatus).toBe("reserved");
  });

  it("treats expired reservations as available", async () => {
    getPublicProductStockBySlugMock.mockResolvedValue({
      ...stockRow,
      reservedUntil: new Date("2026-01-01T00:00:00.000Z"),
      stockStatus: "reserved",
    });
    const harness = createRouteHarness({ register: registerProductRoutes });

    const response = await harness.request("/powder-blue-georgette-saree/stock");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stockStatus).toBe("available");
  });
});

describe("GET /products/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProductBySlugMock.mockResolvedValue(publicProductRow);
  });

  it("serializes only public storefront fields", async () => {
    const harness = createRouteHarness({ register: registerProductRoutes });

    const response = await harness.request("/powder-blue-georgette-saree");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        id: publicProductRow.id,
        name: publicProductRow.name,
        slug: publicProductRow.slug,
        stockStatus: "reserved",
        updatedAt: "2026-06-24T07:00:00.000Z",
      }),
    );
    expect(payload.metadata).toBeUndefined();
    expect(payload.attributes).toBeUndefined();
    expect(payload.quantityAvailable).toBeUndefined();
    expect(payload.reservedUntil).toBeUndefined();
    expect(payload.collectionId).toBeUndefined();
    expect(payload.typeId).toBeUndefined();
    expect(payload.artisanId).toBeUndefined();

    expect(payload.collection).toEqual({
      description: "Public collection copy.",
      name: "Powder Blues",
      slug: "powder-blues",
    });
    expect(payload.collection.id).toBeUndefined();
    expect(payload.collection.rules).toBeUndefined();

    expect(payload.images[0]).toEqual({
      alt: "Saree drape",
      filename: "powder-blue.jpg",
      height: 1200,
      sortOrder: 0,
      url: "https://cdn.example.com/powder-blue.jpg",
      width: 900,
    });
    expect(payload.images[0].key).toBeUndefined();
    expect(payload.images[0].metadata).toBeUndefined();
    expect(payload.images[0].mimeType).toBeUndefined();

    expect(payload.tags).toEqual([{ name: "Zari", slug: "zari" }]);
    expect(payload.tags[0].id).toBeUndefined();
  });
});
