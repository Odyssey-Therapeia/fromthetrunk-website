import type { Metadata } from "next";

import { absoluteCanonicalUrl, absoluteUrl } from "@/lib/seo/site-url";
import { toSeoImageUrl } from "@/lib/seo/image-urls";

export const SITE_NAME = "From The Trunk";
export const OG_LOCALE = "en_IN";
export const DEFAULT_TWITTER_CARD = "summary_large_image";

export const DEFAULT_SOCIAL_IMAGE = {
  url: "/banner/from-the-trunk-social-v1.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "From The Trunk curated preloved luxury saree collection",
} as const;

export type SeoImageInput = {
  url?: null | string;
  width?: null | number;
  height?: null | number;
  alt?: null | string;
  mimeType?: null | string;
};

export type SeoImageMetadata = {
  url: string;
  width?: number;
  height?: number;
  alt: string;
  type: "image/jpeg" | "image/png";
};

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: SeoImageInput;
  /**
   * Opt-in: keep an allowlisted canonical query string on `path` instead of
   * stripping it. Only for routes that have already canonicalised their own
   * query state (currently just paginated /collection). Defaults to false so
   * every existing caller keeps the safe query-stripping behaviour.
   */
  preserveCanonicalQuery?: boolean;
};

const positiveInteger = (value: null | number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;

export function seoImageMetadata(input?: SeoImageInput): SeoImageMetadata {
  const requestedUrl = input?.url?.trim();
  const safeRequestedUrl = requestedUrl ? toSeoImageUrl(requestedUrl) : null;
  const url = safeRequestedUrl ? new URL(safeRequestedUrl) : null;
  const extensionType = url?.pathname.match(/\.jpe?g$/i)
    ? "image/jpeg"
    : url?.pathname.match(/\.png$/i)
      ? "image/png"
      : undefined;
  const mimeType = input?.mimeType?.trim().toLowerCase() || extensionType;
  const isPublicPath = url &&
    !/^\/(?:api|_next|admin|account|checkout|cart|search|wishlist)(?:\/|$)/i.test(url.pathname);

  // Social fetchers need directly crawlable JPEG/PNG assets. Reset the entire
  // descriptor on rejection: the requested image's dimensions/alt do not
  // describe the brand fallback. Never infer dimensions for custom assets.
  if (
    !url ||
    !isPublicPath ||
    url.username ||
    url.password ||
    (mimeType !== "image/jpeg" && mimeType !== "image/png") ||
    (extensionType && extensionType !== mimeType) ||
    /\.(?:avif|webp|svg|gif)$/i.test(url.pathname)
  ) {
    return { ...DEFAULT_SOCIAL_IMAGE, url: absoluteUrl(DEFAULT_SOCIAL_IMAGE.url) };
  }

  return {
    url: url.toString(),
    width: positiveInteger(input?.width),
    height: positiveInteger(input?.height),
    alt: input?.alt?.trim() || DEFAULT_SOCIAL_IMAGE.alt,
    type: mimeType,
  };
}

export function publicPageMetadata({
  title,
  description,
  path,
  image,
  preserveCanonicalQuery = false,
}: PublicPageMetadataInput): Metadata {
  const canonical = preserveCanonicalQuery
    ? absoluteCanonicalUrl(path)
    : absoluteUrl(path);
  const socialImage = seoImageMetadata(image);
  const metadataTitle = title.includes(SITE_NAME)
    ? { absolute: title }
    : title;

  return {
    title: metadataTitle,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images: [socialImage],
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title,
      description,
      images: [socialImage],
    },
  };
}
