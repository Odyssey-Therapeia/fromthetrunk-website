import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { JOURNAL_CONTENT_DIR } from "@/lib/journal/constants";
import {
  compareJournalArticles,
  deriveJournalArticle,
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
// server bundle traces `content/journal`, `public/journal` and the two exact
// root photographs rather than the whole project. ISR reads them at runtime.
const contentDir = () => path.join(process.cwd(), "content", "journal");
const JOURNAL_IMAGE_PREFIX = "/journal/";
const imagePath = (src: string): string | null => {
  if (src === "/blog1a.avif") return path.join(process.cwd(), "public", "blog1a.avif");
  if (src === "/blog1b.avif") return path.join(process.cwd(), "public", "blog1b.avif");
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

/** Published articles only (no drafts), newest first. */
export function getPublishedJournalArticles(): JournalArticle[] {
  return getAllJournalArticles().filter((article) => !article.draft);
}

export function getPublishedJournalArticle(slug: string): JournalArticle | null {
  return getPublishedJournalArticles().find((article) => article.slug === slug) ?? null;
}

export function getJournalLinkResolver(): JournalLinkResolver {
  return createJournalLinkResolver(getPublishedJournalArticles().map((article) => article.slug));
}
