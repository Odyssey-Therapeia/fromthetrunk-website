import { journalArticlePath } from "@/lib/journal/constants";
import { formatJournalDate } from "@/lib/journal/format-date";
import { inlineToPlainText } from "@/lib/journal/inline";
import { readingMinutes } from "@/lib/journal/reading-time";
import { normalizeJournalSearchText } from "@/lib/journal/search";
import type { JournalArticleSource, JournalBlock, JournalImage } from "@/lib/journal/schema";
import { articleVisibleText, bodyPlainText, countWords, slugifyHeading } from "@/lib/journal/text";

export type JournalRenderBlock =
  | Exclude<JournalBlock, { type: "heading" | "list" }>
  | { type: "heading"; text: string; id: string }
  | { type: "list"; ordered: boolean; items: string[] };

export type JournalArticle = Omit<JournalArticleSource, "body" | "cover"> & {
  path: string;
  body: JournalRenderBlock[];
  cover: JournalImage | null;
  /**
   * JPG or PNG for og:image, Pinterest and BlogPosting: the cover itself, or a
   * same-named .jpg/.jpeg/.png beside an AVIF/WebP cover. WhatsApp, Facebook
   * and X do not render AVIF previews, so null means "use the site default".
   */
  socialImage: string | null;
  /** updatedAt when present, otherwise publishedAt. */
  modifiedAt: string;
  dateLabel: string;
  readingMinutes: number;
  /** Words in the body, for BlogPosting.wordCount. */
  wordCount: number;
  searchText: string;
};

/** The slice of an article the index page sends to the browser. */
export type JournalCardData = Pick<
  JournalArticle,
  "cover" | "dateLabel" | "description" | "path" | "publishedAt" | "readingMinutes" | "slug" | "tag" | "title"
>;

export type DeriveOptions = {
  /** Whether `public<src>` exists. Figures and covers without a file are dropped. */
  imageExists: (src: string) => boolean;
  onMissingImage?: (src: string) => void;
};

const SOCIAL_IMAGE_FILE = /\.(?:jpe?g|png)$/;

export function journalSocialImage(
  cover: JournalImage | null,
  imageExists: (src: string) => boolean,
): string | null {
  if (!cover) return null;
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
    return { type: "heading", text: block.text, id: seen === 0 ? base : `${base}-${seen + 1}` };
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
    socialImage: journalSocialImage(cover, imageExists),
    modifiedAt,
    dateLabel: formatJournalDate(source.publishedAt),
    readingMinutes: readingMinutes(articleVisibleText(source, visibleBody)),
    wordCount: countWords(bodyPlainText(visibleBody)),
    searchText: normalizeJournalSearchText(
      [
        source.title,
        source.description,
        source.tag,
        source.seo.primaryKeyword ?? "",
        ...source.seo.keywords,
        bodyPlainText(source.body),
      ].join(" "),
    ),
  };
}

/** Newest first; ties fall back to title so the order is stable. */
export function compareJournalArticles(
  a: Pick<JournalArticleSource, "publishedAt" | "title">,
  b: Pick<JournalArticleSource, "publishedAt" | "title">,
): number {
  const byDate = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  return byDate !== 0 ? byDate : a.title.localeCompare(b.title);
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
  };
}
