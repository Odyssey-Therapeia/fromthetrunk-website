/**
 * SEO remediation pass 1 — blocker 1.
 *
 * /collection now server-renders every public non-blouse product, so an
 * unfiltered /collection?page=N is a strict subset of the page it points at and
 * must not remain a separate 200.
 *
 * A previous attempt placed the redirect after the catalogue queries. That does
 * not work: this route streams, so the response headers are already flushed as
 * 200 by the time totalDocs is known and Next can only degrade the redirect to a
 * client-side hint — a crawler receives a 200 shell with no product grid. The
 * redirect therefore has to be decided from the query string alone, before any
 * data access.
 *
 * PRIMARY ENFORCEMENT LIVES IN proxy.ts — see
 * tests/unit/proxy-collection-pagination.test.ts. Verified against a production
 * build: the page component below really does call permanentRedirect, and the
 * response is still HTTP 200 because metadata streaming has already flushed the
 * headers. The page-level redirect is kept as defence in depth (mirroring how
 * ?tags=top-viewed and ?type=blouse are handled in BOTH places), but it is the
 * proxy that produces the 308.
 *
 * These tests pin the page half: the redirect decision is reached from the query
 * string alone, and nothing was fetched first.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCanonicalCollectionLocation } from "@/lib/seo/collection-filter";

// --- navigation: turn control-flow throws into inspectable sentinels ---------
const nav = vi.hoisted(() => ({
  permanentRedirect: vi.fn((url: string) => {
    const error = new Error(`PERMANENT_REDIRECT:${url}`);
    (error as unknown as Record<string, unknown>).__kind = "permanent";
    (error as unknown as Record<string, unknown>).__url = url;
    throw error;
  }),
  redirect: vi.fn((url: string) => {
    const error = new Error(`REDIRECT:${url}`);
    (error as unknown as Record<string, unknown>).__kind = "temporary";
    (error as unknown as Record<string, unknown>).__url = url;
    throw error;
  }),
  notFound: vi.fn(() => {
    const error = new Error("NOT_FOUND");
    (error as unknown as Record<string, unknown>).__kind = "notFound";
    throw error;
  }),
}));

vi.mock("next/navigation", () => nav);

// --- every catalogue / product / CMS entry point the page can reach ----------
const catalog = vi.hoisted(() => ({
  getCachedCatalogFacets: vi.fn(async () => ({})),
  getCachedCollectionPage: vi.fn(async () => null),
  getCachedSearchProducts: vi.fn(async () => ({ products: [], totalDocs: 0 })),
  getCachedVisibleCollections: vi.fn(async () => ({ collections: [] })),
}));

vi.mock("@/lib/data/catalog-cache", () => catalog);

const collections = vi.hoisted(() => ({
  getCollectionBySlug: vi.fn(async () => null),
}));

vi.mock("@/db/queries/collections", () => collections);

const DATA_FUNCTIONS = [
  ["getCachedCatalogFacets", catalog.getCachedCatalogFacets],
  ["getCachedCollectionPage", catalog.getCachedCollectionPage],
  ["getCachedSearchProducts", catalog.getCachedSearchProducts],
  ["getCachedVisibleCollections", catalog.getCachedVisibleCollections],
  ["getCollectionBySlug", collections.getCollectionBySlug],
] as const;

const CollectionPage = (await import("@/app/(site)/collection/page")).default;

type Outcome = {
  kind: string | undefined;
  url: string | undefined;
  threw: boolean;
};

async function render(
  searchParams: Record<string, string | string[]>,
): Promise<Outcome> {
  try {
    await CollectionPage({ searchParams: Promise.resolve(searchParams) });
    return { kind: undefined, url: undefined, threw: false };
  } catch (error) {
    const tagged = error as unknown as Record<string, unknown>;
    return {
      kind: tagged.__kind as string | undefined,
      url: tagged.__url as string | undefined,
      threw: true,
    };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("page-only unfiltered URLs redirect permanently", () => {
  it("redirects /collection?page=2 with a permanent redirect to /collection", async () => {
    const outcome = await render({ page: "2" });
    expect(outcome.kind).toBe("permanent");
    expect(outcome.url).toBe("/collection");
    expect(nav.permanentRedirect).toHaveBeenCalledWith("/collection");
  });

  it("redirects /collection?page=5 with a permanent redirect to /collection", async () => {
    const outcome = await render({ page: "5" });
    expect(outcome.kind).toBe("permanent");
    expect(outcome.url).toBe("/collection");
  });

  it("uses a PERMANENT redirect, never the temporary one", async () => {
    await render({ page: "3" });
    expect(nav.permanentRedirect).toHaveBeenCalledTimes(1);
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});

describe("no data is fetched before the redirect", () => {
  it.each(["2", "3", "5", "10"])(
    "fetches nothing for ?page=%s",
    async (page) => {
      const outcome = await render({ page });
      expect(outcome.kind).toBe("permanent");

      for (const [name, fn] of DATA_FUNCTIONS) {
        expect(
          fn,
          `${name} must not run before the redirect decision`,
        ).not.toHaveBeenCalled();
      }
    },
  );

  it("still fetches data for a normal unfiltered request", async () => {
    // Control: proves the mocks are wired to functions the page really calls,
    // so the assertions above are load-bearing rather than vacuously true.
    await render({});
    expect(catalog.getCachedCollectionPage).toHaveBeenCalled();
    expect(catalog.getCachedSearchProducts).toHaveBeenCalled();
  });
});

describe("filtered and non-pagination states are not redirected to /collection", () => {
  it("leaves a filtered URL alone", async () => {
    const outcome = await render({ fabric: "silk" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
    expect(outcome.url).not.toBe("/collection");
  });

  it("leaves filtered pagination alone", async () => {
    await render({ fabric: "silk", page: "2" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
  });

  it("leaves sorted pagination alone", async () => {
    await render({ sort: "price-low-to-high", page: "2" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
  });

  it("leaves explicit perPage pagination alone", async () => {
    await render({ perPage: "25", page: "2" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
  });

  it("does not redirect the bare /collection route", async () => {
    await render({});
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("keeps the existing top-viewed and blouse permanent redirects", async () => {
    expect((await render({ tags: "top-viewed" })).url).toBe("/top-viewed");
    vi.clearAllMocks();
    expect((await render({ type: "blouse" })).url).toBe("/blouses");
  });
});

describe("proxy.ts carries the enforcing redirect", () => {
  it("promotes page-only collection URLs at the edge", () => {
    const source = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "proxy.ts"),
      "utf8",
    ) as string;
    expect(source).toContain("const isPaginationOnly =");
    expect(source).toContain('canonical.size === 1 && canonical.has("page")');
    // Promotion happens inside the existing /collection preflight block, which
    // runs before the app renders anything.
    expect(source.indexOf("isPaginationOnly")).toBeGreaterThan(
      source.indexOf('if (pathname === "/collection")'),
    );
  });
});

describe("tracking parameters remain stripped", () => {
  it("strips tracking and still redirects page-only URLs to /collection", async () => {
    const outcome = await render({
      page: "2",
      utm_source: "instagram",
      gclid: "abc123",
      fbclid: "xyz",
    });
    expect(outcome.kind).toBe("permanent");
    expect(outcome.url).toBe("/collection");
    expect(outcome.url).not.toContain("utm_");
    expect(outcome.url).not.toContain("gclid");
  });

  it("treats a tracking-only URL as the plain unfiltered collection", async () => {
    await render({ utm_source: "instagram", utm_medium: "paid" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("renders a tracked filtered URL without a redirect loop, and keeps tracking out of its canonical", async () => {
    // Tracking is stripped from the ROUTING copy, so a tracked-but-otherwise
    // canonical URL is served as-is rather than bounced (see
    // collectionRoutingSearchParams). What must never happen is tracking
    // reaching the canonical tag.
    await render({ fabric: "silk", utm_source: "ig" });
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();

    const location = getCanonicalCollectionLocation({
      fabric: "silk",
      utm_source: "ig",
    });
    expect(location.href).toBe("/collection?fabric=silk");
    expect(location.href).not.toContain("utm_");
    expect(location.isCanonical).toBe(true);
  });

  it("keeps _rsc out of the redirect target", async () => {
    const outcome = await render({ page: "2", _rsc: "1a2b3" });
    expect(outcome.url).toBe("/collection");
    expect(outcome.url).not.toContain("_rsc");
  });
});
