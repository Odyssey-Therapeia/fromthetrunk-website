import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { journalFaqItemIds } from "@/lib/journal/accordion";
import { getAllJournalArticles, getJournalLinkResolver, getPublishedJournalArticles } from "@/lib/journal/articles";
import type { JournalArticle } from "@/lib/journal/derive";
import { collectInlineHrefs } from "@/lib/journal/inline";
import {
  JOURNAL_FABRIC_HUBS,
  JOURNAL_JOURNEYS,
  JOURNAL_PLANNED_SLUGS,
  journalNextAction,
} from "@/lib/journal/journeys";
import { journalSlugFromHref } from "@/lib/journal/links";

const APP_DIR = path.join(process.cwd(), "app");

/**
 * Whether `pathname` is served by an App Router page. Route groups are
 * transparent and a `[param]` folder matches one segment; catch-alls are
 * ignored, since `app/(site)/[...slug]` would otherwise match every path.
 */
function hasAppPage(pathname: string, dir: string = APP_DIR): boolean {
  const [segment, ...rest] = pathname.split("/").filter(Boolean);
  const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  if (segment === undefined) {
    if (["page.tsx", "page.ts"].some((file) => existsSync(path.join(dir, file)))) return true;
    return entries.some((entry) => /^\(.+\)$/.test(entry.name) && hasAppPage("", path.join(dir, entry.name)));
  }

  return entries.some((entry) => {
    const child = path.join(dir, entry.name);
    if (/^\(.+\)$/.test(entry.name)) return hasAppPage(pathname, child);
    if (entry.name === segment || /^\[[^.\]]+\]$/.test(entry.name)) return hasAppPage(rest.join("/"), child);
    return false;
  });
}

function articleTexts(article: JournalArticle): string[] {
  return [
    ...article.body.flatMap((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
          return [block.text];
        case "list":
          return block.items;
        case "table":
          return block.rows.flat();
        case "figure":
          return block.caption ? [block.caption] : [];
      }
    }),
    ...(article.faq?.items.map((item) => item.answer) ?? []),
    article.about ?? "",
  ];
}

const FABRIC_PAGE = readFileSync(path.join(APP_DIR, "(site)/collection/fabric/[fabric]/page.tsx"), "utf8");

describe("Journal links", () => {
  const articles = getAllJournalArticles();
  const published = new Set(getPublishedJournalArticles().map(({ slug }) => slug));
  const resolve = getJournalLinkResolver();

  it("sends every internal link to a real page, a live story or a planned one shown as text", () => {
    for (const article of articles) {
      for (const href of articleTexts(article).flatMap(collectInlineHrefs)) {
        const resolved = resolve(href);
        if (resolved.kind === "anchor" || resolved.kind === "external") continue;

        const slug = journalSlugFromHref(href);
        if (slug !== null) {
          if (published.has(slug)) {
            expect(resolved.kind, `${article.slug} → ${href}`).toBe("internal");
          } else {
            // Unwritten stories must be planned ones, and never render as a link.
            expect(JOURNAL_PLANNED_SLUGS, `${article.slug} → ${href}`).toContain(slug);
            expect(resolved.kind).toBe("unavailable");
          }
          continue;
        }

        expect(resolved.kind, `${article.slug} → ${href}`).toBe("internal");
        const pathname = href.split(/[?#]/)[0] ?? "";
        expect(hasAppPage(pathname), `${article.slug} → ${href}`).toBe(true);
      }
    }
  });

  it("points in-page anchors at a heading in the same story", () => {
    for (const article of articles) {
      const ids = new Set(article.body.flatMap((block) => (block.type === "heading" ? [block.id] : [])));
      if (article.faq) ids.add("journal-faq");
      for (const id of journalFaqItemIds(article)) ids.add(id);
      for (const href of articleTexts(article).flatMap(collectInlineHrefs)) {
        if (href.startsWith("#")) expect(ids, `${article.slug} → ${href}`).toContain(href.slice(1));
      }
    }
  });

  it("gives every planned story one next action to a real page", () => {
    for (const slug of JOURNAL_PLANNED_SLUGS) {
      const action = journalNextAction(slug);
      const hrefs = action.options?.map((option) => option.href) ?? [action.href];
      for (const href of hrefs) expect(hasAppPage(href), `${slug} → ${href}`).toBe(true);
    }
    for (const hub of JOURNAL_FABRIC_HUBS) {
      expect(FABRIC_PAGE).toContain(`"${hub.href.split("/").pop()}"`);
    }
    expect(hasAppPage("/journal")).toBe(true);
    expect(hasAppPage("/not-a-page")).toBe(false);
  });

  it("files every planned story under exactly one journey", () => {
    const slugs = JOURNAL_JOURNEYS.flatMap((journey) => journey.slugs);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toHaveLength(8);
    for (const slug of published) expect(JOURNAL_PLANNED_SLUGS).toContain(slug);
  });
});
