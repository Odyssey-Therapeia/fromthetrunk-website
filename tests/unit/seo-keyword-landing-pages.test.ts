import { describe, expect, it, vi } from "vitest";

import {
  getKeywordLandingByTypeSlug,
  isKeywordLandingIndexable,
  keywordFaqJsonLd,
  keywordGuideJsonLd,
  keywordItemListJsonLd,
  keywordLandingMetadata,
  keywordLandingPages,
} from "@/lib/seo/keyword-landing-pages";
import { safeJsonLd } from "@/lib/seo/json-ld";

describe("keyword landing page architecture", () => {
  it("uses unique canonical paths", () => {
    const paths = keywordLandingPages.map((page) => page.canonicalPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses unique title and description pairs", () => {
    const titles = keywordLandingPages.map((page) => page.title);
    const descriptions = keywordLandingPages.map((page) => page.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("builds production-domain metadata for fabric landing pages", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const config = getKeywordLandingByTypeSlug("fabric", "silk");
    expect(config).toBeDefined();

    const metadata = keywordLandingMetadata(config!, 5);
    expect(metadata.alternates?.canonical).toBe(
      "https://www.fromthetrunk.shop/collection/fabric/silk",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(JSON.stringify(metadata)).not.toContain("localhost");
    expect(JSON.stringify(metadata)).not.toContain("vercel.app");
    vi.unstubAllEnvs();
  });

  it("noindexes thin product-led pages below their product threshold", () => {
    const config = getKeywordLandingByTypeSlug("fabric", "chiffon");
    expect(config).toBeDefined();
    expect(isKeywordLandingIndexable(config!, 1)).toBe(false);
    expect(keywordLandingMetadata(config!, 1).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("keeps strategic guide and supply pages indexable without products", () => {
    const guide = getKeywordLandingByTypeSlug(
      "guide",
      "what-is-a-pre-loved-saree",
    );
    const supply = getKeywordLandingByTypeSlug("supply", "sell-your-saree");
    expect(isKeywordLandingIndexable(guide!, 0)).toBe(true);
    expect(isKeywordLandingIndexable(supply!, 0)).toBe(true);
  });

  it("guide JSON-LD is valid and does not include fake review or rating schema", () => {
    const config = getKeywordLandingByTypeSlug(
      "guide",
      "pre-loved-vs-second-hand-saree",
    );
    expect(config).toBeDefined();

    const pageSchema = keywordGuideJsonLd(config!);
    const faqSchema = keywordFaqJsonLd(config!);
    const parsedPage = JSON.parse(safeJsonLd(pageSchema));
    const parsedFaq = JSON.parse(safeJsonLd(faqSchema));
    const combined = JSON.stringify([parsedPage, parsedFaq]);

    expect(parsedPage["@type"]).toBe("Article");
    expect(parsedFaq["@type"]).toBe("FAQPage");
    expect(combined).not.toContain("aggregateRating");
    expect(combined).not.toContain("review");
  });

  it("only sitemap-enabled pages are candidates for sitemap inclusion", () => {
    const sitemapPaths = keywordLandingPages
      .filter((page) => page.sitemap)
      .map((page) => page.canonicalPath);

    expect(sitemapPaths).toContain("/collection/fabric/silk");
    expect(sitemapPaths).toContain("/collection/occasion/festive");
    expect(sitemapPaths).toContain("/sell-your-saree");
    expect(sitemapPaths).not.toContain("/collection/fabric/chiffon");
  });

  it("keeps Phase 2 deferred pages noindex and out of sitemap", () => {
    const deferred = [
      getKeywordLandingByTypeSlug("fabric", "kanjeevaram"),
      getKeywordLandingByTypeSlug("fabric", "chiffon"),
      getKeywordLandingByTypeSlug("fabric", "georgette"),
      getKeywordLandingByTypeSlug("occasion", "wedding"),
      getKeywordLandingByTypeSlug("blouse", "blouses"),
    ];

    for (const config of deferred) {
      expect(config).toBeDefined();
      expect(config?.sitemap).toBe(false);
      expect(keywordLandingMetadata(config!, 0).robots).toEqual({
        index: false,
        follow: true,
      });
    }
  });

  it("keeps P0 indexable pages configured with production canonical metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const p0Pages = [
      getKeywordLandingByTypeSlug("fabric", "silk"),
      getKeywordLandingByTypeSlug("occasion", "festive"),
      getKeywordLandingByTypeSlug("supply", "sell-your-saree"),
      getKeywordLandingByTypeSlug("guide", "what-is-a-pre-loved-saree"),
      getKeywordLandingByTypeSlug("guide", "pre-loved-vs-second-hand-saree"),
    ];

    for (const config of p0Pages) {
      expect(config).toBeDefined();
      const productCount = config?.searchFilters ? config.minProductCount : 0;
      const metadata = keywordLandingMetadata(config!, productCount);
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(metadata.alternates?.canonical).toMatch(
        /^https:\/\/www\.fromthetrunk\.shop\//,
      );
    }
    vi.unstubAllEnvs();
  });

  it("emits ItemList JSON-LD only for visible products", () => {
    const config = getKeywordLandingByTypeSlug("fabric", "silk");
    expect(config).toBeDefined();
    expect(keywordItemListJsonLd(config!, [])).toBeNull();

    const itemList = keywordItemListJsonLd(config!, [
      {
        id: "p1",
        name: "Gold Silk Saree",
        slug: "gold-silk-saree",
      },
    ] as never);

    expect(itemList?.["@type"]).toBe("ItemList");
    expect(JSON.stringify(itemList)).toContain("/collection/gold-silk-saree");
  });
});

describe("blouse landing guard", () => {
  it("does not render the blouse page when blouse scope has no products", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
      },
    }));
    vi.doMock("@/components/seo/keyword-product-landing-page", () => ({
      getKeywordLandingProducts: vi
        .fn()
        .mockResolvedValue({ products: [], totalDocs: 0 }),
      KeywordProductLandingPage: () => null,
    }));

    const page = await import("@/app/(site)/blouses/page");
    await expect(page.default()).rejects.toThrow("NEXT_NOT_FOUND");
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/components/seo/keyword-product-landing-page");
  });
});
