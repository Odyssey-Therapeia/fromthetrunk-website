/**
 * SEO remediation pass 1 — finding A.
 *
 * /collection?page=2 used to emit <link rel="canonical" href=".../collection">,
 * telling Google that every paginated page was a duplicate of page 1. The cause
 * was canonicalPath() stripping the query string for every caller.
 *
 * The fix is deliberately narrow: canonicalPath()/absoluteUrl() keep stripping
 * queries (see site-origin.test.ts, which still locks that in), and a separate
 * opt-in pathway preserves ONLY an allowlisted canonical query. These tests
 * pin both halves so the allowlist cannot quietly widen into canonical
 * proliferation across filter combinations.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  absoluteCanonicalUrl,
  absoluteUrl,
  canonicalPath,
  canonicalPathWithQuery,
} from "@/lib/seo/site-url";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { getCanonicalCollectionLocation } from "@/lib/seo/collection-filter";

const ORIGIN = "https://www.fromthetrunk.shop";

const canonicalOf = (metadata: ReturnType<typeof publicPageMetadata>) =>
  metadata.alternates?.canonical;

describe("canonicalPathWithQuery", () => {
  it("preserves a page-only canonical query", () => {
    expect(canonicalPathWithQuery("/collection?page=2")).toBe(
      "/collection?page=2",
    );
    expect(canonicalPathWithQuery("/collection?page=5")).toBe(
      "/collection?page=5",
    );
  });

  it("drops page=1 because the bare path already addresses it", () => {
    expect(canonicalPathWithQuery("/collection?page=1")).toBe("/collection");
  });

  it("drops tracking parameters", () => {
    for (const tracking of [
      "utm_source=instagram",
      "utm_medium=paid",
      "utm_campaign=diwali",
      "gclid=abc123",
      "fbclid=xyz789",
      "msclkid=deadbeef",
    ]) {
      expect(canonicalPathWithQuery(`/collection?${tracking}`)).toBe(
        "/collection",
      );
    }
  });

  it("drops tracking parameters even when a valid page is present", () => {
    expect(
      canonicalPathWithQuery(
        "/collection?page=3&utm_source=instagram&gclid=abc123&fbclid=z",
      ),
    ).toBe("/collection?page=3");
  });

  it("drops Next.js internal navigation parameters", () => {
    expect(canonicalPathWithQuery("/collection?page=2&_rsc=1a2b3")).toBe(
      "/collection?page=2",
    );
  });

  it("drops unknown and filter parameters", () => {
    expect(canonicalPathWithQuery("/collection?fabric=silk")).toBe(
      "/collection",
    );
    expect(
      canonicalPathWithQuery("/collection?page=2&fabric=silk&sort=price-low-to-high"),
    ).toBe("/collection?page=2");
    expect(canonicalPathWithQuery("/collection?somethingNew=1")).toBe(
      "/collection",
    );
  });

  it("rejects non-integer and non-positive page values", () => {
    for (const bad of ["page=abc", "page=2.5", "page=-1", "page=0", "page="]) {
      expect(canonicalPathWithQuery(`/collection?${bad}`)).toBe("/collection");
    }
  });

  it("keeps only the first value of a repeated page key", () => {
    expect(canonicalPathWithQuery("/collection?page=2&page=7")).toBe(
      "/collection?page=2",
    );
  });

  it("strips fragments", () => {
    expect(canonicalPathWithQuery("/collection?page=2#grid")).toBe(
      "/collection?page=2",
    );
    expect(canonicalPathWithQuery("/collection#grid")).toBe("/collection");
    expect(canonicalPathWithQuery("/collection#top?page=9")).toBe("/collection");
  });

  it("leaves ordinary query-less paths unchanged", () => {
    expect(canonicalPathWithQuery("/collection")).toBe("/collection");
    expect(canonicalPathWithQuery("/authentication")).toBe("/authentication");
    expect(canonicalPathWithQuery("/")).toBe("/");
  });
});

describe("absoluteUrl is unchanged by the pagination fix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still strips every query string", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    expect(absoluteUrl("/collection?page=2")).toBe(`${ORIGIN}/collection`);
    expect(absoluteUrl("/collection?fabric=silk")).toBe(`${ORIGIN}/collection`);
    expect(canonicalPath("/collection?page=2")).toBe("/collection");
  });
});

describe("absoluteCanonicalUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds an absolute URL that keeps the allowlisted page query", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    expect(absoluteCanonicalUrl("/collection?page=2")).toBe(
      `${ORIGIN}/collection?page=2`,
    );
  });

  it("drops disallowed parameters while resolving to an absolute URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    expect(absoluteCanonicalUrl("/collection?utm_source=ig&fabric=silk")).toBe(
      `${ORIGIN}/collection`,
    );
  });
});

describe("publicPageMetadata canonical pathway", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips queries by default so existing callers cannot regress", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    const metadata = publicPageMetadata({
      title: "t",
      description: "d",
      path: "/collection?page=2",
    });
    expect(canonicalOf(metadata)).toBe(`${ORIGIN}/collection`);
  });

  it("preserves the page query only when explicitly opted in", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    const metadata = publicPageMetadata({
      title: "t",
      description: "d",
      path: "/collection?page=2",
      preserveCanonicalQuery: true,
    });
    expect(canonicalOf(metadata)).toBe(`${ORIGIN}/collection?page=2`);
    expect(metadata.openGraph?.url).toBe(`${ORIGIN}/collection?page=2`);
  });

  it("still refuses tracking parameters when opted in", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);
    const metadata = publicPageMetadata({
      title: "t",
      description: "d",
      path: "/collection?page=2&utm_source=instagram",
      preserveCanonicalQuery: true,
    });
    expect(canonicalOf(metadata)).toBe(`${ORIGIN}/collection?page=2`);
  });
});

describe("collection canonicalisation feeds the metadata pathway", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produces a self-referencing canonical for a paginated collection page", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);

    // Exactly what app/(site)/collection/page.tsx does.
    const location = getCanonicalCollectionLocation({ page: "2" });
    expect(location.href).toBe("/collection?page=2");

    const metadata = publicPageMetadata({
      title: "t",
      description: "d",
      path: location.href,
      preserveCanonicalQuery: true,
    });

    expect(canonicalOf(metadata)).toBe(`${ORIGIN}/collection?page=2`);
    expect(canonicalOf(metadata)).not.toBe(`${ORIGIN}/collection`);
  });

  it("does not let a filtered location leak a query into the canonical", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", ORIGIN);

    const location = getCanonicalCollectionLocation({ fabric: "silk" });
    expect(location.href).toBe("/collection?fabric=silk");

    // Even if a future caller wrongly opted in, the second gate holds.
    const metadata = publicPageMetadata({
      title: "t",
      description: "d",
      path: location.href,
      preserveCanonicalQuery: true,
    });
    expect(canonicalOf(metadata)).toBe(`${ORIGIN}/collection`);
  });
});
