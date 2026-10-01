import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import nextConfig from "@/next.config";
import { JournalArticleBody } from "@/components/journal/journal-article-body";
import { JournalArticleHero } from "@/components/journal/journal-article-hero";
import { KeywordContentPage } from "@/components/seo/keyword-content-page";
import { getLiveJournalArticles } from "@/lib/journal/articles";
import { createJournalLinkResolver } from "@/lib/journal/links";
import { journalArticleMetadata, journalIndexMetadata } from "@/lib/journal/seo";
import { keywordLandingMetadata, keywordLandingPages } from "@/lib/seo/keyword-landing-pages";
import { getCanonicalOrigin } from "@/lib/seo/site-url";

vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
}));
vi.mock("@/lib/ports/catalog-search", () => ({
  searchProducts: vi.fn(),
}));

const ORIGIN = "https://www.fromthetrunk.shop";
const LEGACY = "/guides/what-is-a-pre-loved-saree";
const MEANING = "/journal/preloved-sarees-meaning";
// Case-insensitive hyphen check, plus an exact mixed-case check: plain
// "preloved" and "Preloved" are both valid.
function expectPublicSpelling(copy: string) {
  expect(copy).not.toMatch(/pre[-\u2010-\u2015]loved/i);
  expect(copy).not.toContain("PreLoved");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Preloved public copy and technical SEO", () => {
  it("keeps ordinary storefront strings consistent without changing legacy URLs", () => {
    const roots = [
      "app/(site)", "components/sections", "components/layout",
      "components/product", "components/errors", "components/seo", "lib/seo",
      "lib/commerce/product-condition.ts", "lib/products/display-details.ts",
      "lib/content/seed/homepage-blocks.ts", "app/llms.txt/route.ts",
    ];
    // The work order explicitly excludes legal, checkout and auth edits.
    const excluded = /(?:^|\/)(?:policies|return-policy|terms-of-service|checkout|account|auth)(?:\/|$)/;
    const files = (relative: string): string[] => relative.endsWith(".ts") || relative.endsWith(".tsx")
      ? [relative]
      : readdirSync(relative, { withFileTypes: true }).flatMap((entry) => {
          const child = path.join(relative, entry.name);
          if (excluded.test(child)) return [];
          return entry.isDirectory() ? files(child) : /\.tsx?$/.test(child) ? [child] : [];
        });
    const failures: string[] = [];
    for (const file of roots.flatMap(files)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
          const value = node.text;
          // Inbound route names, search mappings and URLs keep compatibility.
          if (!value.startsWith("/") && !value.startsWith("http") && !/^[a-z]+(?:-[a-z]+)+$/.test(value)
            && (/pre[-\u2010-\u2015]loved/i.test(value) || value.includes("PreLoved"))) {
            failures.push(`${file}: ${value.trim()}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(failures).toEqual([]);
  });

  it("renders all eight Journal stories with consistent copy and no meta-keywords", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const articles = getLiveJournalArticles();
    expect(articles).toHaveLength(8);
    expect(journalIndexMetadata().robots).toEqual({ index: true, follow: true });
    for (const article of articles) {
      const metadata = journalArticleMetadata(article);
      expect(metadata).not.toHaveProperty("keywords");
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expectPublicSpelling(JSON.stringify(metadata));
      const html = renderToStaticMarkup(<>
        <JournalArticleHero article={article} shareUrl={article.path} shareImageUrl={null} />
        <JournalArticleBody body={article.body} resolveLink={createJournalLinkResolver(articles.map(({ slug }) => slug))} />
      </>);
      expectPublicSpelling(html);
    }
  });

  it("uses consistent rendered guide copy while preserving inbound route names", () => {
    for (const config of keywordLandingPages) {
      expect(config.primaryKeyword).not.toMatch(/\bpre loved\b/i);
      if (config.type !== "guide") continue;
      const html = renderToStaticMarkup(<KeywordContentPage config={config} />);
      // Route literals in attributes and JSON-LD retain their historical slugs.
      const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "");
      expectPublicSpelling(text);
    }
  });

  it.each([
    "https://fromthetrunk.shop", "http://www.fromthetrunk.shop",
    "https://other.example", "https://preview.vercel.app", "http://localhost:3000",
    ORIGIN,
  ])("pins production canonical origin for %s", (configured) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", configured);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getCanonicalOrigin()).toBe(ORIGIN);
  });

  it("retains Google/Bing access and AI training crawler exclusions", () => {
    const rules = robots().rules;
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ userAgent: "*", allow: "/" }),
      expect.objectContaining({ userAgent: expect.arrayContaining(["GPTBot", "ClaudeBot", "Google-Extended"]), disallow: "/" }),
    ]));
    for (const rule of Array.isArray(rules) ? rules : [rules]) {
      const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
      if (agents.some((agent) => ["*", "Googlebot", "Bingbot"].includes(agent ?? ""))) {
        expect(rule.disallow).not.toBe("/");
        expect(rule.disallow).not.toContain("/journal");
        expect(rule.disallow).not.toContain("/collection");
      }
    }
  });

  it("permanently redirects the legacy guide and includes only eligible sitemap routes", async () => {
    vi.stubEnv("SITE_URL", ORIGIN);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    expect(await nextConfig.redirects?.()).toContainEqual({ source: LEGACY, destination: MEANING, permanent: true });
    const { searchProducts } = await import("@/lib/ports/catalog-search");
    const sitemap = (await import("@/app/sitemap")).default;
    for (const count of [0, 3]) {
      vi.mocked(searchProducts).mockResolvedValue({ products: [], facets: {}, totalDocs: count } as never);
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(urls).toContain(`${ORIGIN}/journal`);
      expect(urls).not.toContain(`${ORIGIN}${LEGACY}`);
      expect(urls.filter((url) => url.startsWith(`${ORIGIN}/journal/`))).toHaveLength(8);
      expect(urls.some((url) => /\/(admin|account|checkout|search)(\/|$)/.test(url))).toBe(false);
      for (const config of keywordLandingPages.filter((page) => page.type === "fabric")) {
        expect(urls.includes(`${ORIGIN}${config.canonicalPath}`)).toBe(count >= config.minProductCount);
        expect(keywordLandingMetadata(config, count).robots).toEqual({ index: count >= config.minProductCount, follow: true });
        expectPublicSpelling(JSON.stringify(keywordLandingMetadata(config, count)));
      }
    }
  });
});
