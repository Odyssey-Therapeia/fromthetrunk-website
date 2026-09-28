/**
 * Journal constants shared by server and client code.
 *
 * `JOURNAL_LABEL` is the single source for the section's visible name. The
 * header, footer, breadcrumbs, index eyebrow and index title all read it, so
 * renaming the section (for example to "Blogs") is a one-line edit here. The
 * URL stays `/journal` either way.
 */
export const JOURNAL_LABEL = "Journal";

export const JOURNAL_PATH = "/journal";

/** Repo-relative folder holding one `<slug>.json` file per article. */
export const JOURNAL_CONTENT_DIR = "content/journal";

/** Reading speed used for the "N min read" label. */
export const JOURNAL_WORDS_PER_MINUTE = 200;

export function journalArticlePath(slug: string): string {
  return `${JOURNAL_PATH}/${slug}`;
}
