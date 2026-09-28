import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Slugs of the published (non-draft) articles in `content/journal`, read when
 * `next.config.ts` loads and inlined as `FTT_JOURNAL_PUBLISHED_SLUGS`, so the
 * proxy can 404 an unknown `/journal/*` path before the app shell streams a
 * 200. Article pages are built with `dynamicParams = false`, so this build-time
 * list is exactly the set of articles the site can serve.
 *
 * Deliberately light (no schema, no `server-only`, no path aliases) because
 * next.config imports it. The loader validates every file during the same
 * build and fails it on bad content, so a file skipped here is never published.
 */
export function readPublishedJournalSlugs(root: string = process.cwd()): string[] {
  const dir = path.join(root, "content", "journal");
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const slug = file.slice(0, -".json".length);
      try {
        const data = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
          slug?: unknown;
          draft?: unknown;
        };
        return data.slug === slug && data.draft !== true ? [slug] : [];
      } catch {
        return [];
      }
    })
    .sort();
}
