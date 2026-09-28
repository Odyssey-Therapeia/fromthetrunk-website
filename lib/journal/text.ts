import { inlineToPlainText } from "@/lib/journal/inline";
import type { JournalArticleSource, JournalBlock } from "@/lib/journal/schema";

/** Visible text of one body block, with inline markup removed. */
export function blockPlainText(block: JournalBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [inlineToPlainText(block.text)];
    case "list":
      return block.items.map(inlineToPlainText);
    case "table":
      return [...block.columns, ...block.rows.flat().map(inlineToPlainText)];
    case "figure":
      return block.caption ? [inlineToPlainText(block.caption)] : [];
  }
}

export function bodyPlainText(body: readonly JournalBlock[]): string {
  return body.flatMap(blockPlainText).join("\n");
}

/**
 * Every piece of text a reader sees in the article: title, tag, description,
 * body, questions and answers, the about block and the closing line.
 */
export function articleVisibleText(
  article: Pick<
    JournalArticleSource,
    "about" | "closingLine" | "description" | "faq" | "tag" | "title"
  >,
  body: readonly JournalBlock[],
): string {
  return [
    article.tag,
    article.title,
    article.description,
    bodyPlainText(body),
    article.faq?.heading ?? "",
    ...(article.faq?.items.flatMap((item) => [
      item.question,
      inlineToPlainText(item.answer),
    ]) ?? []),
    article.about ? inlineToPlainText(article.about) : "",
    article.closingLine ?? "",
  ].join("\n");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** `Preloved, pre owned...: what is the difference?` -> `preloved-pre-owned-...-difference` */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Typographic apostrophes for display: `aren't` -> `aren’t`, `sarees'` ->
 * `sarees’`. Stored content keeps plain apostrophes so authors can type them;
 * metadata and JSON-LD use the stored text unchanged.
 */
export function smartApostrophes(text: string): string {
  return text
    .replace(/(\p{L}|\p{N})'(?=\p{L})/gu, "$1’")
    .replace(/(\p{L})'(?=\s|$|[.,;:!?)])/gu, "$1’");
}
