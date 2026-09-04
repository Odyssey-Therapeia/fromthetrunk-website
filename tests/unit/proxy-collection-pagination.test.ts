/**
 * SEO remediation pass 1 — blocker 1, primary enforcement.
 *
 * /collection server-renders every public non-blouse product, so an unfiltered
 * /collection?page=N is a strict subset of the URL it points at and must not
 * remain a separate 200.
 *
 * The redirect lives in proxy.ts, NOT in the page. A redirect thrown from the
 * route handler cannot set a status here: by the time the handler runs, the 200
 * response has begun streaming and Next can only degrade it to a client-side
 * hint, leaving a crawler with a 200 shell and no product grid. That was
 * verified against a production build before this test was written — the page
 * component demonstrably called permanentRedirect and the response was still
 * HTTP 200. proxy.ts already existed for exactly this reason and already
 * promotes ?tags=top-viewed and ?type=blouse the same way.
 *
 * Running in the proxy also means the decision is made from the query string
 * alone, before any catalogue, CMS or product query is issued.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const productSlugExistsMock = vi.hoisted(() => vi.fn());
const dbSelectPageBySlugMock = vi.hoisted(() => vi.fn());
const resolveRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@/db/queries/products", () => ({
  productSlugExists: productSlugExistsMock,
}));
vi.mock("@/db/queries/content", () => ({
  dbSelectPageBySlug: dbSelectPageBySlugMock,
}));
vi.mock("@/lib/content/redirect-resolver", () => ({
  resolveRedirect: resolveRedirectMock,
}));

// Every catalogue/product entry point the app can reach. None of them may be
// touched while deciding a pagination redirect.
const catalogMock = vi.hoisted(() => ({
  getCachedCatalogFacets: vi.fn(),
  getCachedCollectionPage: vi.fn(),
  getCachedSearchProducts: vi.fn(),
  getCachedVisibleCollections: vi.fn(),
}));
vi.mock("@/lib/data/catalog-cache", () => catalogMock);

import { proxy } from "@/proxy";

const call = async (url: string) => {
  const response = await proxy(
    new NextRequest(new URL(url, "http://localhost:3000")),
  );
  const location = response.headers.get("location");
  return {
    status: response.status,
    location: location ? new URL(location).pathname + new URL(location).search : null,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  getTokenMock.mockResolvedValue(null);
  productSlugExistsMock.mockResolvedValue(true);
  dbSelectPageBySlugMock.mockResolvedValue(null);
  resolveRedirectMock.mockResolvedValue(null);
});

describe("page-only unfiltered URLs are permanently redirected to /collection", () => {
  it.each(["2", "3", "5", "7", "10"])(
    "promotes /collection?page=%s with a 308",
    async (page) => {
      const { status, location } = await call(`/collection?page=${page}`);
      expect(status).toBe(308);
      expect(location).toBe("/collection");
    },
  );

  it("uses a PERMANENT (308) redirect, not a temporary one", async () => {
    const { status } = await call("/collection?page=2");
    expect(status).toBe(308);
    expect(status).not.toBe(307);
    expect(status).not.toBe(302);
  });
});

describe("no catalogue or product data is touched before the redirect", () => {
  it.each(["2", "5", "9"])("fetches nothing for ?page=%s", async (page) => {
    const { status } = await call(`/collection?page=${page}`);
    expect(status).toBe(308);

    for (const [name, fn] of Object.entries(catalogMock)) {
      expect(fn, `${name} must not run`).not.toHaveBeenCalled();
    }
    expect(productSlugExistsMock).not.toHaveBeenCalled();
    expect(dbSelectPageBySlugMock).not.toHaveBeenCalled();
    // The managed-redirect table is also never consulted for /collection.
    expect(resolveRedirectMock).not.toHaveBeenCalled();
  });
});

describe("filtered states are not collapsed", () => {
  it("keeps filtered pagination on its own URL", async () => {
    const { status, location } = await call("/collection?fabric=silk&page=2");
    // Canonical ordering still applies, but the page param survives.
    if (status === 308) {
      expect(location).toContain("page=2");
      expect(location).toContain("fabric=silk");
      expect(location).not.toBe("/collection");
    } else {
      expect(status).toBe(200);
    }
  });

  it("keeps explicit perPage pagination on its own URL", async () => {
    const { status, location } = await call("/collection?perPage=25&page=2");
    if (status === 308) {
      expect(location).toContain("page=2");
      expect(location).toContain("perPage=25");
      expect(location).not.toBe("/collection");
    } else {
      expect(status).toBe(200);
    }
  });

  it("does not redirect sorted pagination to /collection", async () => {
    const { status, location } = await call(
      "/collection?page=2&sort=price-low-to-high",
    );
    expect(location).not.toBe("/collection");
    if (status === 308) expect(location).toContain("page=2");
  });

  it("does not redirect a plain filtered URL", async () => {
    const { status, location } = await call("/collection?fabric=silk");
    expect(location).not.toBe("/collection");
    if (status === 308) expect(location).toContain("fabric=silk");
  });

  it("leaves the bare /collection route alone", async () => {
    const { status, location } = await call("/collection");
    expect(status).not.toBe(308);
    expect(location).toBeNull();
  });
});

describe("existing collection preflight behaviour is preserved", () => {
  it("still promotes ?tags=top-viewed", async () => {
    expect(await call("/collection?tags=top-viewed")).toEqual({
      status: 308,
      location: "/top-viewed",
    });
  });

  it("still promotes ?type=blouse", async () => {
    expect(await call("/collection?type=blouse")).toEqual({
      status: 308,
      location: "/blouses",
    });
  });

  it("still rejects invalid parameters", async () => {
    const { status, location } = await call("/collection?bogus=1");
    expect(status).not.toBe(308);
    expect(location).not.toBe("/collection");
  });

  it("still normalises a non-canonical filter value", async () => {
    const { status, location } = await call("/collection?fabric=SILK");
    expect(status).toBe(308);
    expect(location).toBe("/collection?fabric=silk");
  });
});

describe("tracking parameters never survive", () => {
  it("strips tracking while promoting a page-only URL", async () => {
    const { status, location } = await call(
      "/collection?page=2&utm_source=instagram&gclid=abc&fbclid=xyz",
    );
    expect(status).toBe(308);
    expect(location).toBe("/collection");
    expect(location).not.toContain("utm_");
    expect(location).not.toContain("gclid");
    expect(location).not.toContain("fbclid");
  });

  it("strips tracking from a tracking-only URL", async () => {
    const { status, location } = await call(
      "/collection?utm_source=instagram&utm_medium=paid",
    );
    expect(status).toBe(308);
    expect(location).toBe("/collection");
  });

  it("strips tracking from a filtered URL without collapsing the filter", async () => {
    const { status, location } = await call(
      "/collection?fabric=silk&utm_source=ig",
    );
    expect(status).toBe(308);
    expect(location).toBe("/collection?fabric=silk");
    expect(location).not.toContain("utm_");
  });

  it("does not leak _rsc into a redirect target", async () => {
    const { location } = await call("/collection?page=2&_rsc=1a2b3");
    expect(location).toBe("/collection");
    expect(location).not.toContain("_rsc");
  });
});
