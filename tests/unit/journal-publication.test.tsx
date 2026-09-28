import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalArticleBody } from "@/components/journal/journal-article-body";
import { JournalArticleHero } from "@/components/journal/journal-article-hero";
import { getPublishedJournalArticles } from "@/lib/journal/articles";
import { compareJournalArticles, deriveJournalArticle } from "@/lib/journal/derive";
import { createJournalLinkResolver } from "@/lib/journal/links";
import { parseJournalArticle } from "@/lib/journal/schema";
import { filterJournalSearch } from "@/lib/journal/search";
import { journalArticleJsonLd, journalArticleMetadata, journalSitemapEntries } from "@/lib/journal/seo";

const expected = [
  ["preloved-sarees-meaning", 6],
  ["how-to-identify-pure-silk-saree", 8],
  ["how-to-care-for-silk-sarees", 6],
  ["what-is-the-silk-mark", 4],
  ["where-to-sell-old-silk-sarees", 6],
] as const;

describe("five published Journal stories", () => {
  it("keeps stable order, reading times, search and optional FAQs", () => {
    const articles = getPublishedJournalArticles();
    expect(articles.map(({ slug, readingMinutes }) => [slug, readingMinutes])).toEqual(expected);
    expect([...articles].reverse().sort(compareJournalArticles).map(({ slug }) => slug))
      .toEqual(expected.map(([slug]) => slug));
    for (const article of articles) {
      expect(filterJournalSearch(articles, article.title)).toContain(article.slug);
    }
    expect(filterJournalSearch(articles, "zzzz-no-such-story")).toEqual([]);
    expect(articles.find(({ slug }) => slug === "what-is-the-silk-mark")?.faq).toBeUndefined();
  });

  it("omits unknown dates from the rendered hero, SEO and sitemap", () => {
    const articles = getPublishedJournalArticles();
    for (const article of articles.filter(({ slug }) => slug !== "preloved-sarees-meaning")) {
      expect(article.publishedAt).toBeUndefined();
      expect(article.modifiedAt).toBeUndefined();
      expect(article.dateLabel).toBeNull();
      const html = renderToStaticMarkup(<JournalArticleHero article={article} shareUrl={article.path} shareImageUrl={null} />);
      expect(html).not.toContain("<time");
      expect(html).not.toContain("Published ");
      const graph = journalArticleMetadata(article).openGraph;
      expect(graph).not.toHaveProperty("publishedTime");
      expect(graph).not.toHaveProperty("modifiedTime");
      expect(journalArticleJsonLd(article)).not.toHaveProperty("datePublished");
      expect(journalArticleJsonLd(article)).not.toHaveProperty("dateModified");
      expect(journalSitemapEntries([article]).every((entry) => !("lastModified" in entry))).toBe(true);
    }
    expect(journalSitemapEntries(articles)).toHaveLength(6);
  });

  it("validates an unknown date while rejecting empty, malformed or reversed dates", () => {
    const base = {
      slug: "undated", title: "Undated", tag: "Care", description: "Silk care.",
      seo: { title: "Silk care | From The Trunk", description: "Silk care." },
      body: [{ type: "paragraph", text: "Fold gently." }],
    };
    const source = parseJournalArticle("undated.json", base);
    expect(deriveJournalArticle(source, { imageExists: () => false }).dateLabel).toBeNull();
    for (const publishedAt of ["", null, "2026-02-30", "2026-09-29T10:00:00"]) {
      expect(() => parseJournalArticle("undated.json", { ...base, publishedAt })).toThrow();
    }
    expect(() => parseJournalArticle("undated.json", {
      ...base, publishedAt: "2026-10-01", updatedAt: "2026-09-29",
    })).toThrow(/earlier/);
    const revised = deriveJournalArticle(parseJournalArticle("undated.json", {
      ...base, updatedAt: "2026-10-01",
    }), { imageExists: () => false });
    expect(journalArticleJsonLd(revised)).toHaveProperty("dateModified", "2026-10-01T00:00:00+05:30");
    expect(journalArticleJsonLd(revised)).not.toHaveProperty("datePublished");
  });

  it("preserves and renders the seven silk-test subsection headings as H3", () => {
    const article = getPublishedJournalArticles().find(({ slug }) => slug === "how-to-identify-pure-silk-saree")!;
    expect(article.body.filter((block) => block.type === "heading" && block.level === 3)).toHaveLength(7);
    const html = renderToStaticMarkup(<JournalArticleBody body={article.body} resolveLink={createJournalLinkResolver([])} />);
    expect(html.match(/<h3\b/g)).toHaveLength(7);
    expect(html.match(/<h2\b/g)).toHaveLength(5);
    expect(html).toMatch(/<h3[^>]*>1\. Look for the Silk Mark<\/h3>/);
  });
});
