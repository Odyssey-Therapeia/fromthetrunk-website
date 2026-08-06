import { describe, expect, it } from "vitest";

import {
  resolveCurrentMediaImage,
  resolveCurrentProductImage,
  resolvePrimaryCurrentProductImage,
  serializeCurrentProductImages,
} from "@/lib/media/product-image-resolver";

const host = "njufw8f4mlcjsl7g.public.blob.vercel-storage.com";
const url = (name: string) => `https://${host}/media/${name}`;

describe("current product image resolver", () => {
  it("prefers a legacy metadata card variant before the original", () => {
    const result = resolveCurrentMediaImage(
      {
        id: "media-1",
        url: url("original.jpg"),
        mimeType: "image/jpeg",
        filesize: 8_000_000,
        metadata: {
          sizes: {
            card: {
              url: url("card.webp"),
              width: 800,
              height: 1_000,
              filesize: 140_000,
              mimeType: "image/webp",
            },
          },
        },
      },
      "card",
    );

    expect(result.image).toMatchObject({
      fallbackToOriginal: false,
      source: "card",
      url: url("card.webp"),
      width: 800,
    });
  });

  it("chooses the smallest existing thumbnail candidate", () => {
    const result = resolveCurrentMediaImage(
      {
        url: url("original.jpg"),
        sizes: {
          card: { url: url("card.webp"), width: 800, height: 1_000 },
          thumbnail: {
            url: url("thumbnail.webp"),
            width: 240,
            height: 300,
          },
        },
      },
      "thumbnail",
    );

    expect(result.image).toMatchObject({
      source: "thumbnail",
      url: url("thumbnail.webp"),
      width: 240,
    });
  });

  it("prefers a bounded web-ready PDP candidate", () => {
    const result = resolveCurrentProductImage(
      {
        media: {
          url: url("original.jpg"),
          variants: {
            webReady: {
              url: url("web-ready.webp"),
              width: 1_600,
              height: 2_000,
              filesize: 400_000,
              mimeType: "image/webp",
            },
          },
        },
      },
      "pdp",
    );

    expect(result.image).toMatchObject({
      fallbackToOriginal: false,
      source: "web_ready",
      url: url("web-ready.webp"),
    });
  });

  it("marks a visible original-only source as the temporary storefront fallback", () => {
    const result = resolveCurrentMediaImage(
      {
        url: url("original.jpg"),
        filesize: 12_000_000,
        mimeType: "image/jpeg",
      },
      "card",
    );

    expect(result.image).toMatchObject({
      fallbackToOriginal: true,
      source: "main",
      url: url("original.jpg"),
    });
  });

  it("rejects a measured oversized visible source instead of timing out the optimizer", () => {
    expect(
      resolveCurrentMediaImage(
        {
          url: url("oversized-visible.jpg"),
          filesize: 43_000_000,
          mimeType: "image/jpeg",
          width: 4_000,
          height: 6_000,
        },
        "thumbnail",
      ),
    ).toEqual({ image: null, reason: "over_budget" });
  });

  it.each(["seo", "social", "feed"] as const)(
    "fails closed for an unmeasured original on the %s surface",
    (role) => {
      const result = resolveCurrentMediaImage(
        {
          url: url("original.jpg"),
          filesize: 12_000_000,
          mimeType: "image/jpeg",
        },
        role,
      );

      expect(result).toEqual({ image: null, reason: "unknown_dimensions" });
    },
  );

  it("selects a measured bounded SEO variant before a large original", () => {
    const result = resolveCurrentMediaImage(
      {
        url: url("original.jpg"),
        width: 4_000,
        height: 5_000,
        filesize: 10_000_000,
        mimeType: "image/jpeg",
        metadata: {
          variants: {
            seo: {
              url: url("seo.webp"),
              width: 1_600,
              height: 2_000,
              filesize: 450_000,
              mimeType: "image/webp",
            },
          },
        },
      },
      "seo",
    );

    expect(result.image).toMatchObject({
      fallbackToOriginal: false,
      source: "seo",
      url: url("seo.webp"),
    });
  });

  it("rejects optimizer, query-string, and unsupported direct SEO candidates", () => {
    expect(
      resolveCurrentMediaImage(
        {
          url: `${url("seo.webp")}?width=1600`,
          width: 1_600,
          height: 2_000,
          filesize: 400_000,
          mimeType: "image/webp",
        },
        "seo",
      ).reason,
    ).toBe("unsafe_host_or_path");
    expect(
      resolveCurrentMediaImage(
        {
          url: url("seo.gif"),
          width: 1_600,
          height: 2_000,
          filesize: 400_000,
          mimeType: "image/gif",
        },
        "seo",
      ).reason,
    ).toBe("unsupported_mime");
  });

  it("accepts a measured current PNG for SEO and feed surfaces", () => {
    const media = {
      url: url("current.png"),
      width: 1_200,
      height: 1_500,
      filesize: 900_000,
      mimeType: "image/png",
    };

    expect(resolveCurrentMediaImage(media, "seo").image?.url).toBe(media.url);
    expect(resolveCurrentMediaImage(media, "feed").image?.url).toBe(media.url);
  });

  it("keeps a measured feed source within the 16 MB / 64 MP current-data limit", () => {
    const result = resolveCurrentMediaImage(
      {
        url: url("feed-current.jpg"),
        width: 4_000,
        height: 6_000,
        filesize: 14_000_000,
        mimeType: "image/jpeg",
      },
      "feed",
    );

    expect(result.image?.url).toBe(url("feed-current.jpg"));
  });

  it("chooses the smallest same-product current source for cards and feeds", () => {
    const product = {
      images: [
        {
          sortOrder: 0,
          media: {
            url: url("oversized-primary.jpg"),
            width: 4_000,
            height: 6_000,
            filesize: 28_000_000,
            mimeType: "image/jpeg",
          },
        },
        {
          sortOrder: 1,
          media: {
            url: url("bounded-alternative.jpg"),
            width: 1_600,
            height: 2_400,
            filesize: 850_000,
            mimeType: "image/jpeg",
          },
        },
      ],
    };

    expect(resolvePrimaryCurrentProductImage(product, "card").image?.url).toBe(
      url("bounded-alternative.jpg"),
    );
    expect(resolvePrimaryCurrentProductImage(product, "feed").image?.url).toBe(
      url("bounded-alternative.jpg"),
    );
  });

  it("sorts by product image order and keeps PDP and thumbnail pairs aligned", () => {
    const product = {
      images: [
        { sortOrder: 2, media: { url: url("second.jpg") } },
        { sortOrder: 0, media: { url: url("first.jpg") } },
      ],
    };

    expect(resolvePrimaryCurrentProductImage(product, "card").image?.url).toBe(
      url("first.jpg"),
    );
    expect(serializeCurrentProductImages(product)).toEqual([
      expect.objectContaining({
        pdpUrl: url("first.jpg"),
        thumbnailUrl: url("first.jpg"),
        url: url("first.jpg"),
      }),
      expect.objectContaining({
        pdpUrl: url("second.jpg"),
        thumbnailUrl: url("second.jpg"),
        url: url("second.jpg"),
      }),
    ]);
  });
});
