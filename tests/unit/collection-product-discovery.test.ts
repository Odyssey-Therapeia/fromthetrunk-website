/**
 * SEO remediation pass 1 — finding A, product discovery half.
 *
 * The unfiltered /collection page rendered only DEFAULT_ITEMS_PER_PAGE (10)
 * product links, so with a ~49-product catalogue most sarees had NO internal
 * link path from the canonical listing. Combined with paginated pages
 * canonicalising to /collection, the deeper products depended entirely on the
 * sitemap for discovery.
 *
 * The unfiltered canonical view now renders the whole catalogue up to
 * UNFILTERED_COLLECTION_LIMIT, while filtered and explicit-perPage navigation
 * keeps the original cumulative paging behaviour.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  UNFILTERED_COLLECTION_LIMIT,
  resolveCollectionVisibleLimit,
} from "@/lib/collection/visible-limit";
import { getCanonicalCollectionLocation } from "@/lib/seo/collection-filter";

const MAX_VISIBLE_PRODUCTS = 100;
const DEFAULT_ITEMS_PER_PAGE = 10;

/**
 * Visible non-blouse products in the live catalogue at the time of this pass,
 * measured from the running production build ("50 of 50 pieces" on /collection).
 * The limit must stay at or above this with headroom for new stock.
 */
const CURRENT_CATALOGUE_SIZE = 50;

describe("UNFILTERED_COLLECTION_LIMIT", () => {
  it("is at least 50, per the pass-1 safe-limit requirement", () => {
    expect(UNFILTERED_COLLECTION_LIMIT).toBeGreaterThanOrEqual(50);
  });

  it("never exceeds the existing MAX_VISIBLE_PRODUCTS boundary", () => {
    expect(UNFILTERED_COLLECTION_LIMIT).toBeLessThanOrEqual(
      MAX_VISIBLE_PRODUCTS,
    );
  });

  it("covers the whole current catalogue", () => {
    expect(UNFILTERED_COLLECTION_LIMIT).toBeGreaterThanOrEqual(
      CURRENT_CATALOGUE_SIZE,
    );
  });
});

describe("resolveCollectionVisibleLimit", () => {
  const unfiltered = () =>
    resolveCollectionVisibleLimit({
      isUnfilteredCanonicalView: true,
      currentPage: 1,
      itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
      maxVisibleProducts: MAX_VISIBLE_PRODUCTS,
    });

  it("returns every product for the unfiltered canonical view, not just the first ten", () => {
    expect(unfiltered()).toBe(UNFILTERED_COLLECTION_LIMIT);
    // Headroom: the limit must not merely equal today's catalogue size.
    expect(UNFILTERED_COLLECTION_LIMIT).toBeGreaterThan(CURRENT_CATALOGUE_SIZE);
    expect(unfiltered()).toBeGreaterThanOrEqual(CURRENT_CATALOGUE_SIZE);
    expect(unfiltered()).not.toBe(DEFAULT_ITEMS_PER_PAGE);
  });

  it("keeps the original cumulative paging for filtered views", () => {
    expect(
      resolveCollectionVisibleLimit({
        isUnfilteredCanonicalView: false,
        currentPage: 1,
        itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
        maxVisibleProducts: MAX_VISIBLE_PRODUCTS,
      }),
    ).toBe(10);

    expect(
      resolveCollectionVisibleLimit({
        isUnfilteredCanonicalView: false,
        currentPage: 3,
        itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
        maxVisibleProducts: MAX_VISIBLE_PRODUCTS,
      }),
    ).toBe(30);
  });

  it("respects an explicit larger perPage on filtered views", () => {
    expect(
      resolveCollectionVisibleLimit({
        isUnfilteredCanonicalView: false,
        currentPage: 2,
        itemsPerPage: 25,
        maxVisibleProducts: MAX_VISIBLE_PRODUCTS,
      }),
    ).toBe(50);
  });

  it("never exceeds maxVisibleProducts in either mode", () => {
    expect(
      resolveCollectionVisibleLimit({
        isUnfilteredCanonicalView: false,
        currentPage: 10,
        itemsPerPage: 50,
        maxVisibleProducts: MAX_VISIBLE_PRODUCTS,
      }),
    ).toBe(MAX_VISIBLE_PRODUCTS);

    expect(
      resolveCollectionVisibleLimit({
        isUnfilteredCanonicalView: true,
        currentPage: 1,
        itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
        maxVisibleProducts: 20,
      }),
    ).toBe(20);
  });
});

describe("unfiltered detection", () => {
  it("treats exactly /collection as the unfiltered canonical view", () => {
    expect(getCanonicalCollectionLocation(undefined).href).toBe("/collection");
    expect(getCanonicalCollectionLocation({}).href).toBe("/collection");
  });

  it("does not treat filtered, sorted or paginated locations as unfiltered", () => {
    for (const params of [
      { fabric: "silk" },
      { sort: "price-low-to-high" },
      { page: "2" },
      { perPage: "25" },
      { availability: "available" },
    ]) {
      expect(getCanonicalCollectionLocation(params).href).not.toBe(
        "/collection",
      );
    }
  });

  it("still treats tracking-only URLs as the unfiltered canonical view", () => {
    expect(
      getCanonicalCollectionLocation({
        utm_source: "instagram",
        gclid: "abc",
      }).href,
    ).toBe("/collection");
  });
});

describe("collection page wiring", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app/(site)/collection/page.tsx"),
    "utf8",
  );

  it("uses the shared limit resolver rather than an inline page*perPage cap", () => {
    expect(source).toContain("resolveCollectionVisibleLimit({");
    expect(source).toContain("isUnfilteredCanonicalView");
  });

  // Superseded: pagination-only URLs now 308 to /collection. The redirect is
  // decided from the query string BEFORE any data access, so it cannot be
  // flushed away by streaming — see collection-pagination-redirect.test.ts.
  it("permanently redirects pagination-only URLs before any catalogue query", () => {
    const redirectAt = source.indexOf('permanentRedirect("/collection")');
    const firstDataCall = Math.min(
      ...["getCachedCollectionPage(", "getCachedSearchProducts(", "getCachedCatalogFacets(", "getCachedVisibleCollections("]
        .map((needle) => source.indexOf(needle))
        .filter((index) => index > -1),
    );
    expect(redirectAt).toBeGreaterThan(-1);
    expect(source).toContain("isCollectionPaginationOnly(resolvedSearchParams)");
    expect(redirectAt).toBeLessThan(firstDataCall);
  });

  it("does not gate that redirect on totalDocs", () => {
    expect(source).not.toContain("totalDocs <= UNFILTERED_COLLECTION_LIMIT");
  });

  it("still permanently redirects the static top-viewed and blouse aliases", () => {
    expect(source).toContain('permanentRedirect("/top-viewed")');
    expect(source).toContain('permanentRedirect("/blouses")');
  });

  it("keeps the paginated canonical self-referencing when pagination is still needed", () => {
    expect(source).toContain("preserveCanonicalQuery: paginationOnly");
  });

  it("preserves the intentional noindex policy for filtered views", () => {
    expect(source).toContain("robots: hasFilters");
  });
});
