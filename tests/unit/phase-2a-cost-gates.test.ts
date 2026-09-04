import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";
import { DEFAULT_SOCIAL_IMAGE } from "@/lib/seo/metadata";

const root = process.cwd();
const bytes = (path: string) => statSync(join(root, path)).size;

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

describe("Phase 2A cost regression gates", () => {
  it("keeps the versioned default social JPEG below the hard budget", async () => {
    const path = `public${DEFAULT_SOCIAL_IMAGE.url}`;
    const metadata = await sharp(join(root, path)).metadata();

    expect(bytes(path)).toBeLessThanOrEqual(300000);
    expect(metadata.format).toBe("jpeg");
    expect([metadata.width, metadata.height]).toEqual([1200, 630]);
  });

  it("keeps the legacy social URL cheap and compatible", async () => {
    const path = "public/banner/collection_banner.png";
    const metadata = await sharp(join(root, path)).metadata();

    expect(bytes(path)).toBeLessThanOrEqual(500000);
    expect(metadata.format).toBe("png");
    expect([metadata.width, metadata.height]).toEqual([1200, 630]);
  });

  it("keeps converted founder and intro assets within route budgets", () => {
    expect(bytes("public/founder/founders-cover-v1.webp")).toBeLessThanOrEqual(200000);
    expect(bytes("public/video/welcoming-v2.webm")).toBeLessThanOrEqual(1000000);
  });

  it("keeps every versioned homepage fabric source below 500 KB", () => {
    const assets = walk(join(root, "public/category/optimized-v1"));
    expect(assets).toHaveLength(9);
    for (const asset of assets) expect(statSync(asset).size).toBeLessThanOrEqual(500000);
  });

  it("bounds optimizer dimensions, qualities, sources, and local dynamic routes", () => {
    expect(nextConfig.images?.qualities).toEqual([70, 75]);
    expect(nextConfig.images?.deviceSizes).toHaveLength(8);
    expect(nextConfig.images?.imageSizes).toHaveLength(8);
    expect(nextConfig.images?.remotePatterns).toHaveLength(3);
    expect(
      nextConfig.images?.remotePatterns?.map((pattern) => pattern.hostname),
    ).not.toContain("**.public.blob.vercel-storage.com");
    expect(JSON.stringify(nextConfig.images?.localPatterns)).not.toContain(
      "/collection/**",
    );
    expect(nextConfig.images?.unoptimized).not.toBe(true);
  });

  it("does not introduce a new oversized photographic PNG", () => {
    const grandfathered = new Set([
      "public/Blouse_size.png",
      "public/banner/collection-banner2.png",
      // public/banner/newbanner{1,2,3,4}.png were replaced by
      // public/banner/banner{1,2,3,4}.avif (34-137 KB each) and no longer
      // exist. The assertion below is an exact set equality, so a stale
      // allowlist entry fails just as loudly as a new oversized PNG — that is
      // the point of the gate, and removing only the four deleted paths keeps
      // it intact.
      "public/founder/abraham-founder.png",
      "public/hero/1.png",
      "public/hero/2.png",
      "public/hero/3.png",
      "public/hero/4.png",
      "public/hero/5.png",
      "public/hero/6.png",
      "public/hero/7.png",
      "public/hero/banner.png",
      "public/hero/banner1.png",
      "public/hero/mobile_1.png",
      "public/hero/mobile_2.png",
      "public/hero/mobile_3.png",
      "public/hero/mobile_4.png",
      "public/hero/you.png",
      "public/logo.png",
      "public/media/home-cover.png",
      "public/packaging/normalpkg-1.png",
      "public/packaging/normalpkg-2.png",
      "public/packaging/normalpkg-3.png",
      "public/packaging/normalpkg-4.png",
      "public/packaging/normalpkg-5.png",
      "public/packaging/premiumpkg_1.png",
      "public/packaging/premiumpkg_2.png",
      "public/packaging/premiumpkg_3.png",
    ]);
    const oversizedPngs = walk(join(root, "public"))
      .filter((path) => path.toLowerCase().endsWith(".png"))
      .filter((path) => statSync(path).size > 500000)
      .map((path) => relative(root, path));

    expect(oversizedPngs.sort()).toEqual([...grandfathered].sort());
  });
});
