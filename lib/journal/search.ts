/**
 * Journal search, shared by the server (building the index) and the client
 * (filtering as the reader types).
 *
 * Text is lowercased, stripped of accents and punctuation, and spelling
 * variants are folded together: "pre-loved", "pre loved" and "preloved" all
 * become "preloved" (likewise pre-owned, pre-used and second-hand). A story
 * matches when every word of the query appears in its search text.
 */

export type JournalSearchEntry = {
  slug: string;
  searchText: string;
};

export function normalizeJournalSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bpre (loved|owned|used)\b/g, "pre$1")
    .replace(/\bsecond hand\b/g, "secondhand")
    .trim();
}

export function journalSearchTerms(query: string): string[] {
  return normalizeJournalSearchText(query).split(" ").filter(Boolean);
}

export function matchesJournalSearch(searchText: string, terms: readonly string[]): boolean {
  return terms.every((term) => searchText.includes(term));
}

/** Slugs of matching stories, in the order given. An empty query matches all. */
export function filterJournalSearch(
  entries: readonly JournalSearchEntry[],
  query: string,
): string[] {
  const terms = journalSearchTerms(query);
  if (terms.length === 0) return entries.map((entry) => entry.slug);
  return entries
    .filter((entry) => matchesJournalSearch(entry.searchText, terms))
    .map((entry) => entry.slug);
}

export function formatStoryCount(count: number): string {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}
