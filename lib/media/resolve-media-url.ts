import {
  resolveCurrentMediaImage,
  resolveCurrentProductImage,
  type CurrentMediaLike,
  type CurrentProductImageLike,
} from "@/lib/media/product-image-resolver";

export const resolveMediaURL = (media: unknown): string | null => {
  if (!media) return null;

  if (typeof media === "object" && media !== null && "media" in media) {
    const resolved = resolveCurrentProductImage(
      media as CurrentProductImageLike,
      "card",
    ).image?.url;
    if (resolved) return resolved;
    const relation = media as { media?: unknown };
    return resolveMediaURL(relation.media ?? null);
  }

  if (typeof media === "string") {
    if (
      media.startsWith("http://") ||
      media.startsWith("https://") ||
      media.startsWith("/")
    ) {
      return media;
    }

    if (media.startsWith("media/")) {
      return `/${media}`;
    }

    return null;
  }

  if (typeof media === "object") {
    const mediaRecord = media as CurrentMediaLike & {
      filename?: string;
      pathname?: string;
    };

    const card = resolveCurrentMediaImage(mediaRecord, "card").image?.url;
    if (card) return card;

    // Generic CMS media can intentionally use a non-product URL. Product
    // surfaces resolve through the approved role-aware path above.
    if (typeof mediaRecord.url === "string") return mediaRecord.url;

    if (typeof mediaRecord.pathname === "string") {
      if (mediaRecord.pathname.startsWith("http")) {
        return mediaRecord.pathname;
      }

      return mediaRecord.pathname.startsWith("/")
        ? mediaRecord.pathname
        : `/${mediaRecord.pathname}`;
    }
  }

  return null;
};
