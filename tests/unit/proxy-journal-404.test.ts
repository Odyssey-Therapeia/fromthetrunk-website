import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const resolveRedirectMock = vi.hoisted(() => vi.fn());
const dbSelectPageBySlugMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/lib/content/redirect-resolver", () => ({
  resolveRedirect: resolveRedirectMock,
}));

vi.mock("@/db/queries/content", () => ({
  dbSelectPageBySlug: dbSelectPageBySlugMock,
}));

import { proxy } from "@/proxy";

const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://www.fromthetrunk.shop${path}`, init);

describe("proxy journal 404 preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRedirectMock.mockResolvedValue(null);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FTT_JOURNAL_PUBLISHED_SLUGS", "caring-for-silk,preloved-sarees-meaning");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets the index and published articles through", async () => {
    for (const path of ["/journal", "/journal?q=zari", "/journal/preloved-sarees-meaning"]) {
      expect((await proxy(request(path))).status).toBe(200);
    }
  });

  it("rewrites unknown, draft and nested journal paths to the 404 route", async () => {
    for (const path of [
      "/journal/does-not-exist",
      "/journal/draft-story",
      "/journal/Preloved-Sarees-Meaning",
      "/journal/preloved-sarees-meaning/extra",
    ]) {
      const response = await proxy(request(path));
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toBe("https://www.fromthetrunk.shop/404");
    }
    // Reserved, so the CMS lookup is never consulted.
    expect(dbSelectPageBySlugMock).not.toHaveBeenCalled();
  });

  it("404s every article when none are published", async () => {
    vi.stubEnv("FTT_JOURNAL_PUBLISHED_SLUGS", "");
    expect((await proxy(request("/journal/preloved-sarees-meaning"))).status).toBe(404);
    expect((await proxy(request("/journal"))).status).toBe(200);
  });

  it("leaves client-side navigations and development to the page's notFound()", async () => {
    expect((await proxy(request("/journal/does-not-exist", { headers: { rsc: "1" } }))).status).toBe(200);

    vi.stubEnv("NODE_ENV", "development");
    expect((await proxy(request("/journal/does-not-exist"))).status).toBe(200);
  });
});
