import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPublishedJournalArticle } from "@/lib/journal/articles";
import type { JournalArticle } from "@/lib/journal/derive";
import {
  JOURNAL_INDEX_DESCRIPTION,
  JOURNAL_INDEX_TITLE,
  journalArticleJsonLd,
  journalArticleMetadata,
  journalBreadcrumbItems,
  journalIndexMetadata,
  journalSitemapEntries,
} from "@/lib/journal/seo";

vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
}));

vi.mock("@/lib/ports/catalog-search", () => ({
  searchProducts: vi.fn(async () => ({ products: [], facets: {}, totalDocs: 0 })),
}));

const ORIGIN = "https://www.fromthetrunk.shop";
const ARTICLE_URL = `${ORIGIN}/journal/preloved-sarees-meaning`;
const DESCRIPTION =
  "What preloved means for a saree, how it differs from second hand and vintage, what preloved sarees cost, and how to tell one has been well kept.";

function loadArticle(): JournalArticle {
  const article = getPublishedJournalArticle("preloved-sarees-meaning");
  if (!article) throw new Error("payload article missing");
  return article;
}

describe("journal SEO", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
  });

  it("gives the article its exact title, description and canonical", () => {
    const metadata = journalArticleMetadata(loadArticle());

    expect(metadata.title).toEqual({ absolute: "Preloved Sarees Meaning, Explained | From The Trunk" });
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.alternates?.canonical).toBe(ARTICLE_URL);
    expect(metadata.keywords).toContain("preloved sarees meaning");
  });

  it("marks the article as an Open Graph article with dates, section and tags", () => {
    const openGraph = journalArticleMetadata(loadArticle()).openGraph as Record<string, unknown>;

    expect(openGraph).toMatchObject({
      type: "article",
      url: ARTICLE_URL,
      title: "Preloved Sarees Meaning, Explained | From The Trunk",
      description: DESCRIPTION,
      publishedTime: "2026-09-28T00:00:00+05:30",
      modifiedTime: "2026-09-28T00:00:00+05:30",
      section: "Buying Guide",
    });
    expect(openGraph.tags).toContain("preloved designer sarees");
    // The AVIF cover has no approved JPG/PNG companion, so the default stands in.
    expect(openGraph.images).toEqual([
      expect.objectContaining({ url: `${ORIGIN}/banner/from-the-trunk-social-v1.jpg` }),
    ]);
  });

  it("describes the article as a BlogPosting, without FAQPage", () => {
    const jsonLd = journalArticleJsonLd(loadArticle());

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "What Does Preloved Mean? Preloved Sarees Explained",
      description: DESCRIPTION,
      datePublished: "2026-09-28T00:00:00+05:30",
      dateModified: "2026-09-28T00:00:00+05:30",
      author: { "@type": "Organization", name: "From The Trunk", url: `${ORIGIN}/` },
      publisher: {
        "@type": "Organization",
        name: "From The Trunk",
        logo: { "@type": "ImageObject", url: `${ORIGIN}/Ftt_logo_navbar.avif` },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": ARTICLE_URL },
      url: ARTICLE_URL,
      articleSection: "Buying Guide",
      inLanguage: "en-IN",
    });
    expect(jsonLd.keywords).toMatch(/^preloved sarees meaning, pre loved meaning, /);
    expect(jsonLd.wordCount).toBeGreaterThan(700);
    // Structured data can use the article's AVIF cover; social previews use the JPG fallback.
    expect(jsonLd.image).toEqual([`${ORIGIN}/blog1a.avif`]);
    expect(JSON.stringify(jsonLd)).not.toContain("FAQPage");
  });

  it("adds the absolute cover to BlogPosting when there is one", () => {
    const jsonLd = journalArticleJsonLd({
      ...loadArticle(),
      cover: { src: "/journal/preloved-sarees-meaning/cover.avif", alt: "Cover" },
    });
    expect(jsonLd.image).toEqual([`${ORIGIN}/journal/preloved-sarees-meaning/cover.avif`]);
  });

  it("never uses an AVIF cover for og:image; a same-named JPG takes its place", () => {
    const cover = { src: "/journal/preloved-sarees-meaning/cover.avif", alt: "Cover" };
    const ogImages = (article: JournalArticle) =>
      (journalArticleMetadata(article).openGraph as { images: { url: string }[] }).images.map(
        (image) => image.url,
      );

    const avifOnly = { ...loadArticle(), cover, socialImage: null };
    expect(ogImages(avifOnly)).toEqual([`${ORIGIN}/banner/from-the-trunk-social-v1.jpg`]);
    expect(JSON.stringify(journalArticleMetadata(avifOnly))).not.toContain(".avif");

    const withJpg = {
      ...loadArticle(),
      cover,
      socialImage: "/journal/preloved-sarees-meaning/cover.jpg",
    };
    expect(ogImages(withJpg)).toEqual([`${ORIGIN}/journal/preloved-sarees-meaning/cover.jpg`]);
    expect(journalArticleJsonLd(withJpg).image).toEqual([
      `${ORIGIN}/journal/preloved-sarees-meaning/cover.jpg`,
    ]);
  });

  it("builds the breadcrumb trail", () => {
    expect(journalBreadcrumbItems(loadArticle())).toEqual([
      { name: "Home", url: `${ORIGIN}/` },
      { name: "Journal", url: `${ORIGIN}/journal` },
      { name: "What Does Preloved Mean? Preloved Sarees Explained", url: ARTICLE_URL },
    ]);
  });

  it("gives the index its own title, description and canonical", () => {
    const metadata = journalIndexMetadata();
    expect(JOURNAL_INDEX_TITLE).toBe("Journal | From The Trunk");
    expect(metadata.title).toEqual({ absolute: "Journal | From The Trunk" });
    expect(metadata.description).toBe(JOURNAL_INDEX_DESCRIPTION);
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/journal`);
  });

  it("lists the index and each article with lastModified = updatedAt ?? publishedAt", () => {
    const entries = journalSitemapEntries([
      { path: "/journal/newer", modifiedAt: "2026-11-02" },
      { path: "/journal/older", modifiedAt: "2026-09-28" },
    ]);
    expect(entries.map((entry) => [entry.url, (entry.lastModified as Date).toISOString()])).toEqual([
      [`${ORIGIN}/journal`, "2026-11-02T00:00:00.000Z"],
      [`${ORIGIN}/journal/newer`, "2026-11-02T00:00:00.000Z"],
      [`${ORIGIN}/journal/older`, "2026-09-28T00:00:00.000Z"],
    ]);
    expect(journalSitemapEntries([])).toEqual([
      { url: `${ORIGIN}/journal`, changeFrequency: "weekly", priority: 0.7 },
    ]);
  });

  it("includes the journal in the site sitemap", async () => {
    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${ORIGIN}/journal`);
    expect(urls).toContain(ARTICLE_URL);
    const article = entries.find((entry) => entry.url === ARTICLE_URL);
    expect((article?.lastModified as Date).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});
