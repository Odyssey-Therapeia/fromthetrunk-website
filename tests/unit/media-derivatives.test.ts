import { describe, expect, it } from "vitest";

import {
  resolveBoundedSeoImage,
  resolvePrimarySeoImage,
} from "@/lib/media/media-derivatives";
import { productSeoImageUrls } from "@/lib/seo/image-urls";

const SAFE_URL =
  "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/seo-v1.webp";

const safeMedia = (overrides: Record<string, unknown> = {}) => ({
  id: "media-safe",
  url: SAFE_URL,
  alt: "A restored silk saree",
  filesize: 300000,
  height: 1800,
  metadata: { source: "vercel-blob" },
  mimeType: "image/webp",
  width: 1400,
  ...overrides,
});

describe("Phase 2A product media contract", () => {
  it("accepts a measured, direct, provenance-backed SEO candidate", () => {
    expect(resolveBoundedSeoImage(safeMedia())).toEqual({
      image: expect.objectContaining({
        filesize: 300000,
        url: SAFE_URL,
        width: 1400,
      }),
      reason: null,
    });
  });

  it("rejects legacy originals and never falls back to originalUrl", () => {
    const resolution = resolveBoundedSeoImage(
      safeMedia({
        metadata: {
          legacySource: "payload",
          originalUrl: "https://example.com/11mb-original.png",
          sizes: { card: { url: SAFE_URL } },
        },
      }),
    );

    expect(resolution).toEqual({ image: null, reason: "legacy_original_only" });
    expect(JSON.stringify(resolution)).not.toContain("11mb-original");
  });

  it.each([
    [{ filesize: null }, "unknown_dimensions"],
    [{ filesize: 500001 }, "over_budget"],
    [{ width: 2400 }, "over_budget"],
    [{ mimeType: "image/png" }, "unsupported_mime"],
    [{ url: "https://unknown.public.blob.vercel-storage.com/media/x.webp" }, "unsafe_host_or_path"],
    [{ url: "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/private/x.webp" }, "unsafe_host_or_path"],
    [{ url: "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/x.webp?token=secret" }, "unsafe_host_or_path"],
  ])("fails closed for %o", (overrides, reason) => {
    expect(resolveBoundedSeoImage(safeMedia(overrides))).toEqual({
      image: null,
      reason,
    });
  });

  it("uses at most the sorted primary image across sitemap and JSON-LD callers", () => {
    const product = {
      images: [
        { media: safeMedia({ url: SAFE_URL.replace("seo-v1", "second") }), sortOrder: 2 },
        { media: safeMedia(), sortOrder: 0 },
      ],
    };

    expect(resolvePrimarySeoImage(product).image?.url).toBe(SAFE_URL);
    expect(productSeoImageUrls(product as never)).toEqual([SAFE_URL]);
  });
});
