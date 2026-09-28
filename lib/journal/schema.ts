import { z } from "zod";

import { JOURNAL_CONTENT_DIR } from "@/lib/journal/constants";
import { InlineMarkupError, parseInline } from "@/lib/journal/inline";

/**
 * Content schema for `content/journal/<slug>.json`.
 *
 * Objects are strict, so a misspelt key fails validation instead of being
 * silently ignored. Every string that allows inline markup is parsed here, so
 * unbalanced `**`, `*` or `[text](href)` fails the build with the file name
 * and field path in the message.
 */

export const JOURNAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

const IMAGE_SRC = /^\/journal\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9][a-z0-9._-]*\.(?:avif|webp|jpe?g|png)$/;
const ROOT_IMAGE_SOURCES = new Set(["/blog1a.avif", "/blog1b.avif"]);

/** Only article-folder images and the two supplied root photographs are allowed. */
export function isJournalImageSource(src: string): boolean {
  return ROOT_IMAGE_SOURCES.has(src) || IMAGE_SRC.test(src);
}

const plainText = z.string().trim().min(1, "must not be empty");

const inlineText = plainText.superRefine((value, ctx) => {
  try {
    parseInline(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof InlineMarkupError ? error.message : String(error),
    });
  }
});

/** Date.parse rolls 2026-02-30 over to 2 March, so check the parts round-trip. */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    !Number.isNaN(Date.parse(value))
  );
}

const isoDate = z
  .string()
  .regex(ISO_DATE, "must be an ISO date such as 2026-09-28 or 2026-09-28T09:30:00+05:30")
  .refine(isRealCalendarDate, "must be a real calendar date");

const image = z.strictObject({
  src: z
    .string()
    .refine(
      isJournalImageSource,
      "must be /journal/<slug>/<file>.avif|webp|jpg|png (lowercase file name), /blog1a.avif or /blog1b.avif",
    ),
  alt: plainText,
});

const paragraphBlock = z.strictObject({
  type: z.literal("paragraph"),
  text: inlineText,
});

const headingBlock = z.strictObject({
  type: z.literal("heading"),
  text: inlineText,
  level: z.union([z.literal(2), z.literal(3)]).optional(),
});

const listBlock = z.strictObject({
  type: z.literal("list"),
  ordered: z.boolean().optional(),
  items: z.array(inlineText).min(1, "needs at least one item"),
});

const tableBlock = z
  .strictObject({
    type: z.literal("table"),
    columns: z.array(plainText).min(2, "needs at least two columns"),
    rows: z.array(z.array(inlineText)).min(1, "needs at least one row"),
  })
  .superRefine((table, ctx) => {
    table.rows.forEach((row, rowIndex) => {
      if (row.length !== table.columns.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", rowIndex],
          message: `has ${row.length} cells but the table has ${table.columns.length} columns`,
        });
      }
    });
  });

const figureBlock = z.strictObject({
  type: z.literal("figure"),
  images: z.array(image).min(1, "needs one image").max(2, "takes at most two images"),
  caption: inlineText.optional(),
});

export const journalBlockSchema = z.discriminatedUnion("type", [
  paragraphBlock,
  headingBlock,
  listBlock,
  tableBlock,
  figureBlock,
]);

export const journalArticleSchema = z
  .strictObject({
    slug: z.string().regex(JOURNAL_SLUG_PATTERN, "must be lowercase words joined by hyphens"),
    draft: z.boolean().optional(),
    tag: plainText,
    title: plainText,
    description: plainText,
    seo: z.strictObject({
      title: plainText,
      description: plainText,
      primaryKeyword: plainText.optional(),
      keywords: z.array(plainText).default([]),
    }),
    publishedAt: isoDate.optional(),
    updatedAt: isoDate.optional(),
    cover: image.nullable().optional(),
    body: z.array(journalBlockSchema).min(1, "needs at least one block"),
    faq: z
      .strictObject({
        heading: plainText,
        items: z
          .array(z.strictObject({ question: plainText, answer: inlineText }))
          .min(1, "needs at least one question"),
      })
      .optional(),
    about: inlineText.optional(),
    closingLine: plainText.optional(),
  })
  .superRefine((article, ctx) => {
    const imageFolder = `/journal/${article.slug}/`;
    const checkImage = (src: string, path: (string | number)[]) => {
      if (!src.startsWith(imageFolder) && !ROOT_IMAGE_SOURCES.has(src)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `must live in public${imageFolder} or be /blog1a.avif or /blog1b.avif`,
        });
      }
    };

    if (article.cover) checkImage(article.cover.src, ["cover", "src"]);
    article.body.forEach((block, blockIndex) => {
      if (block.type !== "figure") return;
      block.images.forEach((item, imageIndex) =>
        checkImage(item.src, ["body", blockIndex, "images", imageIndex, "src"]),
      );
    });

    if (article.updatedAt && article.publishedAt && Date.parse(article.updatedAt) < Date.parse(article.publishedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "must not be earlier than publishedAt",
      });
    }
  });

export type JournalArticleSource = z.infer<typeof journalArticleSchema>;
export type JournalBlock = z.infer<typeof journalBlockSchema>;
export type JournalImage = z.infer<typeof image>;

export class JournalContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalContentError";
  }
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(file)";
  return path
    .map((part, index) =>
      typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`,
    )
    .join("");
}

/**
 * Validates one article file. `fileName` is the bare file name, for example
 * `preloved-sarees-meaning.json`; the slug inside must match it.
 */
export function parseJournalArticle(fileName: string, raw: unknown): JournalArticleSource {
  const location = `${JOURNAL_CONTENT_DIR}/${fileName}`;
  const result = journalArticleSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${formatIssuePath(issue.path)}: ${issue.message}`)
      .join("\n");
    throw new JournalContentError(`Invalid journal article ${location}:\n${issues}`);
  }

  const expectedSlug = fileName.replace(/\.json$/, "");
  if (result.data.slug !== expectedSlug) {
    throw new JournalContentError(
      `Invalid journal article ${location}:\n  - slug: "${result.data.slug}" must match the file name "${expectedSlug}"`,
    );
  }

  return result.data;
}
