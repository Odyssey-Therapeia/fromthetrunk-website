import { journalArticlePath, journalOgImagePath } from "@/lib/journal/constants";
import { formatJournalDate, journalDateTime } from "@/lib/journal/format-date";
import { inlineToPlainText } from "@/lib/journal/inline";
import { readingMinutes } from "@/lib/journal/reading-time";
import { normalizeJournalSearchText } from "@/lib/journal/search";
import type { JournalArticleSource, JournalBlock, JournalImage } from "@/lib/journal/schema";
import { absoluteUrl } from "@/lib/seo/site-url";
import { articleVisibleText, bodyPlainText, countWords, slugifyHeading } from "@/lib/journal/text";

export type JournalRenderBlock =
  | Exclude<JournalBlock, { type: "heading" | "list" }>
  | { type: "heading"; text: string; id: string; level: 2 | 3 }
  | { type: "list"; ordered: boolean; items: string[] };

export type JournalArticle = Omit<JournalArticleSource, "body" | "cover"> & {
  path: string;
  body: JournalRenderBlock[];
  cover: JournalImage | null;
  /**
   * JPG or PNG for og:image, Pinterest and BlogPosting: the 1200x630
   * `public/journal/og/<slug>.jpg` cut from the cover, else the cover itself,
   * or a same-named .jpg/.jpeg/.png beside an AVIF/WebP cover. WhatsApp,
   * Facebook and X do not render AVIF previews, so null means "use the site
   * default".
   */
  socialImage: string | null;
  /** updatedAt when present, otherwise publishedAt. */
  modifiedAt: string | undefined;
  dateLabel: string | null;
  readingMinutes: number;
  /** Words in the body, for BlogPosting.wordCount. */
  wordCount: number;
  searchText: string;
};

/** The slice of an article the index page sends to the browser. */
export type JournalCardData = Pick<
  JournalArticle,
  "cover" | "dateLabel" | "description" | "path" | "publishedAt" | "readingMinutes" | "slug" | "tag" | "title"
> & {
  /** Absolute article URL for the share menu. */
  shareUrl: string;
};

export type DeriveOptions = {
  /** Whether `public<src>` exists. Figures and covers without a file are dropped. */
  imageExists: (src: string) => boolean;
  onMissingImage?: (src: string) => void;
};

const SOCIAL_IMAGE_FILE = /\.(?:jpe?g|png)$/;

export function journalSocialImage(
  cover: JournalImage | null,
  imageExists: (src: string) => boolean,
  slug?: string,
): string | null {
  if (!cover) return null;
  if (slug && imageExists(journalOgImagePath(slug))) return journalOgImagePath(slug);
  if (SOCIAL_IMAGE_FILE.test(cover.src)) return cover.src;
  const stem = cover.src.replace(/\.[a-z0-9]+$/, "");
  return [".jpg", ".jpeg", ".png"].map((ext) => stem + ext).find(imageExists) ?? null;
}

function withHeadingIds(body: readonly JournalBlock[]): JournalRenderBlock[] {
  const used = new Map<string, number>();
  return body.map((block) => {
    if (block.type === "list") {
      return { type: "list", ordered: block.ordered ?? false, items: block.items };
    }
    if (block.type !== "heading") return block;
    const base = slugifyHeading(inlineToPlainText(block.text));
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return { type: "heading", text: block.text, level: block.level ?? 2, id: seen === 0 ? base : `${base}-${seen + 1}` };
  });
}

export function deriveJournalArticle(
  source: JournalArticleSource,
  { imageExists, onMissingImage }: DeriveOptions,
): JournalArticle {
  const available = (src: string) => {
    const exists = imageExists(src);
    if (!exists) onMissingImage?.(src);
    return exists;
  };

  // A figure is shown only when every one of its files exists, so a caption
  // written for a pair never sits under a single image.
  const visibleBody = source.body.filter(
    (block) =>
      block.type !== "figure" ||
      block.images.map((item) => available(item.src)).every(Boolean),
  );
  const cover = source.cover && available(source.cover.src) ? source.cover : null;
  const modifiedAt = source.updatedAt ?? source.publishedAt;

  return {
    ...source,
    path: journalArticlePath(source.slug),
    body: withHeadingIds(visibleBody),
    cover,
    socialImage: journalSocialImage(cover, imageExists, source.slug),
    modifiedAt,
    dateLabel: source.publishedAt ? formatJournalDate(source.publishedAt) : null,
    readingMinutes: readingMinutes(articleVisibleText(source, visibleBody)),
    wordCount: countWords(bodyPlainText(visibleBody)),
    searchText: normalizeJournalSearchText(
      [
        source.title,
        source.description,
        source.tag,
        source.seo.primaryKeyword ?? "",
        ...source.seo.keywords,
        // Only what renders: a dropped figure's caption is not searchable.
        bodyPlainText(visibleBody),
      ].join(" "),
    ),
  };
}

/**
 * Published = not a draft, and either undated or dated on or before `now`
 * (the date is read as IST midnight, like every other Journal date).
 */
export function isJournalArticlePublished(
  article: Pick<JournalArticleSource, "draft" | "publishedAt">,
  now: number,
): boolean {
  if (article.draft) return false;
  return !article.publishedAt || Date.parse(journalDateTime(article.publishedAt)) <= now;
}

/** Dated stories newest first, then undated stories; title breaks date ties. */
export function compareJournalArticles(
  a: Pick<JournalArticleSource, "publishedAt" | "title">,
  b: Pick<JournalArticleSource, "publishedAt" | "title">,
): number {
  const aDate = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
  const bDate = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
  return aDate !== bDate ? (bDate > aDate ? 1 : -1) : a.title.localeCompare(b.title, "en");
}

export function toJournalCardData(article: JournalArticle): JournalCardData {
  return {
    slug: article.slug,
    path: article.path,
    tag: article.tag,
    title: article.title,
    description: article.description,
    cover: article.cover,
    publishedAt: article.publishedAt,
    dateLabel: article.dateLabel,
    readingMinutes: article.readingMinutes,
    shareUrl: absoluteUrl(article.path),
  };
}
