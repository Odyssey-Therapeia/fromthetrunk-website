import { describe, expect, it } from "vitest";

import { getLiveJournalArticle, getLiveJournalArticles, getPublishedJournalArticles } from "@/lib/journal/articles";
import { deriveJournalArticle, isJournalArticlePublished } from "@/lib/journal/derive";
import {
  groupJournalJourneys,
  journalNextAction,
  journeyForSlug,
  rankJournalNextReads,
} from "@/lib/journal/journeys";
import { parseJournalArticle } from "@/lib/journal/schema";

const story = (slug: string) => ({ slug });

describe("Journal journeys", () => {
  it("groups stories by journey in reading order and hides empty journeys", () => {
    const { groups, unassigned } = groupJournalJourneys([
      story("where-to-sell-old-silk-sarees"),
      story("what-is-the-silk-mark"),
      story("how-to-identify-pure-silk-saree"),
      story("an-unplanned-story"),
    ]);

    expect(groups.map(({ journey, articles }) => [journey.id, articles.map(({ slug }) => slug)])).toEqual([
      ["buy-with-confidence", ["how-to-identify-pure-silk-saree", "what-is-the-silk-mark"]],
      ["sell", ["where-to-sell-old-silk-sarees"]],
    ]);
    expect(unassigned.map(({ slug }) => slug)).toEqual(["an-unplanned-story"]);
    expect(groupJournalJourneys([]).groups).toEqual([]);
  });

  it("ranks next reads: same journey, then the next journey, then the newest", () => {
    const newestFirst = [
      story("where-to-sell-old-silk-sarees"),
      story("how-to-care-for-silk-sarees"),
      story("what-is-the-silk-mark"),
      story("preloved-sarees-meaning"),
      story("how-to-identify-pure-silk-saree"),
    ];

    expect(rankJournalNextReads("what-is-the-silk-mark", newestFirst).map(({ slug }) => slug)).toEqual([
      "how-to-identify-pure-silk-saree",
      "how-to-care-for-silk-sarees",
      "where-to-sell-old-silk-sarees",
    ]);
    // The last journey wraps round to the first.
    expect(rankJournalNextReads("where-to-sell-old-silk-sarees", newestFirst).map(({ slug }) => slug)).toEqual([
      "preloved-sarees-meaning",
      "how-to-care-for-silk-sarees",
      "what-is-the-silk-mark",
    ]);
    expect(rankJournalNextReads("preloved-sarees-meaning", [story("preloved-sarees-meaning")])).toEqual([]);
  });

  it("maps each story to its one next action", () => {
    expect(journalNextAction("preloved-sarees-meaning")).toMatchObject({ href: "/collection", label: "Browse preloved sarees" });
    expect(journalNextAction("how-to-identify-pure-silk-saree")).toMatchObject({
      href: "/authentication",
      label: "How we check a saree",
    });
    expect(journalNextAction("how-to-care-for-silk-sarees").href).toBe("/sell-your-saree");
    expect(journalNextAction("where-to-sell-old-silk-sarees").label).toBe("Sell or consign a saree");
    expect(journalNextAction("indian-saree-fabrics-and-weaves").options).toHaveLength(4);
    expect(journalNextAction("an-unplanned-story").href).toBe("/collection");
    // No promise of lab or fibre testing.
    const { heading, description, label } = journalNextAction("how-to-identify-pure-silk-saree");
    expect(`${heading} ${description} ${label}`).not.toMatch(/fib(re|er)|\blab|burn/i);
    expect(journeyForSlug("how-to-care-for-sarees")?.id).toBe("care");
  });
});

describe("Journal publication dates", () => {
  it("treats drafts and future dates as unpublished, from IST midnight", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(isJournalArticlePublished({ draft: true }, at("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isJournalArticlePublished({}, at("2000-01-01T00:00:00Z"))).toBe(true);
    expect(isJournalArticlePublished({ publishedAt: "2026-10-01" }, at("2026-09-30T18:29:59Z"))).toBe(false);
    expect(isJournalArticlePublished({ publishedAt: "2026-10-01" }, at("2026-09-30T18:30:00Z"))).toBe(true);
  });

  it("keeps a scheduled story's path but shows it only once its date arrives", () => {
    const dated = getPublishedJournalArticles().find(({ publishedAt }) => publishedAt);
    expect(dated?.publishedAt).toBeDefined();
    const day = Date.parse(`${dated!.publishedAt}T00:00:00+05:30`);

    expect(getLiveJournalArticles(day - 1).map(({ slug }) => slug)).not.toContain(dated!.slug);
    expect(getLiveJournalArticle(dated!.slug, day - 1)).toBeNull();
    expect(getLiveJournalArticle(dated!.slug, day)?.slug).toBe(dated!.slug);
  });
});

describe("Journal search text", () => {
  it("does not index captions or alt text of figures that are not shown", () => {
    const source = parseJournalArticle("search-test.json", {
      slug: "search-test",
      title: "Search test",
      tag: "Care",
      description: "Folding silk.",
      seo: { title: "Search test | From The Trunk", description: "Folding silk." },
      body: [
        { type: "paragraph", text: "Fold gently." },
        {
          type: "figure",
          images: [{ src: "/journal/search-test/missing.avif", alt: "Zanzibar alt" }],
          caption: "Quetzal caption",
        },
      ],
    });
    const article = deriveJournalArticle(source, { imageExists: () => false });

    expect(article.body.map(({ type }) => type)).toEqual(["paragraph"]);
    expect(article.searchText).toContain("fold gently");
    expect(article.searchText).not.toMatch(/quetzal|zanzibar/);
  });
});
