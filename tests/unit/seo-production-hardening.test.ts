import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "p_available",
        name: "Available Saree",
        slug: "available-saree",
        status: "published",
        stockStatus: "available",
        pricePaise: 1250000,
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
        status: "published",
        stockStatus: "sold",
        pricePaise: 1250000,
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [{ media: { url: "/media/sold.webp" } }],
      },
      {
        id: "p_blouse_qa",
        name: "StretchFit Blouse",
        slug: "stretchfit-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 100,
        storyTitle: "Untitled Product",
        typeSlug: "blouse",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [{ media: { url: "/media/blouse-test.webp" } }],
        tags: [{ name: "Blouse", slug: "blouse" }],
      },
      {
        id: "p_blouse_real",
        name: "Cerise Silk Blouse",
        slug: "cerise-silk-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 99900,
        storyTitle: "Tailored silk blouse",
        typeSlug: "blouse",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [{ media: { url: "/media/cerise-blouse.webp" } }],
        tags: [{ name: "Blouse", slug: "blouse" }],
      },
    ],
    totalCount: 4,
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
    expect(urls).toContain("https://www.fromthetrunk.shop/contact");
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
    expect(urls).not.toContain(
      "https://www.fromthetrunk.shop/collection/stretchfit-blouse",
    );
    expect(urls).toContain(
      "https://www.fromthetrunk.shop/collection/cerise-silk-blouse",
    );
    expect(urls.some((url) => url.includes("?collection="))).toBe(false);
    expect(urls.some((url) => url.includes("localhost"))).toBe(false);
    expect(urls.some((url) => url.includes("vercel.app"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);

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
    expect(
      entries.some((entry) =>
        entry.images?.some((image) => image.includes("blouse-test.webp")),
      ),
    ).toBe(false);
    expect(
      entries.some((entry) =>
        entry.images?.some((image) => image.includes("cerise-blouse.webp")),
      ),
    ).toBe(true);
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

  it("keeps QA, placeholder, and one-rupee products out of SEO surfaces", async () => {
    const {
      isQaOrPlaceholderProduct,
      isQaTestProduct,
      isSeoEligibleProduct,
      productSeoRobots,
      shouldEmitProductJsonLd,
      shouldIncludeProductInSeo,
    } = await import("@/lib/seo/product-indexing");

    expect(
      shouldIncludeProductInSeo({
        name: "Gold Tissue Saree",
        slug: "gold-tissue-saree",
        status: "published",
        stockStatus: "available",
        pricePaise: 1250000,
      }),
    ).toBe(true);
    expect(
      isQaOrPlaceholderProduct({
        name: "StretchFit Blouse",
        slug: "stretchfit-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 100,
        storyTitle: "Untitled Product",
        typeSlug: "blouse",
      }),
    ).toBe(true);
    expect(
      isQaTestProduct({
        name: "Placeholder Blouse",
        slug: "placeholder-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 99900,
        storyTitle: "QA testing blouse",
        typeSlug: "blouse",
      }),
    ).toBe(true);
    expect(
      shouldIncludeProductInSeo({
        name: "StretchFit Blouse",
        slug: "stretchfit-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 100,
        storyTitle: "Untitled Product",
        typeSlug: "blouse",
      }),
    ).toBe(false);
    expect(
      isSeoEligibleProduct({
        name: "Cerise Silk Blouse",
        slug: "cerise-silk-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 99900,
        storyTitle: "Tailored silk blouse",
        typeSlug: "blouse",
      }),
    ).toBe(true);
    expect(
      shouldIncludeProductInSeo({
        name: "Cerise Silk Blouse",
        slug: "cerise-silk-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 99900,
        storyTitle: "Tailored silk blouse",
        typeSlug: "blouse",
      }),
    ).toBe(true);
    expect(
      productSeoRobots({
        name: "Cerise Silk Blouse",
        slug: "cerise-silk-blouse",
        status: "published",
        stockStatus: "available",
        pricePaise: 99900,
        storyTitle: "Tailored silk blouse",
        typeSlug: "blouse",
      }),
    ).toEqual({ index: true, follow: true });
    expect(
      shouldIncludeProductInSeo({
        name: "Gold Tissue Saree",
        slug: "gold-tissue-saree",
        status: "published",
        stockStatus: "sold",
        pricePaise: 1250000,
      }),
    ).toBe(false);
    expect(
      shouldEmitProductJsonLd({
        name: "Gold Tissue Saree",
        slug: "gold-tissue-saree",
        status: "published",
        stockStatus: "sold",
        pricePaise: 1250000,
      }),
    ).toBe(true);
    expect(
      productSeoRobots({
        name: "Gold Tissue Saree",
        slug: "gold-tissue-saree",
        status: "published",
        stockStatus: "sold",
        pricePaise: 1250000,
      }),
    ).toEqual({ index: true, follow: true });
    expect(
      productSeoRobots({
        name: "Untitled Product",
        slug: "untitled-product",
        status: "published",
        stockStatus: "available",
        pricePaise: 100,
      }),
    ).toEqual({ index: false, follow: true });
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
        { media: { url: "https://images.unsplash.com/photo-1" } },
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
    expect(jsonLd.itemCondition).toBe("https://schema.org/UsedCondition");
    expect(jsonLd.image).toEqual([
      "https://cdn.example.com/one.jpg",
      "https://www.fromthetrunk.shop/media/two.jpg",
    ]);
    expect(JSON.stringify(jsonLd)).not.toContain("unsplash");
    expect(offers.availability).toBe("https://schema.org/OutOfStock");
    expect(offers.url).toBe(
      "https://www.fromthetrunk.shop/collection/gold-tissue-saree",
    );
  });
});
