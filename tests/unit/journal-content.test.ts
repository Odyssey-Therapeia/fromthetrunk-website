import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it.each(["/blog1a.avif", "/blog1b.avif"])("accepts the approved root image %s", (src) => {
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
    ).toBe("/journal/preloved-sarees-meaning/cover.png");
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
    expect(article?.socialImage).toBeNull();
  });

  it("every committed article validates and only links to site paths or published stories", () => {
    const articles = getAllJournalArticles();
    expect(articles).toHaveLength(5);

    const published = new Set(getPublishedJournalArticles().map((article) => article.slug));
    expect(readPublishedJournalSlugs()).toEqual([...published].sort());
    const resolve = getJournalLinkResolver();
    for (const article of articles) {
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
      for (const href of texts.flatMap(collectInlineHrefs)) {
        const resolved = resolve(href);
        expect(["internal", "anchor", "external", "unavailable"]).toContain(resolved.kind);
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
    expect(resolve("/journal/how-to-care-for-silk-sarees").kind).toBe("internal");
    expect(resolve("/journal/indian-saree-fabrics-and-weaves").kind).toBe("unavailable");
    expect(resolve("/journal/how-to-care-for-sarees").kind).toBe("unavailable");
  });
});
