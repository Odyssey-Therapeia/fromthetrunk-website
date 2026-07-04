import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOOTER_SECTIONS,
  DEFAULT_NAV_LINKS,
} from "@/lib/content/nav-menu";
import {
  buildPdpGalleryImageAlt,
  buildPdpMainImageAlt,
  buildProductCardAlt,
} from "@/lib/seo/image-alt";
import { productJsonLd } from "@/lib/seo/json-ld";

const root = process.cwd();

function readSource(relPath: string): string {
  return readFileSync(join(root, relPath), "utf8");
}

function defaultSeoLinks() {
  return [
    ...DEFAULT_NAV_LINKS,
    ...DEFAULT_FOOTER_SECTIONS.flatMap((section) => section.links),
  ];
}

describe("SEO Phase 2B internal linking", () => {
  it("fallback navigation exposes approved public internal targets", () => {
    const hrefs = defaultSeoLinks().map((link) => link.href);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/collection",
        "/our-story",
        "/why",
        "/how-it-works",
        "/faqs",
        "/sell-your-saree",
        "/packing",
        "/our-team",
        "/policies/shipping-delivery-policy",
        "/policies/return-refund-policy",
      ]),
    );
  });

  it("Why page keeps a crawlable collection link without JS-only navigation", () => {
    const source = readSource("components/sections/our-why-experience.tsx");

    expect(source).toContain('href="/collection"');
    expect(source).not.toContain('window.location');
  });

  it("PDPs render the approved trust and support links", () => {
    const source = readSource("app/(site)/collection/[slug]/page.tsx");

    expect(source).toContain('aria-label="Product trust and support"');
    expect(source).toContain('href: "/how-it-works"');
    expect(source).toContain('href: "/packing"');
    expect(source).toContain('href: "/policies/shipping-delivery-policy"');
    expect(source).toContain('href: "/policies/return-refund-policy"');
  });

  it("policy detail pages link to FAQs and canonical related policy URLs", () => {
    const source = readSource("app/(site)/policies/[slug]/page.tsx");

    expect(source).toContain('href="/faqs"');
    expect(source).toContain("href={`/policies/${relatedPolicy.slug}`}");
    expect(source).not.toContain("/privacy-policy");
    expect(source).not.toContain("/terms-of-service");
    expect(source).not.toContain("/shipping-policy");
    expect(source).not.toContain("/return-policy");
  });

  it("approved SEO link sets avoid private, transactional, query, localhost, and preview URLs", () => {
    const blockedTargets = [
      "/account",
      "/admin",
      "/api",
      "/cart",
      "/checkout",
      "/search",
    ];

    for (const link of defaultSeoLinks()) {
      for (const blockedTarget of blockedTargets) {
        expect(link.href).not.toBe(blockedTarget);
        expect(link.href.startsWith(`${blockedTarget}/`)).toBe(false);
      }
      expect(link.href).not.toContain("?");
      expect(link.href).not.toContain("localhost");
      expect(link.href).not.toContain("vercel.app");
    }
  });
});

describe("SEO Phase 2B image alt implementation", () => {
  it("builds approved product card alt text from explicit fabric only", () => {
    expect(
      buildProductCardAlt({
        detailsFabric: "Banarasi silk",
        name: "Gold Tissue Saree",
      }),
    ).toBe(
      "Gold Tissue Saree, pre-loved Banarasi silk saree from From the Trunk",
    );

    expect(
      buildProductCardAlt({
        detailsFabric: null,
        name: "Midnight Chiffon Saree",
      }),
    ).toBe("Midnight Chiffon Saree, pre-loved saree from From the Trunk");
  });

  it("builds PDP main and gallery alt text without inventing detail labels", () => {
    const product = {
      detailsFabric: "Chiffon",
      name: "Midnight Chiffon Saree",
    };

    expect(buildPdpMainImageAlt(product)).toBe(
      "Midnight Chiffon Saree shown as a pre-loved saree, Chiffon",
    );
    expect(buildPdpGalleryImageAlt(product, 0)).toBe(
      "Midnight Chiffon Saree shown as a pre-loved saree, Chiffon",
    );
    expect(buildPdpGalleryImageAlt(product, 1)).toBe(
      "Midnight Chiffon Saree detail view 2",
    );
  });

  it("wires product card and PDP gallery components to approved alt helpers", () => {
    const productCard = readSource("components/product/product-card.tsx");
    const productPage = readSource("app/(site)/collection/[slug]/page.tsx");
    const gallery = readSource("components/product/product-gallery.tsx");

    expect(productCard).toContain("buildProductCardAlt");
    expect(productPage).toContain("buildPdpGalleryImageAlt");
    expect(gallery).toContain("alt={activeAlt}");
    expect(gallery).toContain('alt=""');
  });

  it("keeps decorative hero and editorial images empty-alt", () => {
    expect(readSource("components/sections/hero-section.tsx")).toContain(
      'alt=""',
    );
    expect(
      readSource("components/sections/fabric-category-motion-grid.tsx"),
    ).toContain('alt=""');
    expect(readSource("components/sections/story-narrative.tsx")).toContain(
      'alt=""',
    );
  });
});

describe("SEO Phase 2B schema and sitemap guardrails", () => {
  it("product JSON-LD still does not emit fake rating or review schema", () => {
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

    expect(jsonLd).not.toHaveProperty("aggregateRating");
    expect(jsonLd).not.toHaveProperty("review");
    expect(jsonLd).not.toHaveProperty("reviews");
  });

  it("sitemap source still excludes sold/draft products and query routes", () => {
    const source = readSource("app/sitemap.ts");
    const productIndexingSource = readSource("lib/seo/product-indexing.ts");

    expect(source).toContain("includeDrafts: false");
    expect(source).toContain("shouldIncludeProductInSeo");
    expect(productIndexingSource).toContain('product.stockStatus === "sold"');
    expect(source).not.toContain('"?');
    expect(source).not.toContain("/cart");
    expect(source).not.toContain("/checkout");
    expect(source).not.toContain("/account");
    expect(source).not.toContain("/admin");
    expect(source).not.toContain("/search");
  });
});
