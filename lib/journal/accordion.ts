import type { JournalArticle, JournalRenderBlock } from "@/lib/journal/derive";
import { slugifyHeading } from "@/lib/journal/text";

type HeadingBlock = Extract<JournalRenderBlock, { type: "heading" }>;

/**
 * Body sections whose H3 subsections render as expandable cards, keyed by
 * article slug, valued by the parent H2's id. Opt-in per article: only a
 * reference section that readers scan for their one fabric belongs here, never
 * the content most readers came for.
 */
export const JOURNAL_EXPANDABLE_SECTIONS: Readonly<Record<string, string>> = {
  "how-to-care-for-sarees": "how-do-you-care-for-each-saree-fabric",
};

/** A block with its index in the article body (the lede and table labels use it). */
export type IndexedJournalBlock = { block: JournalRenderBlock; index: number };

export type JournalSubsection = { heading: HeadingBlock; blocks: IndexedJournalBlock[] };

export type JournalBodySegment =
  | { kind: "block"; block: JournalRenderBlock; index: number }
  | { kind: "subsections"; subsections: JournalSubsection[] };

/**
 * Splits the body so the H3 subsections under `sectionId` become one group.
 * The group must be clean: the H2 is followed straight away by at least two
 * H3s, and it runs to the next H2 or the end. Anything else is left as plain
 * blocks, so a later content edit can never swallow text into a panel.
 */
export function segmentJournalBody(
  body: readonly JournalRenderBlock[],
  sectionId?: string,
): JournalBodySegment[] {
  const plain = body.map((block, index): JournalBodySegment => ({ kind: "block", block, index }));
  if (!sectionId) return plain;

  const parent = body.findIndex((block) => block.type === "heading" && block.level === 2 && block.id === sectionId);
  const first = body[parent + 1];
  if (parent < 0 || first?.type !== "heading" || first.level !== 3) return plain;

  let end = body.findIndex((block, index) => index > parent && block.type === "heading" && block.level === 2);
  if (end < 0) end = body.length;

  const subsections: JournalSubsection[] = [];
  for (let index = parent + 1; index < end; index += 1) {
    const block = body[index];
    if (block.type === "heading" && block.level === 3) subsections.push({ heading: block, blocks: [] });
    else subsections[subsections.length - 1]?.blocks.push({ block, index });
  }
  if (subsections.length < 2 || subsections.some((subsection) => subsection.blocks.length === 0)) return plain;

  return [...plain.slice(0, parent + 1), { kind: "subsections", subsections }, ...plain.slice(end)];
}

/**
 * Stable anchor ids for the FAQ questions, slugged from the question and kept
 * clear of the body's heading ids (a clash gets `-2`, as repeated headings do).
 */
export function journalFaqItemIds(article: Pick<JournalArticle, "body" | "faq">): string[] {
  const used = new Set(article.body.flatMap((block) => (block.type === "heading" ? [block.id] : [])));
  used.add("journal-faq");
  return (article.faq?.items ?? []).map(({ question }) => {
    const base = slugifyHeading(question);
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}
