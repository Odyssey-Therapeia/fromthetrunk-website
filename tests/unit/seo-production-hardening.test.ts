import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "p_available",
        name: "Available Saree",
        slug: "available-saree",
        stockStatus: "available",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [
          { media: { url: "/media/available-one.webp" } },
          { media: { url: "https://cdn.example.com/available-two.webp" } },
        ],
      },
      {
        id: "p_sold",
        name: "Sold Saree",
        slug: "sold-saree",
        stockStatus: "sold",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [{ media: { url: "/media/sold.webp" } }],
      },
    ],
    totalCount: 2,
  }),
}));

vi.mock("@/lib/ports/catalog-search", () => ({
  searchProducts: vi.fn(async (filters: { fabrics?: string[]; occasions?: string[] }) => {
    if (filters.fabrics?.includes("silk")) return { products: [], facets: {}, totalDocs: 5 };
    if (filters.occasions?.includes("festive")) return { products: [], facets: {}, totalDocs: 6 };
    return { products: [], facets: {}, totalDocs: 0 };
  }),
}));

vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: (media: unknown) => {
    if (
      media &&
      typeof media === "object" &&
      "media" in (media as Record<string, unknown>)
    ) {
      const inner = (media as Record<string, unknown>).media as Record<
        string,
        unknown
      >;
      if (inner && typeof inner.url === "string") return inner.url;
    }
    return typeof media === "string" ? media : null;
  },
}));

vi.mock("@/lib/products/display-details", () => ({
  getProductDisplayDetails: () => ({
    fabric: "Tissue silk",
    colorName: "Gold",
    care: [],
    condition: "Authenticated, restored",
    designer: null,
    length: "Standard saree drape",
    width: "Standard saree width",
  }),
}));

describe("SEO production hardening", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sitemap emits canonical URLs only and excludes filtered collection URLs plus sold products", async () => {
    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://www.fromthetrunk.shop/collection");
    expect(urls).toContain(
      "https://www.fromthetrunk.shop/collection/fabric/silk",
    );
    expect(urls).toContain(
      "https://www.fromthetrunk.shop/collection/occasion/festive",
    );
    expect(urls).toContain("https://www.fromthetrunk.shop/sell-your-saree");
    expect(urls).toContain(
      "https://www.fromthetrunk.shop/guides/what-is-a-pre-loved-saree",
    );
    expect(urls).toContain(
      "https://www.fromthetrunk.shop/collection/available-saree",
    );
    expect(urls).not.toContain(
      "https://www.fromthetrunk.shop/collection/sold-saree",
    );
    expect(urls.some((url) => url.includes("?collection="))).toBe(false);
    expect(urls.some((url) => url.includes("localhost"))).toBe(false);
    expect(urls.some((url) => url.includes("vercel.app"))).toBe(false);

    const availableEntry = entries.find((entry) =>
      entry.url.endsWith("/collection/available-saree"),
    );
    expect(availableEntry?.images).toEqual([
      "https://www.fromthetrunk.shop/media/available-one.webp",
      "https://cdn.example.com/available-two.webp",
    ]);
    expect(
      entries.some((entry) => entry.images?.some((image) => image.includes("sold.webp"))),
    ).toBe(false);
  });

  it("robots disallows private, API, checkout, cart, and search surfaces", async () => {
    const robots = (await import("@/app/robots")).default;
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = rules.disallow ?? [];

    expect(result.sitemap).toBe("https://www.fromthetrunk.shop/sitemap.xml");
    expect(disallow).toContain("/account/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/cart");
    expect(disallow).toContain("/checkout");
    expect(disallow).toContain("/search");
  });

  it("detects collection filter/query URLs for noindex,follow handling", async () => {
    const { hasCollectionFilterParams } = await import(
      "@/lib/seo/collection-filter"
    );

    expect(hasCollectionFilterParams(undefined)).toBe(false);
    expect(hasCollectionFilterParams({ fabric: "silk" })).toBe(true);
    expect(hasCollectionFilterParams({ fabric: ["", "cotton"] })).toBe(true);
  });

  it("product JSON-LD includes all image URLs, identifiers, and OutOfStock for sold products", async () => {
    const { productJsonLd } = await import("@/lib/seo/json-ld");
    const product = {
      id: "p1",
      name: "Gold Tissue Saree",
      slug: "gold-tissue-saree",
      storyNarrative: "A restored saree with provenance.",
      images: [
        { media: { url: "https://cdn.example.com/one.jpg" } },
        { media: { url: "/media/two.jpg" } },
      ],
      pricePaise: 1250000,
      stockStatus: "sold",
      storyProvenance: "Private trunk",
      detailsCondition: "Excellent",
      tags: [],
      collection: null,
    };

    const jsonLd = productJsonLd(product as never) as Record<string, unknown>;
    const offers = jsonLd.offers as Record<string, unknown>;

    expect(jsonLd.productID).toBe("p1");
    expect(jsonLd.sku).toBe("gold-tissue-saree");
    expect(jsonLd.image).toEqual([
      "https://cdn.example.com/one.jpg",
      "https://www.fromthetrunk.shop/media/two.jpg",
    ]);
    expect(offers.availability).toBe("https://schema.org/OutOfStock");
    expect(offers.url).toBe(
      "https://www.fromthetrunk.shop/collection/gold-tissue-saree",
    );
  });
});
