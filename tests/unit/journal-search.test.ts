import { describe, expect, it } from "vitest";

import { formatJournalDate } from "@/lib/journal/format-date";
import { formatReadingTime, readingMinutes, readingMinutesForWordCount } from "@/lib/journal/reading-time";
import {
  filterJournalSearch,
  formatStoryCount,
  journalSearchTerms,
  normalizeJournalSearchText,
} from "@/lib/journal/search";
import { journalShareTargets } from "@/lib/journal/share";

describe("journal search", () => {
  const entries = [
    {
      slug: "preloved-sarees-meaning",
      searchText: normalizeJournalSearchText(
        "What Does Preloved Mean? Buying Guide. Pure zari is silver coated in gold. Second hand, pre owned.",
      ),
    },
    {
      slug: "caring-for-silk",
      searchText: normalizeJournalSearchText("Caring for Kanjeevaram silk: fold it in muslin."),
    },
  ];

  it("folds pre-loved, pre loved and preloved together", () => {
    expect(normalizeJournalSearchText("Pre-Loved")).toBe("preloved");
    expect(normalizeJournalSearchText("pre loved")).toBe("preloved");
    expect(normalizeJournalSearchText("PRELOVED")).toBe("preloved");
    expect(normalizeJournalSearchText("pre-owned, pre used")).toBe("preowned preused");
    expect(normalizeJournalSearchText("second-hand")).toBe("secondhand");

    for (const query of ["pre-loved", "pre loved", "Preloved", "  PRE-LOVED  "]) {
      expect(filterJournalSearch(entries, query)).toEqual(["preloved-sarees-meaning"]);
    }
  });

  it("matches case-insensitively across the text, requiring every word", () => {
    expect(filterJournalSearch(entries, "ZARI")).toEqual(["preloved-sarees-meaning"]);
    expect(filterJournalSearch(entries, "silk muslin")).toEqual(["caring-for-silk"]);
    expect(filterJournalSearch(entries, "zari muslin")).toEqual([]);
    expect(filterJournalSearch(entries, "zzzz")).toEqual([]);
  });

  it("ignores accents, punctuation and apostrophes", () => {
    expect(normalizeJournalSearchText("Weaver’s Kanjeevaram—Café")).toBe("weavers kanjeevaram cafe");
    expect(filterJournalSearch(entries, "kanjeevaram!")).toEqual(["caring-for-silk"]);
  });

  it("returns every story for an empty or punctuation-only query", () => {
    expect(filterJournalSearch(entries, "")).toEqual(["preloved-sarees-meaning", "caring-for-silk"]);
    expect(journalSearchTerms(" - ")).toEqual([]);
    expect(filterJournalSearch(entries, " - ")).toHaveLength(2);
  });

  it("formats the result count", () => {
    expect(formatStoryCount(0)).toBe("0 stories");
    expect(formatStoryCount(1)).toBe("1 story");
    expect(formatStoryCount(4)).toBe("4 stories");
  });
});

describe("journal reading time and dates", () => {
  it("rounds up at 200 words a minute", () => {
    expect(readingMinutesForWordCount(0)).toBe(1);
    expect(readingMinutesForWordCount(200)).toBe(1);
    expect(readingMinutesForWordCount(201)).toBe(2);
    expect(readingMinutesForWordCount(1101)).toBe(6);
    expect(readingMinutes("word ".repeat(401))).toBe(3);
    expect(formatReadingTime(6)).toBe("6 min read");
  });

  it("formats dates as 28 Sep 2026, never Sept", () => {
    expect(formatJournalDate("2026-09-28")).toBe("28 Sep 2026");
    expect(formatJournalDate("2026-01-05T09:30:00+05:30")).toBe("5 Jan 2026");
  });
});

describe("journal share targets", () => {
  const url = "https://www.fromthetrunk.shop/journal/preloved-sarees-meaning";
  const title = "What Does Preloved Mean? Preloved Sarees Explained";

  it("offers Pinterest only when there is a cover", () => {
    expect(journalShareTargets({ url, title }).map((target) => target.id)).toEqual([
      "whatsapp",
      "facebook",
      "x",
      "email",
    ]);
    const withCover = journalShareTargets({
      url,
      title,
      imageUrl: "https://www.fromthetrunk.shop/journal/preloved-sarees-meaning/cover.avif",
    });
    expect(withCover.map((target) => target.id)).toEqual([
      "whatsapp",
      "pinterest",
      "facebook",
      "x",
      "email",
    ]);
    expect(withCover[1]?.href).toContain(
      `media=${encodeURIComponent("https://www.fromthetrunk.shop/journal/preloved-sarees-meaning/cover.avif")}`,
    );
  });

  it("encodes the article URL into every intent", () => {
    for (const target of journalShareTargets({ url, title })) {
      expect(target.href).toContain(encodeURIComponent(url));
    }
    const email = journalShareTargets({ url, title }).find((target) => target.id === "email");
    expect(email?.href.startsWith("mailto:?subject=")).toBe(true);
    expect(email?.newTab).toBe(false);
  });
});
