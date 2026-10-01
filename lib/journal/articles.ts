import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { JOURNAL_CONTENT_DIR } from "@/lib/journal/constants";
import {
  compareJournalArticles,
  deriveJournalArticle,
  isJournalArticlePublished,
  type JournalArticle,
} from "@/lib/journal/derive";
import { createJournalLinkResolver, type JournalLinkResolver } from "@/lib/journal/links";
import { isJournalImageSource, JournalContentError, parseJournalArticle } from "@/lib/journal/schema";

/**
 * Reads and validates every `content/journal/*.json` file.
 *
 * Runs at build time (static params, metadata, pages, sitemap). A file that
 * fails validation throws a `JournalContentError` naming the file and field,
 * which fails `next build`. Production builds read the folder once; dev
 * re-reads it on each request so edits show without a restart.
 */

// The folders are written out literally, not built from constants, so the
// server bundle traces `content/journal`, `public/journal` and the exact root
// photographs (`/blogNa.avif`, `/blogNb.avif`) rather than the whole project.
// ISR reads them at runtime.
const contentDir = () => path.join(process.cwd(), "content", "journal");
const JOURNAL_IMAGE_PREFIX = "/journal/";
const imagePath = (src: string): string | null => {
  if (src === "/blog1a.avif") return path.join(process.cwd(), "public", "blog1a.avif");
  if (src === "/blog1b.avif") return path.join(process.cwd(), "public", "blog1b.avif");
  if (src === "/blog2a.avif") return path.join(process.cwd(), "public", "blog2a.avif");
  if (src === "/blog2b.avif") return path.join(process.cwd(), "public", "blog2b.avif");
  if (src === "/blog3a.avif") return path.join(process.cwd(), "public", "blog3a.avif");
  if (src === "/blog3b.avif") return path.join(process.cwd(), "public", "blog3b.avif");
  if (src === "/blog4a.avif") return path.join(process.cwd(), "public", "blog4a.avif");
  if (src === "/blog4b.avif") return path.join(process.cwd(), "public", "blog4b.avif");
  if (src === "/blog5a.avif") return path.join(process.cwd(), "public", "blog5a.avif");
  if (src === "/blog5b.avif") return path.join(process.cwd(), "public", "blog5b.avif");
  if (src === "/blog6a.avif") return path.join(process.cwd(), "public", "blog6a.avif");
  if (src === "/blog6b.avif") return path.join(process.cwd(), "public", "blog6b.avif");
  if (src === "/blog7a.avif") return path.join(process.cwd(), "public", "blog7a.avif");
  if (src === "/blog7b.avif") return path.join(process.cwd(), "public", "blog7b.avif");
  if (src === "/blog8a.avif") return path.join(process.cwd(), "public", "blog8a.avif");
  if (src === "/blog8b.avif") return path.join(process.cwd(), "public", "blog8b.avif");
  if (!src.startsWith(JOURNAL_IMAGE_PREFIX) || !isJournalImageSource(src)) return null;
  return path.join(process.cwd(), "public", "journal", src.slice(JOURNAL_IMAGE_PREFIX.length));
};

function readArticles(): JournalArticle[] {
  const dir = contentDir();
  if (!existsSync(dir)) return [];

  const warned = new Set<string>();
  const articles = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      } catch (error) {
        throw new JournalContentError(
          `Invalid journal article ${JOURNAL_CONTENT_DIR}/${file}: not valid JSON (${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
      return deriveJournalArticle(parseJournalArticle(file, raw), {
        imageExists: (src) => {
          const filePath = imagePath(src);
          return filePath !== null && existsSync(filePath);
        },
        onMissingImage: (src) => {
          if (warned.has(src)) return;
          warned.add(src);
          console.warn(`[journal] ${file}: image public${src} not found; it will not render.`);
        },
      });
    });

  return articles.sort(compareJournalArticles);
}

let cached: JournalArticle[] | null = null;

/** Every article, drafts included, newest first. */
export function getAllJournalArticles(): JournalArticle[] {
  if (process.env.NODE_ENV !== "production") return readArticles();
  cached ??= readArticles();
  return cached;
}

/**
 * Every article that is not a draft, newest first, including stories
 * scheduled for a later date. This is the build-time set: article paths are
 * generated for these, and it matches the slug list the proxy 404s against.
 * Pages show readers `getLiveJournalArticles` instead.
 */
export function getPublishedJournalArticles(): JournalArticle[] {
  return getAllJournalArticles().filter((article) => !article.draft);
}

export function getPublishedJournalArticle(slug: string): JournalArticle | null {
  return getPublishedJournalArticles().find((article) => article.slug === slug) ?? null;
}

export function getJournalLinkResolver(): JournalLinkResolver {
  return createJournalLinkResolver(getPublishedJournalArticles().map((article) => article.slug));
}

/**
 * What readers see: not a draft, and publishedAt (IST midnight) has arrived.
 * Evaluated on every render rather than cached, so the index, sitemap, links
 * and article pages pick a scheduled story up at their next ISR revalidation
 * after its date, without a new build. Until then its page 404s.
 */
export function getLiveJournalArticles(now: number = Date.now()): JournalArticle[] {
  return getAllJournalArticles().filter((article) => isJournalArticlePublished(article, now));
}

export function getLiveJournalArticle(slug: string, now: number = Date.now()): JournalArticle | null {
  return getLiveJournalArticles(now).find((article) => article.slug === slug) ?? null;
}

/** Links to scheduled stories render as plain words until the story is live. */
export function getLiveJournalLinkResolver(now: number = Date.now()): JournalLinkResolver {
  return createJournalLinkResolver(getLiveJournalArticles(now).map((article) => article.slug));
}
