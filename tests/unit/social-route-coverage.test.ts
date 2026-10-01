import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import { getPublishedJournalArticles } from "@/lib/journal/articles";
import { journalArticleMetadata, journalIndexMetadata } from "@/lib/journal/seo";
import { keywordLandingMetadata, keywordLandingPages } from "@/lib/seo/keyword-landing-pages";
import { DEFAULT_SOCIAL_IMAGE, publicPageMetadata } from "@/lib/seo/metadata";
import { WHY_PAGE_METADATA } from "@/lib/seo/route-metadata";

vi.mock("@/lib/data/products", () => ({
  getProducts: vi.fn().mockResolvedValue({ docs: [] }),
  getTopViewedProducts: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/ports/catalog-search", () => ({
  searchProducts: vi.fn().mockResolvedValue({ products: [], facets: {}, totalDocs: 0 }),
}));

const ORIGIN = "https://www.fromthetrunk.shop";
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const pages = readdirSync(path.join(process.cwd(), "app"), { recursive: true })
  .map(String).filter((file) => file.endsWith("/page.tsx"))
  .map((file) => `app/${file}`).sort();

// Exhaustive classification: adding a page requires deciding its metadata and
// indexing policy, rather than silently inheriting the homepage's share URL.
const staticPublic = ["", "authentication", "contact", "faqs", "founders", "how-it-works", "our-team", "packing", "policies", "top-viewed"];
const specialized = ["[...slug]", "blouses", "collection", "collection/[slug]", "collection/fabric/[fabric]", "collection/occasion/[occasion]", "guides/[slug]", "journal", "journal/[slug]", "policies/[slug]", "our-story", "sell-your-saree", "why"];
const aliases = ["privacy-policy", "return-policy", "shipping-policy", "terms-of-service"];
const utility = ["404", "cart", "checkout", "checkout/confirmation", "search", "collection/e2e/drape-room"];
const sitePage = (route: string) => `app/(site)/${route ? `${route}/` : ""}page.tsx`;

function expectComplete(metadata: Metadata, route: string, type = "website") {
  const og = metadata.openGraph as Record<string, unknown>;
  const twitter = metadata.twitter as Record<string, unknown>;
  expect(metadata.title).toBeTruthy();
  expect(metadata.description).toBeTruthy();
  expect(metadata.alternates?.canonical).toBe(`${ORIGIN}${route}`);
  expect(og).toMatchObject({ type, url: `${ORIGIN}${route}`, siteName: "From The Trunk" });
  expect(og.title).toBeTruthy();
  expect(og.description).toBeTruthy();
  expect(twitter).toMatchObject({ card: "summary_large_image", title: og.title, description: og.description });
  const images = og.images as Array<Record<string, unknown>>;
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(image.url).toMatch(/^https:\/\//);
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.type).toMatch(/^image\/(jpeg|png)$/);
    expect(image.alt).toBeTruthy();
  }
  expect(twitter.images).toEqual(images);
  expect(JSON.stringify(metadata)).not.toMatch(/localhost|127\.0\.0\.1|\.vercel\.app/);
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", ORIGIN);
});

// Import real exported metadata without rendering pages or making DB calls.
const pageModules: Record<string, () => Promise<{ metadata: Metadata }>> = {
  "": () => import("@/app/(site)/page"),
  authentication: () => import("@/app/(site)/authentication/page"),
  contact: () => import("@/app/(site)/contact/page"),
  faqs: () => import("@/app/(site)/faqs/page"),
  founders: () => import("@/app/(site)/founders/page"),
  "how-it-works": () => import("@/app/(site)/how-it-works/page"),
  "our-team": () => import("@/app/(site)/our-team/page"),
  packing: () => import("@/app/(site)/packing/page"),
  policies: () => import("@/app/(site)/policies/page"),
  "top-viewed": () => import("@/app/(site)/top-viewed/page"),
};
afterEach(() => vi.unstubAllEnvs());

describe("public route metadata inventory", () => {
  it("classifies every HTML route and preserves private layout inheritance", () => {
    const classified = [...staticPublic, ...specialized, ...aliases, ...utility].map(sitePage);
    const privatePages = pages.filter((file) => file.startsWith("app/(site)/account/") || file.startsWith("app/(admin)/"));
    expect(pages).toEqual([...classified, ...privatePages].sort());
    expect(read("app/(site)/account/layout.tsx")).toContain("robots: CUSTOMER_NOINDEX_FOLLOW_ROBOTS");
    expect(read("app/(admin)/layout.tsx")).toContain("ADMIN_METADATA");
    for (const route of ["404", "cart", "checkout", "checkout/confirmation", "search"]) {
      expect(read(sitePage(route))).toContain("robots: CUSTOMER_NOINDEX_FOLLOW_ROBOTS");
    }
    expect(read(sitePage("collection/e2e/drape-room"))).toContain('process.env.NODE_ENV === "production"');
    expect(read(sitePage("collection/e2e/drape-room"))).toContain("notFound()");
  });

  it.each(staticPublic)("exports a complete public card for /%s", async (route) => {
    const pageModule = await pageModules[route]!();
    expectComplete(pageModule.metadata!, `/${route}`);
  });

  it("covers the nested story layout and centralized why and Journal metadata", async () => {
    const { metadata } = await import("@/app/(site)/our-story/layout");
    expectComplete(metadata, "/our-story");
    expectComplete(WHY_PAGE_METADATA, "/why");
    expectComplete(journalIndexMetadata(), "/journal");
  });

  it("gives every keyword landing truthful route metadata without relaxing thin-page robots", () => {
    for (const config of keywordLandingPages) {
      const metadata = keywordLandingMetadata(config, config.minProductCount);
      expectComplete(metadata, config.canonicalPath);
      const thin = keywordLandingMetadata(config, 0);
      expect(thin.robots?.index).toBe(config.indexableWithoutProducts === true);
    }
  });

  it("gives every policy its own metadata and preserves unknown-route guards", async () => {
    const { policies } = await import("@/lib/legal/policies");
    const { generateMetadata } = await import("@/app/(site)/policies/[slug]/page");
    for (const policy of policies) {
      expectComplete(await generateMetadata({ params: Promise.resolve({ slug: policy.slug }) }), `/policies/${policy.slug}`);
    }
    for (const route of ["collection/[slug]", "collection/fabric/[fabric]", "collection/occasion/[occasion]", "guides/[slug]", "policies/[slug]", "journal/[slug]", "[...slug]"]) {
      expect(read(sitePage(route))).toContain("notFound()");
    }
  });

  it("uses real 1200x630 JPEGs for all Journal articles and the global fallback", async () => {
    const fallback = await sharp(path.join(process.cwd(), "public", DEFAULT_SOCIAL_IMAGE.url)).metadata();
    expect(fallback).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
    for (const article of getPublishedJournalArticles()) {
      const metadata = journalArticleMetadata(article);
      expectComplete(metadata, article.path, "article");
      const [image] = (metadata.openGraph as { images: Array<{ url: string }> }).images;
      expect(image!.url).toBe(`${ORIGIN}${article.socialImage}`);
      const actual = await sharp(path.join(process.cwd(), "public", new URL(image!.url).pathname)).metadata();
      expect(actual).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
    }
  });

  it.each(["http://localhost:3000", "https://preview.vercel.app"])("never uses %s in production metadata", (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", origin);
    expectComplete(publicPageMetadata({ title: "Collection", description: "The collection", path: "/collection" }), "/collection");
    vi.unstubAllEnvs();
  });

  it("retains AI crawler exclusion, social fetcher access, and preview-host noindex", () => {
    const rules = robots().rules as Array<{ userAgent: string | string[]; disallow?: string | string[] }>;
    const blockedAgents = rules.filter((rule) => rule.disallow === "/").flatMap((rule) => rule.userAgent);
    expect(blockedAgents).toContain("Meta-ExternalAgent");
    for (const agent of ["facebookexternalhit", "Facebot", "Twitterbot", "LinkedInBot", "WhatsApp", "Meta-ExternalFetcher"]) {
      expect(blockedAgents).not.toContain(agent);
    }
    expect(read("proxy.ts")).toContain('response.headers.set("X-Robots-Tag", "noindex, nofollow")');
    expect(read("next.config.ts")).not.toContain("htmlLimitedBots");
  });
});
