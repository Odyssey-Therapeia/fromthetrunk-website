/**
 * How an inline `[text](href)` link renders.
 *
 * - `internal`: a site path, rendered with next/link.
 * - `anchor`: an in-page `#id`, rendered as a plain anchor.
 * - `external`: http(s) or mailto, rendered as an anchor. http(s) links open in
 *   a new tab with rel="noopener noreferrer".
 * - `unavailable`: a `/journal/<slug>` link to an article that does not exist
 *   or is still a draft. It renders as plain text until that article is
 *   published, so the page never shows a broken link.
 */
export type ResolvedInlineHref =
  | { kind: "internal"; href: string }
  | { kind: "anchor"; href: string }
  | { kind: "external"; href: string; newTab: boolean }
  | { kind: "unavailable"; href: string };

export type JournalLinkResolver = (href: string) => ResolvedInlineHref;

const JOURNAL_ARTICLE_HREF = /^\/journal\/([^/?#]+)\/?(?:[?#].*)?$/;

export function journalSlugFromHref(href: string): string | null {
  return JOURNAL_ARTICLE_HREF.exec(href)?.[1] ?? null;
}

export function resolveInlineHref(
  href: string,
  publishedSlugs: ReadonlySet<string>,
): ResolvedInlineHref {
  if (href.startsWith("#")) return { kind: "anchor", href };

  if (/^https?:\/\//i.test(href)) return { kind: "external", href, newTab: true };
  if (/^mailto:/i.test(href)) return { kind: "external", href, newTab: false };

  if (href.startsWith("/") && !href.startsWith("//")) {
    const slug = journalSlugFromHref(href);
    if (slug !== null && !publishedSlugs.has(slug)) {
      return { kind: "unavailable", href };
    }
    return { kind: "internal", href };
  }

  return { kind: "unavailable", href };
}

export function createJournalLinkResolver(
  publishedSlugs: Iterable<string>,
): JournalLinkResolver {
  const slugs = new Set(publishedSlugs);
  return (href) => resolveInlineHref(href, slugs);
}
