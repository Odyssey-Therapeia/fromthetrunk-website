import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { productSeoImageUrls, toSeoImageUrl } from "@/lib/seo/image-urls";

describe("SEO image optimization policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes relative image paths to production-safe HTTPS URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");

    expect(toSeoImageUrl("/media/silk-saree.webp")).toBe(
      "https://www.fromthetrunk.shop/media/silk-saree.webp",
    );
  });

  it("rejects unsafe SEO image origins", () => {
    expect(toSeoImageUrl("http://localhost:3000/media/saree.jpg")).toBeNull();
    expect(toSeoImageUrl("https://127.0.0.1/media/saree.jpg")).toBeNull();
    expect(toSeoImageUrl("https://ftt-preview.vercel.app/media/saree.jpg")).toBeNull();
    expect(toSeoImageUrl("https://images.unsplash.com/photo-1")).toBeNull();
    expect(toSeoImageUrl("https://plus.unsplash.com/premium-photo-1")).toBeNull();
    expect(toSeoImageUrl("data:image/png;base64,abc")).toBeNull();
  });

  it("keeps one bounded provenance-backed primary image and rejects originals", () => {
    const safeUrl =
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/a.webp";
    const product = {
      images: [
        {
          media: {
            url: safeUrl,
            filesize: 300000,
            height: 1800,
            metadata: { source: "vercel-blob" },
            mimeType: "image/webp",
            width: 1400,
          },
          sortOrder: 0,
        },
        { media: { url: "https://cdn.example.com/original.webp" }, sortOrder: 1 },
        { media: { url: "https://images.unsplash.com/photo-1" } },
        { media: { url: "http://localhost:3000/private.jpg" } },
      ],
    };

    expect(productSeoImageUrls(product as never)).toEqual([safeUrl]);
  });

  it("uses modern explicit Next Image delivery formats and does not enable SVG optimization", () => {
    expect(nextConfig.images?.formats).toEqual(["image/webp"]);
    expect(nextConfig.images?.dangerouslyAllowSVG).not.toBe(true);
    expect(nextConfig.images?.qualities).toEqual([70, 75]);
    expect(nextConfig.images?.remotePatterns).toHaveLength(3);
    expect(nextConfig.images?.remotePatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostname: "njufw8f4mlcjsl7g.public.blob.vercel-storage.com",
          pathname: "/media/**",
          protocol: "https",
          search: "",
        }),
      ]),
    );
    expect(JSON.stringify(nextConfig.images?.remotePatterns)).not.toContain(
      "**.public.blob.vercel-storage.com",
    );
  });

  it("keeps Unsplash out of Next Image config and CSP image sources", async () => {
    const remotePatterns = JSON.stringify(nextConfig.images?.remotePatterns);
    const headers = await nextConfig.headers?.();
    const csp = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy-Report-Only")
      ?.value;

    expect(remotePatterns).not.toContain("unsplash");
    expect(csp).not.toContain("unsplash");
    expect(csp).not.toContain("https://*.public.blob.vercel-storage.com");
    expect(csp).toContain(
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com",
    );
  });

  it("keeps Unsplash out of production-facing fallback source files", () => {
    const sourceFiles = [
      "components/sections/brand-story-teaser.tsx",
      "lib/story-narrative-images.ts",
      "lib/data/sarees.ts",
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(join(process.cwd(), sourceFile), "utf8");
      expect(source).not.toContain("images.unsplash.com");
      expect(source).not.toContain("plus.unsplash.com");
    }
  });

  it("keeps the shared navbar logo eager without competing with page LCP priority", () => {
    const source = readFileSync(
      join(process.cwd(), "components/layout/site-header-server.tsx"),
      "utf8",
    );

    expect(source).toContain('src="/Ftt_logo_navbar.avif"');
    expect(source).toContain('loading="eager"');
    expect(source).not.toContain('fetchPriority="high"');
  });
});
