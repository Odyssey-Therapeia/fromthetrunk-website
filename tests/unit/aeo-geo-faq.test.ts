import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MetadataImage = {
  alt?: string;
  url?: string;
};

type MetadataRecord = {
  description?: string;
  keywords?: unknown;
  openGraph?: {
    description?: string;
    images?: MetadataImage[];
    title?: string;
  };
  title?: string | { absolute: string };
  twitter?: {
    card?: string;
    description?: string;
    images?: MetadataImage[];
    title?: string;
  };
};

const rootPath = process.cwd();

describe("AEO/GEO FAQ expansion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SITE_URL", "https://www.fromthetrunk.shop");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders every owner-approved FAQ on the public FAQ page", async () => {
    const [faqPage, faqContent] = await Promise.all([
      import("@/app/(site)/faqs/page"),
      import("@/lib/seo/faq-content"),
    ]);
    const html = renderToStaticMarkup(createElement(faqPage.default));

    for (const question of faqContent.OWNER_APPROVED_AEO_GEO_FAQ_QUESTIONS) {
      expect(html).toContain(question);
    }

    expect(html).toContain("What is From the Trunk?");
    expect(html).toContain("Do you offer returns?");
    expect(html).toContain("How do you ship the sarees?");
    expect(html).toContain("How do I care for my saree?");
    expect(html).toContain("What payment methods do you accept?");
    expect(html).toContain("you will not be charged");
    expect(html).toContain("found its next chapter");
    expect(html).toContain("keeps beautiful textiles in circulation");
    expect(html).toContain('href="/collection"');
    expect(html).toContain('href="/sell-your-saree"');
    expect(html).toContain('href="/how-it-works"');
  });

  it("keeps FAQPage schema tied to only the visible FAQ entries", async () => {
    const { FAQ_ITEMS, faqJsonLd } = await import("@/lib/seo/faq-content");
    const entities = faqJsonLd.mainEntity;

    expect(entities).toHaveLength(FAQ_ITEMS.length);
    expect(entities.map((entity) => entity.name)).toEqual(
      FAQ_ITEMS.map((item) => item.question),
    );

    for (const [index, entity] of entities.entries()) {
      expect(entity.acceptedAnswer.text).toBe(FAQ_ITEMS[index]?.answer);
    }

    const serialized = JSON.stringify(faqJsonLd);
    expect(serialized).not.toContain("AggregateRating");
    expect(serialized).not.toContain("Review");
    expect(serialized).not.toMatch(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    );
  });

  it("hardens FAQ metadata for Open Graph and Twitter without meta keywords", async () => {
    const { metadata } = await import("@/app/(site)/faqs/page");
    const faqMetadata = metadata as MetadataRecord;
    const ogImage = faqMetadata.openGraph?.images?.[0];
    const twitterImage = faqMetadata.twitter?.images?.[0];
    const serialized = JSON.stringify(faqMetadata);

    expect(faqMetadata.title).toEqual({
      absolute: "FAQs | Authenticated Pre-Loved Sarees in India | From The Trunk",
    });
    expect(faqMetadata.description).toBe(
      "Answers about buying authenticated pre-loved sarees in India, heirloom silk saree care, selling old sarees, shipping, returns, and one-of-one checkout.",
    );
    expect(faqMetadata.openGraph?.title).toBe(
      "FAQs | Authenticated Pre-Loved Sarees in India | From The Trunk",
    );
    expect(faqMetadata.openGraph?.description).toBe(
      "Answers about buying authenticated pre-loved sarees in India, heirloom silk saree care, selling old sarees, shipping, returns, and one-of-one checkout.",
    );
    expect(faqMetadata.twitter?.title).toBe(
      "FAQs | Authenticated Pre-Loved Sarees in India | From The Trunk",
    );
    expect(faqMetadata.twitter?.description).toBe(
      "Answers about buying authenticated pre-loved sarees in India, heirloom silk saree care, selling old sarees, shipping, returns, and one-of-one checkout.",
    );
    expect(faqMetadata.twitter?.card).toBe("summary_large_image");
    expect(ogImage?.url).toBe(
      "https://www.fromthetrunk.shop/banner/collection_banner.png",
    );
    expect(ogImage?.alt).toBe(
      "From The Trunk FAQ guide for authenticated pre-loved sarees",
    );
    expect(twitterImage?.url).toBe(ogImage?.url);
    expect(twitterImage?.alt).toBe(ogImage?.alt);
    expect(faqMetadata.keywords).toBeUndefined();
    expect(serialized).not.toContain("localhost");
    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("unsplash");
  });

  it("keeps the sell FAQ visible and mirrored by sell-page FAQ schema", async () => {
    const { keywordFaqJsonLd, keywordLandingPages } = await import(
      "@/lib/seo/keyword-landing-pages"
    );
    const sellPage = keywordLandingPages.find(
      (page) => page.canonicalPath === "/sell-your-saree",
    );

    expect(sellPage).toBeDefined();
    if (!sellPage) throw new Error("Expected /sell-your-saree config");

    const sellQuestion = sellPage.faq.find(
      (item) => item.question === "How do I sell my old saree?",
    );
    const faqSchema = keywordFaqJsonLd(sellPage);

    expect(sellQuestion?.answer).toContain("sarees sitting unworn");
    expect(faqSchema?.mainEntity).toEqual(
      sellPage.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    );
    expect(JSON.stringify(faqSchema)).not.toContain("AggregateRating");
    expect(JSON.stringify(faqSchema)).not.toContain("Review");
  });

  it("keeps FAQ pages eligible in sitemap and llms surfaces", () => {
    const sitemapSource = readFileSync(
      join(rootPath, "app/sitemap.ts"),
      "utf8",
    );
    const llmsSource = readFileSync(
      join(rootPath, "app/llms.txt/route.ts"),
      "utf8",
    );

    expect(sitemapSource).toContain('absoluteUrl("/faqs")');
    expect(sitemapSource).toContain('absoluteUrl("/sell-your-saree")');
    expect(llmsSource).toContain('path: "/faqs"');
    expect(llmsSource).toContain('path: "/sell-your-saree"');
  });
});
