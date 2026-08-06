/**
 * P3-09: proxy.ts redirect consultation + money-path regression tests.
 *
 * These tests verify:
 *  1. The proxy consults the redirect resolver and issues the right HTTP status.
 *  2. Product-detail 404 preflight and auth-protection behavior are preserved.
 *  3. The redirect is additive — it does not alter the money path.
 *
 * We mock @/db/queries/products for PDP existence checks, @/db/queries/content
 * for CMS existence checks, and
 * @/lib/content/redirect-resolver (for resolveRedirect) at the lowest level —
 * NOT @/proxy itself.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const productSlugExistsMock = vi.hoisted(() => vi.fn());
const dbSelectPageBySlugMock = vi.hoisted(() => vi.fn());
const resolveRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/db/queries/products", () => ({
  productSlugExists: productSlugExistsMock,
}));

vi.mock("@/db/queries/content", () => ({
  dbSelectPageBySlug: dbSelectPageBySlugMock,
}));

vi.mock("@/lib/content/redirect-resolver", () => ({
  resolveRedirect: resolveRedirectMock,
}));

import { proxy } from "@/proxy";

describe("proxy.ts — redirect consultation (P3-09 additive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    dbSelectPageBySlugMock.mockResolvedValue({
      status: "published",
      publishedVersionId: "version-1",
    });
    resolveRedirectMock.mockResolvedValue(null); // default: no redirect
    getTokenMock.mockResolvedValue(null);
  });

  it("issues a 301 redirect when resolver returns a redirect", async () => {
    resolveRedirectMock.mockResolvedValue({ toPath: "/new-destination", status: 301 });

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/old-path")
    );

    expect(response.status).toBe(301);
    const location = response.headers.get("location");
    expect(location).toContain("/new-destination");
  });

  it("passes through when resolver returns null (no redirect)", async () => {
    resolveRedirectMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/no-redirect-page")
    );

    // Should be 200 (NextResponse.next())
    expect(response.status).toBe(200);
  });

  it("checks product existence but still skips redirect consultation for /collection/:slug paths", async () => {
    productSlugExistsMock.mockResolvedValue(true);
    resolveRedirectMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/my-saree")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).toHaveBeenCalledWith("my-saree", {
      includeDrafts: false,
    });
    expect(resolveRedirectMock).not.toHaveBeenCalled();
  });

  it("skips duplicate product existence work for RSC navigation", async () => {
    const response = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection/my-saree?_rsc=abc123",
        { headers: { RSC: "1" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
    expect(resolveRedirectMock).not.toHaveBeenCalled();
  });

  it("does not query managed redirects for a reserved application route", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/our-story"),
    );

    expect(response.status).toBe(200);
    expect(resolveRedirectMock).not.toHaveBeenCalled();
    expect(dbSelectPageBySlugMock).not.toHaveBeenCalled();
  });
});

describe("proxy.ts — collection query preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    resolveRedirectMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue(null);
  });

  it("returns a real 404 before streaming malformed filter state", async () => {
    const response = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?priceMin=not-a-number",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("permanently redirects legacy promoted states to clean routes", async () => {
    const topViewed = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?tags=top-viewed",
      ),
    );
    const blouses = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?type=blouse",
      ),
    );

    expect(topViewed.status).toBe(308);
    expect(topViewed.headers.get("location")).toBe(
      "https://www.fromthetrunk.shop/top-viewed",
    );
    expect(blouses.status).toBe(308);
    expect(blouses.headers.get("location")).toBe(
      "https://www.fromthetrunk.shop/blouses",
    );
  });

  it("permanently normalizes aliases, ordering, and duplicate values", async () => {
    const response = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?fabric=silk&colour=Blue&fabric=silk",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.fromthetrunk.shop/collection?fabric=silk&color=blue",
    );
  });

  it("passes an already canonical filter URL through", async () => {
    const response = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?fabric=cotton",
      ),
    );

    expect(response.status).toBe(200);
  });

  it.each([
    "utm_source=newsletter",
    "utm_medium=email",
    "utm_campaign=summer",
    "utm_content=hero",
    "utm_term=sarees",
    "gclid=google-click",
    "fbclid=facebook-click",
    "msclkid=microsoft-click",
    "ttclid=tiktok-click",
  ])("strips tracking state without returning a 404: %s", async (query) => {
    const response = await proxy(
      new NextRequest(
        `https://www.fromthetrunk.shop/collection?fabric=silk&${query}`,
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.fromthetrunk.shop/collection?fabric=silk",
    );
  });

  it("passes canonical Next.js RSC navigation through", async () => {
    const response = await proxy(
      new NextRequest(
        "https://www.fromthetrunk.shop/collection?fabric=silk&_rsc=abc123",
      ),
    );

    expect(response.status).toBe(200);
  });
});

describe("proxy.ts — auth behavior unchanged (money path regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    dbSelectPageBySlugMock.mockResolvedValue({
      status: "published",
      publishedVersionId: "version-1",
    });
    resolveRedirectMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue(null);
  });

  it("rewrites missing product slugs to a real 404 before the PDP streams", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/missing-saree")
    );

    expect(response.status).toBe(404);
    expect(productSlugExistsMock).toHaveBeenCalledWith("missing-saree", {
      includeDrafts: false,
    });
  });

  it("still redirects unauthenticated users from /account/* (existing behavior preserved)", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/account/profile")
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/account/sign-in");
  });

  it("still allows authenticated users through /account/* (existing behavior preserved)", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1", id: "user-1" });

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/account/profile")
    );

    expect(response.status).toBe(200);
  });
});

describe("proxy.ts — MONEY PATH: /checkout and /cart never redirected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    dbSelectPageBySlugMock.mockResolvedValue({
      status: "published",
      publishedVersionId: "version-1",
    });
    // Even if the resolver would return a redirect, the proxy should NOT apply it
    // for /checkout or /cart paths.
    resolveRedirectMock.mockResolvedValue({ toPath: "/somewhere", status: 301 });
    getTokenMock.mockResolvedValue(null);
  });

  it("does NOT call resolveRedirect for /checkout paths (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/checkout")
    );

    // resolveRedirect must NOT be called for /checkout
    expect(resolveRedirectMock).not.toHaveBeenCalled();
    // Proxy passes through (200 = NextResponse.next())
    expect(response.status).toBe(200);
  });

  it("does NOT call resolveRedirect for /checkout/confirmation (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/checkout/confirmation")
    );

    expect(resolveRedirectMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("does NOT call resolveRedirect for /cart paths (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/cart")
    );

    expect(resolveRedirectMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});

describe("proxy.ts — SEO host noindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    dbSelectPageBySlugMock.mockResolvedValue({
      status: "published",
      publishedVersionId: "version-1",
    });
    resolveRedirectMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue(null);
  });

  it("adds X-Robots-Tag noindex,nofollow on Vercel preview hosts", async () => {
    const response = await proxy(
      new NextRequest("https://fromthetrunk-website.vercel.app/our-story"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("does not add preview noindex on canonical public hosts", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/our-story"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});
