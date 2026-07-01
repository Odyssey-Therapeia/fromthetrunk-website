import { afterEach, describe, expect, it, vi } from "vitest";

import { getSiteOrigin } from "@/lib/config/site";
import {
  absoluteUrl,
  canonicalPath,
  getCanonicalOrigin,
} from "@/lib/seo/site-url";

describe("getSiteOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns NEXT_PUBLIC_SERVER_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://example.com");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://example.com");
  });

  it("returns the canonical domain when NEXT_PUBLIC_SERVER_URL is unset in development", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("falls back to the canonical domain when production origin is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getSiteOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("strips trailing slash from NEXT_PUBLIC_SERVER_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://example.com/");
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteOrigin()).toBe("https://example.com");
  });

  it("uses SITE_URL before NEXT_PUBLIC_SERVER_URL for canonical origin", () => {
    vi.stubEnv("SITE_URL", "https://www.fromthetrunk.shop/");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://wrong.example.com");
    expect(getCanonicalOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("rejects localhost production origins for canonical output", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getCanonicalOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("rejects Vercel preview origins for production canonical output", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://ftt-preview.vercel.app");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getCanonicalOrigin()).toBe("https://www.fromthetrunk.shop");
  });

  it("strips query strings from canonical paths", () => {
    expect(canonicalPath("/collection?fabric=silk#top")).toBe("/collection");
  });

  it("builds absolute canonical URLs from relative paths", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    expect(absoluteUrl("/collection?fabric=silk")).toBe(
      "https://www.fromthetrunk.shop/collection"
    );
  });
});
