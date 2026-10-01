import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAllJournalArticles,
  getJournalLinkResolver,
  getPublishedJournalArticle,
  getPublishedJournalArticles,
} from "@/lib/journal/articles";
import { deriveJournalArticle } from "@/lib/journal/derive";
import { collectInlineHrefs } from "@/lib/journal/inline";
import { readPublishedJournalSlugs } from "@/lib/journal/published-slugs";
import { JournalContentError, parseJournalArticle, type JournalArticleSource } from "@/lib/journal/schema";
import { journalArticleJsonLd } from "@/lib/journal/seo";
import { keywordLandingByPath } from "@/lib/seo/keyword-landing-pages";

const ARTICLE_FILE = "preloved-sarees-meaning.json";
const realArticle = JSON.parse(
  readFileSync(path.join(process.cwd(), "content/journal", ARTICLE_FILE), "utf8"),
) as Record<string, unknown>;

const validArticle = (overrides: Record<string, unknown> = {}) => ({
  slug: "caring-for-silk",
  tag: "Care",
  title: "Caring for silk",
  description: "How to fold and store a silk saree.",
  seo: { title: "Caring for Silk Sarees | From The Trunk", description: "Fold, air and store silk." },
  publishedAt: "2026-10-01",
  cover: null,
  body: [{ type: "paragraph", text: "Fold it in **muslin**." }],
  ...overrides,
});

describe("journal content schema", () => {
  it("accepts the published payload article", () => {
    const article = parseJournalArticle(ARTICLE_FILE, realArticle);
    expect(article.slug).toBe("preloved-sarees-meaning");
    expect(article.seo.title).toBe("Preloved Sarees Meaning, Explained | From The Trunk");
  });

  it("accepts a minimal article and defaults seo keywords", () => {
    expect(parseJournalArticle("caring-for-silk.json", validArticle()).seo.keywords).toEqual([]);
  });

  it.each(
    [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [`/blog${n}a.avif`, `/blog${n}b.avif`]),
  )("accepts the approved root image %s", (src) => {
    const image = { src, alt: "Burgundy saree with gold floral motifs" };
    const article = parseJournalArticle("caring-for-silk.json", validArticle({
      cover: image,
      body: [{ type: "figure", images: [image] }],
    }));
    expect(article.cover).toEqual(image);
    expect(article.body).toEqual([{ type: "figure", images: [image] }]);
  });

  it.each([
    "/blog1c.avif", "/blog1a.jpg", "/blog1a.avif?width=800", "/blog1a.avif#image",
    "/blog/blog1a.avif", "/../blog1a.avif", "/journal/../blog1a.avif",
    "/journal/caring-for-silk/../../blog1a.avif", "/journal/caring-for-silk/%2e%2e/blog1a.avif",
    "//blog1a.avif", "https://example.com/blog1a.avif", "/Blog1a.avif",
    "/blog0a.avif", "/blog9a.avif", "/blog2c.avif", "/blog10a.avif",
  ])("rejects unapproved or unsafe image path %s", (src) => {
    const image = { src, alt: "Saree" };
    for (const overrides of [{ cover: image }, { body: [{ type: "figure", images: [image] }] }]) {
      expect(() => parseJournalArticle("caring-for-silk.json", validArticle(overrides)))
        .toThrow(JournalContentError);
    }
  });

  it("rejects a malformed slug", () => {
    expect(() =>
      parseJournalArticle("Caring_For_Silk.json", validArticle({ slug: "Caring_For_Silk" })),
    ).toThrow(/slug: must be lowercase words joined by hyphens/);
  });

  it("rejects a slug that does not match the file name", () => {
    expect(() => parseJournalArticle("silk-care.json", validArticle())).toThrow(
      /must match the file name "silk-care"/,
    );
  });

  it("rejects unbalanced inline markup with the field path", () => {
    const run = () =>
      parseJournalArticle(
        "caring-for-silk.json",
        validArticle({ body: [{ type: "paragraph", text: "Fold it in **muslin." }] }),
      );
    expect(run).toThrow(JournalContentError);
    expect(run).toThrow(/content\/journal\/caring-for-silk\.json[\s\S]*body\[0\]\.text: Unclosed bold/);
  });

  it("rejects unknown keys, bad tables, bad dates and images outside the article folder", () => {
    const cases: Record<string, unknown>[] = [
      { subtitle: "Unknown key" },
      { publishedAt: "28 Sep 2026" },
      { publishedAt: "2026-02-30" },
      { publishedAt: "2026-10-01", updatedAt: "2026-09-01" },
      { body: [{ type: "table", columns: ["A", "B"], rows: [["only one"]] }] },
      { body: [{ type: "quote", text: "Unsupported block" }] },
      { cover: { src: "/journal/another-article/cover.avif", alt: "Cover" } },
      { cover: { src: "/journal/caring-for-silk/Cover.JPG", alt: "Cover" } },
      { cover: { src: "/journal/caring-for-silk/cover.avif", alt: "" } },
      {
        body: [
          {
            type: "figure",
            images: [
              { src: "/journal/caring-for-silk/a.avif", alt: "A" },
              { src: "/journal/caring-for-silk/b.avif", alt: "B" },
              { src: "/journal/caring-for-silk/c.avif", alt: "C" },
            ],
          },
        ],
      },
    ];
    for (const overrides of cases) {
      expect(() => parseJournalArticle("caring-for-silk.json", validArticle(overrides))).toThrow(
        JournalContentError,
      );
    }
  });
});

describe("journal article derivation", () => {
  const source = parseJournalArticle(ARTICLE_FILE, realArticle);

  it("derives the reading time, date label and heading ids for the payload article", () => {
    const article = deriveJournalArticle(source, { imageExists: () => false });

    expect(article.readingMinutes).toBe(6);
    expect(article.dateLabel).toBe("28 Sep 2026");
    expect(article.modifiedAt).toBe("2026-09-28");
    expect(article.path).toBe("/journal/preloved-sarees-meaning");
    expect(article.body.filter((block) => block.type === "heading").map((block) => block.id)).toEqual([
      "preloved-pre-owned-second-hand-and-vintage-what-is-the-difference",
      "why-do-people-choose-preloved-sarees",
      "how-much-do-preloved-sarees-cost",
      "what-about-preloved-designer-sarees",
      "how-can-you-tell-a-preloved-saree-has-been-well-kept",
      "where-can-you-buy-preloved-sarees-online-in-india",
    ]);
  });

  it("drops figures and covers whose files are missing, and reports each missing file", () => {
    const missing: string[] = [];
    const article = deriveJournalArticle(
      source,
      { imageExists: () => false, onMissingImage: (src) => missing.push(src) },
    );

    expect(article.cover).toBeNull();
    expect(article.body.some((block) => block.type === "figure")).toBe(false);
    expect(missing).toEqual([
      "/blog1b.avif",
      "/blog1a.avif",
    ]);
  });

  it("keeps figures and the cover when the files exist", () => {
    const article = deriveJournalArticle(
      source,
      { imageExists: (src) => ["/blog1a.avif", "/blog1b.avif"].includes(src) },
    );
    expect(article.cover?.src).toBe("/blog1a.avif");
    expect(article.body.filter((block) => block.type === "figure")).toHaveLength(1);
  });

  it("picks a JPG or PNG social image for the cover, never the AVIF itself", () => {
    const cover = { src: "/journal/preloved-sarees-meaning/cover.avif", alt: "Cover" };
    const withFiles = (files: string[]) =>
      deriveJournalArticle({ ...source, cover }, { imageExists: (src) => files.includes(src) });

    expect(withFiles([cover.src]).socialImage).toBeNull();
    expect(withFiles([cover.src, "/journal/preloved-sarees-meaning/cover.jpg"]).socialImage).toBe(
      "/journal/preloved-sarees-meaning/cover.jpg",
    );
    expect(
      deriveJournalArticle(
        { ...source, cover: { src: "/journal/preloved-sarees-meaning/cover.png", alt: "Cover" } },
        { imageExists: () => true },
      ).socialImage,
    ).toBe("/journal/og/preloved-sarees-meaning.jpg");
    expect(
      deriveJournalArticle(
        { ...source, cover: { src: "/journal/preloved-sarees-meaning/cover.png", alt: "Cover" } },
        { imageExists: (src) => !src.startsWith("/journal/og/") },
      ).socialImage,
    ).toBe("/journal/preloved-sarees-meaning/cover.png");
    // The 1200x630 cut in public/journal/og/ wins over a same-named JPG, but only with a cover.
    expect(withFiles([cover.src, "/journal/preloved-sarees-meaning/cover.jpg", "/journal/og/preloved-sarees-meaning.jpg"]).socialImage)
      .toBe("/journal/og/preloved-sarees-meaning.jpg");
    expect(deriveJournalArticle({ ...source, cover: null }, { imageExists: () => true }).socialImage).toBeNull();
    expect(deriveJournalArticle(source, {
      imageExists: (src) => ["/blog1a.avif", "/blog1b.avif"].includes(src),
    }).socialImage).toBeNull();
  });

  it("suffixes duplicate heading ids", () => {
    const article = deriveJournalArticle(
      {
        ...source,
        body: [
          { type: "heading", text: "Care" },
          { type: "heading", text: "Care" },
        ],
      } as JournalArticleSource,
      { imageExists: () => true },
    );
    expect(article.body.map((block) => (block.type === "heading" ? block.id : null))).toEqual([
      "care",
      "care-2",
    ]);
  });

  it("indexes the title, description, tag, keywords and body for search", () => {
    const article = deriveJournalArticle(source, { imageExists: () => false });
    for (const term of ["what does preloved mean", "buying guide", "preowned sarees", "zari", "sabyasachi"]) {
      expect(article.searchText).toContain(term);
    }
  });
});

describe("journal loader", () => {
  let root: string;

  const write = (file: string, data: unknown) =>
    writeFileSync(path.join(root, "content/journal", file), JSON.stringify(data));

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "ftt-journal-"));
    mkdirSync(path.join(root, "content/journal"), { recursive: true });
    mkdirSync(path.join(root, "public/journal/caring-for-silk"), { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns published articles newest first and excludes drafts everywhere", () => {
    write("caring-for-silk.json", validArticle());
    write(
      "older-story.json",
      validArticle({
        slug: "older-story",
        title: "Older story",
        publishedAt: "2026-01-10",
        body: [{ type: "paragraph", text: "See [care](/journal/caring-for-silk) and [draft](/journal/draft-story)." }],
      }),
    );
    write("draft-story.json", validArticle({ slug: "draft-story", draft: true, publishedAt: "2026-12-01" }));

    expect(getAllJournalArticles().map((article) => article.slug)).toEqual([
      "draft-story",
      "caring-for-silk",
      "older-story",
    ]);
    expect(getPublishedJournalArticles().map((article) => article.slug)).toEqual([
      "caring-for-silk",
      "older-story",
    ]);
    expect(getPublishedJournalArticle("draft-story")).toBeNull();
    // The build-time list the proxy 404s against agrees with the loader.
    expect(readPublishedJournalSlugs()).toEqual(["caring-for-silk", "older-story"]);

    const resolve = getJournalLinkResolver();
    expect(resolve("/journal/caring-for-silk").kind).toBe("internal");
    expect(resolve("/journal/draft-story").kind).toBe("unavailable");
  });

  it("keeps a figure only when its file is in public/journal/<slug>/", () => {
    writeFileSync(path.join(root, "public/journal/caring-for-silk/fold.avif"), "");
    write(
      "caring-for-silk.json",
      validArticle({
        cover: { src: "/journal/caring-for-silk/cover.avif", alt: "Cover" },
        body: [
          { type: "paragraph", text: "Intro." },
          { type: "figure", images: [{ src: "/journal/caring-for-silk/fold.avif", alt: "Fold" }] },
          { type: "figure", images: [{ src: "/journal/caring-for-silk/missing.avif", alt: "Missing" }] },
        ],
      }),
    );

    const [article] = getPublishedJournalArticles();
    expect(article?.cover).toBeNull();
    expect(article?.body.map((block) => block.type)).toEqual(["paragraph", "figure"]);
    expect(console.warn).toHaveBeenCalledWith(
      "[journal] caring-for-silk.json: image public/journal/caring-for-silk/missing.avif not found; it will not render.",
    );
  });

  it("loads approved root files and keeps the default social image fallback", () => {
    write(ARTICLE_FILE, realArticle);
    writeFileSync(path.join(root, "public/blog1a.avif"), "");
    writeFileSync(path.join(root, "public/blog1b.avif"), "");

    const [article] = getPublishedJournalArticles();
    expect(article?.cover?.src).toBe("/blog1a.avif");
    expect(article?.body.filter((block) => block.type === "figure")).toEqual([
      { type: "figure", images: [{ src: "/blog1b.avif", alt: expect.any(String) }] },
    ]);
    expect(article?.socialImage).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("omits missing approved root files instead of finding same-named files in public/journal", () => {
    write(ARTICLE_FILE, realArticle);
    writeFileSync(path.join(root, "public/journal/blog1a.avif"), "");
    writeFileSync(path.join(root, "public/journal/blog1b.avif"), "");

    const [article] = getPublishedJournalArticles();
    expect(article?.cover).toBeNull();
    expect(article?.body.some((block) => block.type === "figure")).toBe(false);
    expect(article?.socialImage).toBeNull();
    for (const src of ["/blog1a.avif", "/blog1b.avif"]) {
      expect(console.warn).toHaveBeenCalledWith(
        `[journal] ${ARTICLE_FILE}: image public${src} not found; it will not render.`,
      );
    }
  });

  it("fails loudly on invalid JSON", () => {
    writeFileSync(path.join(root, "content/journal/broken.json"), "{ not json");
    expect(() => getAllJournalArticles()).toThrow(/content\/journal\/broken\.json: not valid JSON/);
  });

  it("returns nothing when the content folder is missing", () => {
    rmSync(path.join(root, "content"), { recursive: true, force: true });
    expect(getAllJournalArticles()).toEqual([]);
    expect(readPublishedJournalSlugs()).toEqual([]);
  });

  it("leaves unreadable or mismatched files out of the proxy's slug list", () => {
    write("caring-for-silk.json", validArticle());
    write("renamed.json", validArticle());
    writeFileSync(path.join(root, "content/journal/broken.json"), "{ not json");
    expect(readPublishedJournalSlugs()).toEqual(["caring-for-silk"]);
  });
});

describe("journal content in the repo", () => {
  it("renders both supplied photographs from the actual public files", () => {
    const article = getPublishedJournalArticle("preloved-sarees-meaning");
    expect(article?.cover?.src).toBe("/blog1a.avif");
    expect(article?.body.filter((block) => block.type === "figure")).toEqual([
      { type: "figure", images: [{ src: "/blog1b.avif", alt: expect.any(String) }] },
    ]);
    expect(article?.socialImage).toBe("/journal/og/preloved-sarees-meaning.jpg");
  });

  it("every committed article validates and only links to site paths or published stories", () => {
    const articles = getAllJournalArticles();
    expect(articles).toHaveLength(8);

    const published = new Set(getPublishedJournalArticles().map((article) => article.slug));
    expect(readPublishedJournalSlugs()).toEqual([...published].sort());
    const resolve = getJournalLinkResolver();
    for (const article of articles) {
      for (const href of articleHrefs(article)) {
        const resolved = resolve(href);
        expect(["internal", "anchor", "external"]).toContain(resolved.kind);
        if (href.startsWith("/journal/") && resolved.kind === "internal") {
          expect(published.has(href.split("/")[2]?.split(/[?#]/)[0] ?? "")).toBe(true);
        }
      }
    }
  });

  it("links the About block to the collection and to Instagram, and leaves unwritten guides as text", () => {
    const article = getAllJournalArticles().find((entry) => entry.slug === "preloved-sarees-meaning");
    const resolve = getJournalLinkResolver();

    expect(collectInlineHrefs(article?.about ?? "")).toEqual([
      "/collection",
      "https://www.instagram.com/from.thetrunk/",
    ]);
    expect(resolve("https://www.instagram.com/from.thetrunk/").kind).toBe("external");
    expect(resolve("/journal/how-to-identify-pure-silk-saree").kind).toBe("internal");
    expect(resolve("/journal/indian-saree-fabrics-and-weaves").kind).toBe("internal");
    expect(resolve("/journal/how-to-care-for-sarees").kind).toBe("internal");
    expect(resolve("/journal/a-guide-that-is-not-written-yet").kind).toBe("unavailable");
  });
});

/** Every inline href in an article: body, captions, FAQ answers and the About block. */
function articleHrefs(article: {
  body: JournalArticleSource["body"];
  faq?: JournalArticleSource["faq"];
  about?: string;
}): string[] {
  const texts = [
    ...article.body.flatMap((block) =>
      block.type === "paragraph" || block.type === "heading"
        ? [block.text]
        : block.type === "list"
          ? block.items
          : block.type === "table"
            ? block.rows.flat()
            : block.caption
              ? [block.caption]
              : [],
    ),
    ...(article.faq?.items.map((item) => item.answer) ?? []),
    article.about ?? "",
  ];
  return texts.flatMap(collectInlineHrefs);
}

/** Static pages under app/, with route groups removed, e.g. "/sell-your-saree". */
function staticSiteRoutes(): Set<string> {
  const routes = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry.startsWith("[") || entry.startsWith("@") || entry.startsWith("_")) continue;
        walk(full, entry.startsWith("(") ? segments : [...segments, entry]);
      } else if (entry === "page.tsx") {
        routes.add(`/${segments.join("/")}`);
      }
    }
  };
  walk(path.join(process.cwd(), "app"), []);
  return routes;
}

/**
 * The eight owner-approved articles. `n` is the article number in the owner's
 * PDFs, which fixes the image names `/blogNa.avif` (cover) and `/blogNb.avif`.
 */
const OWNER_ARTICLES = [
  { n: 1, slug: "preloved-sarees-meaning", publishedAt: "2026-09-28", faq: true },
  { n: 2, slug: "how-to-identify-pure-silk-saree", publishedAt: "2026-09-29", faq: true },
  { n: 3, slug: "how-to-care-for-silk-sarees", publishedAt: "2026-09-29", faq: true },
  { n: 4, slug: "where-to-sell-old-silk-sarees", publishedAt: "2026-09-29", faq: true },
  { n: 5, slug: "what-is-the-silk-mark", publishedAt: "2026-09-29", faq: false },
  { n: 6, slug: "buying-second-hand-sarees-online", publishedAt: "2026-09-29", faq: false },
  { n: 7, slug: "indian-saree-fabrics-and-weaves", publishedAt: "2026-09-29", faq: false },
  { n: 8, slug: "how-to-care-for-sarees", publishedAt: "2026-09-29", faq: false },
] as const;

describe("the eight owner-approved articles", () => {
  const routes = staticSiteRoutes();
  const published = new Set(readPublishedJournalSlugs());

  it.each(OWNER_ARTICLES)("article $n ($slug) is published and complete", ({ n, slug, publishedAt, faq }) => {
    const file = path.join(process.cwd(), "content/journal", `${slug}.json`);
    expect(existsSync(file)).toBe(true);
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const source = parseJournalArticle(`${slug}.json`, raw);

    expect(source.slug).toBe(slug);
    expect(source.draft).toBeUndefined();
    expect(published.has(slug)).toBe(true);
    expect(source.publishedAt).toBe(publishedAt);
    expect(source.updatedAt).toBeUndefined();

    expect(source.seo.title).toMatch(/\| From The Trunk$/);
    expect(source.seo.description.length).toBeGreaterThanOrEqual(70);
    expect(source.seo.description.length).toBeLessThanOrEqual(160);
    expect(source.description).toBe(source.seo.description);

    // The title is the page's only H1; body headings are H2 or H3.
    expect(source.title.trim()).not.toBe("");
    for (const block of source.body) {
      if (block.type === "heading") expect([undefined, 2, 3]).toContain(block.level);
    }

    // Every article shows its supplied photos: `/blogNa.avif` as the cover and
    // `/blogNb.avif` as its one figure, with a 1200x630 JPG for social previews.
    const figures = source.body.filter((block) => block.type === "figure");
    expect(source.cover?.src).toBe(`/blog${n}a.avif`);
    expect(figures.map((block) => block.images.map((image) => image.src))).toEqual([[`/blog${n}b.avif`]]);
    expect(existsSync(path.join(process.cwd(), "public/journal/og", `${slug}.jpg`))).toBe(true);

    expect(Boolean(source.faq)).toBe(faq);
    if (source.faq) expect(source.faq.heading).toBe("Questions people ask");
    expect(source.about).toMatch(/^\*\*About From The Trunk\.\*\* /);
    expect(collectInlineHrefs(source.about ?? "")).toEqual([
      "/collection",
      "https://www.instagram.com/from.thetrunk/",
    ]);
    expect(source.closingLine).toBe("Some treasures aren't made. They're found.");

    const resolve = getJournalLinkResolver();
    for (const href of articleHrefs(source)) {
      const resolved = resolve(href);
      if (!href.startsWith("/")) {
        expect(["external", "anchor"]).toContain(resolved.kind);
        continue;
      }
      expect(resolved.kind).toBe("internal");
      const pathname = href.split(/[?#]/)[0] ?? href;
      const exists =
        routes.has(pathname) ||
        keywordLandingByPath.has(pathname) ||
        (pathname.startsWith("/journal/") && published.has(pathname.split("/")[2] ?? ""));
      expect(exists, `${slug}: ${href} has no page`).toBe(true);
    }

    const article = getPublishedJournalArticle(slug);
    expect(article).not.toBeNull();
    const jsonLd = journalArticleJsonLd(article!);
    expect(jsonLd.author).toMatchObject({ "@type": "Organization", name: "From The Trunk" });
  });
});

describe("supplied Journal photos", () => {
  const sources = readdirSync(path.join(process.cwd(), "content/journal"))
    .filter((file) => file.endsWith(".json"))
    .map((file) =>
      parseJournalArticle(file, JSON.parse(readFileSync(path.join(process.cwd(), "content/journal", file), "utf8"))),
    );

  it.each(sources.map((source) => [source.slug, source] as const))("%s has a cover whose file exists", (_, source) => {
    expect(source.cover).not.toBeNull();
    expect(existsSync(path.join(process.cwd(), "public", source.cover!.src))).toBe(true);
  });

  it("every public/blog*.avif is used by an article", () => {
    const referenced = new Set(
      sources.flatMap((source) => [
        ...(source.cover ? [source.cover.src] : []),
        ...source.body.flatMap((block) => (block.type === "figure" ? block.images.map((image) => image.src) : [])),
      ]),
    );
    const supplied = readdirSync(path.join(process.cwd(), "public"))
      .filter((file) => /^blog.*\.avif$/.test(file))
      .map((file) => `/${file}`);
    expect(supplied.length).toBeGreaterThan(0);
    expect(supplied.filter((src) => !referenced.has(src))).toEqual([]);
  });
});
