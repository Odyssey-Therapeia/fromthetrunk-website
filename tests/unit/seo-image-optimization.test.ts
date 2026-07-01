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
    expect(toSeoImageUrl("data:image/png;base64,abc")).toBeNull();
  });

  it("keeps HTTPS CDN images and dedupes product image arrays", () => {
    const product = {
      images: [
        { media: { url: "https://cdn.example.com/a.webp" } },
        { media: { url: "https://cdn.example.com/a.webp" } },
        { media: { url: "http://localhost:3000/private.jpg" } },
      ],
    };

    expect(productSeoImageUrls(product as never)).toEqual([
      "https://cdn.example.com/a.webp",
    ]);
  });

  it("uses modern explicit Next Image delivery formats and does not enable SVG optimization", () => {
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
    expect(nextConfig.images?.dangerouslyAllowSVG).not.toBe(true);
    expect(nextConfig.images?.remotePatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostname: "**.public.blob.vercel-storage.com",
          protocol: "https",
        }),
      ]),
    );
  });
});
