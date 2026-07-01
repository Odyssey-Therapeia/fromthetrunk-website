import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { productJsonLd } from "@/lib/seo/json-ld";
import {
  ADMIN_METADATA,
  PRIVATE_NOINDEX_ROBOTS,
  WHY_PAGE_METADATA,
} from "@/lib/seo/route-metadata";

vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "p_available",
        name: "Available Saree",
        slug: "available-saree",
        stockStatus: "available",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [],
      },
      {
        id: "p_sold",
        name: "Sold Saree",
        slug: "sold-saree",
        stockStatus: "sold",
        updatedAt: "2026-05-01T00:00:00.000Z",
        images: [],
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

describe("SEO Phase 1 technical cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://www.fromthetrunk.shop");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses permanent redirects for final renamed and legacy policy routes", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/founders",
          destination: "/our-team",
          permanent: true,
        },
        {
          source: "/privacy-policy",
          destination: "/policies/privacy-policy",
          permanent: true,
        },
        {
          source: "/terms-of-service",
          destination: "/policies/terms-of-service",
          permanent: true,
        },
        {
          source: "/shipping-policy",
          destination: "/policies/shipping-delivery-policy",
          permanent: true,
        },
        {
          source: "/return-policy",
          destination: "/policies/return-refund-policy",
          permanent: true,
        },
      ]),
    );
  });

  it("sitemap uses only the canonical policy family and includes /why", async () => {
    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://www.fromthetrunk.shop/policies");
    expect(urls).toContain("https://www.fromthetrunk.shop/policies/privacy-policy");
    expect(urls).toContain("https://www.fromthetrunk.shop/policies/terms-of-service");
    expect(urls).toContain("https://www.fromthetrunk.shop/policies/shipping-delivery-policy");
    expect(urls).toContain("https://www.fromthetrunk.shop/policies/return-refund-policy");
    expect(urls).toContain("https://www.fromthetrunk.shop/why");

    expect(urls).not.toContain("https://www.fromthetrunk.shop/privacy-policy");
    expect(urls).not.toContain("https://www.fromthetrunk.shop/terms-of-service");
    expect(urls).not.toContain("https://www.fromthetrunk.shop/shipping-policy");
    expect(urls).not.toContain("https://www.fromthetrunk.shop/return-policy");
    expect(urls).not.toContain("https://www.fromthetrunk.shop/founders");
    expect(urls.some((url) => url.includes("localhost"))).toBe(false);
    expect(urls.some((url) => url.includes("vercel.app"))).toBe(false);
  });

  it("robots points to production sitemap and blocks private/system route families", async () => {
    const robots = (await import("@/app/robots")).default;
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = rules.disallow ?? [];

    expect(result.sitemap).toBe("https://www.fromthetrunk.shop/sitemap.xml");
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/admin/",
        "/account/",
        "/api/",
        "/cart",
        "/checkout",
        "/search",
        "/wishlist",
      ]),
    );
  });

  it("private/admin surfaces expose noindex metadata without changing auth", async () => {
    expect(ADMIN_METADATA.robots).toEqual({ index: false, follow: false });
    expect(PRIVATE_NOINDEX_ROBOTS).toEqual({ index: false, follow: false });
  });

  it("/why has full production canonical metadata", async () => {
    const serialised = JSON.stringify(WHY_PAGE_METADATA);

    expect(WHY_PAGE_METADATA.alternates?.canonical).toBe("https://www.fromthetrunk.shop/why");
    expect(serialised).not.toContain("localhost");
    expect(serialised).not.toContain("vercel.app");
  });

  it("llms.txt lists canonical public routes and excludes duplicates/private/sold routes", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    const text = await response.text();

    expect(text).toContain("https://www.fromthetrunk.shop/policies/privacy-policy");
    expect(text).toContain("https://www.fromthetrunk.shop/policies/terms-of-service");
    expect(text).toContain("https://www.fromthetrunk.shop/policies/shipping-delivery-policy");
    expect(text).toContain("https://www.fromthetrunk.shop/policies/return-refund-policy");
    expect(text).toContain("https://www.fromthetrunk.shop/why");
    expect(text).toContain("https://www.fromthetrunk.shop/collection/available-saree");

    expect(text).not.toContain("https://www.fromthetrunk.shop/privacy-policy");
    expect(text).not.toContain("https://www.fromthetrunk.shop/terms-of-service");
    expect(text).not.toContain("https://www.fromthetrunk.shop/shipping-policy");
    expect(text).not.toContain("https://www.fromthetrunk.shop/return-policy");
    expect(text).not.toContain("https://www.fromthetrunk.shop/collection/sold-saree");
    expect(text).not.toContain("https://www.fromthetrunk.shop/cart");
    expect(text).not.toContain("https://www.fromthetrunk.shop/checkout");
    expect(text).not.toContain("https://www.fromthetrunk.shop/account");
    expect(text).not.toContain("localhost");
    expect(text).not.toContain("vercel.app");
  });

  it("production env example uses the real canonical SEO origin", () => {
    const example = readFileSync(
      join(process.cwd(), ".env.production.example"),
      "utf8",
    );

    expect(example).toContain("SITE_URL=https://www.fromthetrunk.shop");
    expect(example).toContain("NEXT_PUBLIC_SERVER_URL=https://www.fromthetrunk.shop");
    expect(example).toContain("NEXTAUTH_URL=https://www.fromthetrunk.shop");
    expect(example).not.toContain("https://yourdomain.com");
  });

  it("product JSON-LD remains truthful and does not emit fake rating/review schema", () => {
    const jsonLd = productJsonLd({
      id: "p1",
      name: "Gold Tissue Saree",
      slug: "gold-tissue-saree",
      storyNarrative: "A restored saree with provenance.",
      images: [{ media: { url: "/media/gold-tissue.webp" } }],
      pricePaise: 1250000,
      stockStatus: "available",
      tags: [],
      collection: null,
    } as never) as Record<string, unknown>;
    const serialised = JSON.stringify(jsonLd);

    expect(jsonLd.image).toEqual([
      "https://www.fromthetrunk.shop/media/gold-tissue.webp",
    ]);
    expect(serialised).not.toContain("localhost");
    expect(serialised).not.toContain("vercel.app");
    expect(jsonLd).not.toHaveProperty("aggregateRating");
    expect(jsonLd).not.toHaveProperty("review");
    expect(jsonLd).not.toHaveProperty("reviews");
  });
});
