import type { Metadata } from "next";

import { absoluteUrl } from "@/lib/seo/site-url";
import { toSeoImageUrl } from "@/lib/seo/image-urls";

export const SITE_NAME = "From the Trunk";
export const OG_LOCALE = "en_IN";
export const DEFAULT_TWITTER_CARD = "summary_large_image";

export const DEFAULT_SOCIAL_IMAGE = {
  url: "/banner/collection_banner.png",
  width: 1920,
  height: 1080,
  alt: "From the Trunk curated pre-loved luxury saree collection",
} as const;

export type SeoImageInput = {
  url?: null | string;
  width?: null | number;
  height?: null | number;
  alt?: null | string;
};

export type SeoImageMetadata = {
  url: string;
  width?: number;
  height?: number;
  alt: string;
};

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: SeoImageInput;
};

const positiveInteger = (value: null | number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;

export function seoImageMetadata(input?: SeoImageInput): SeoImageMetadata {
  const requestedUrl = input?.url?.trim();
  const safeRequestedUrl = requestedUrl ? toSeoImageUrl(requestedUrl) : null;
  const usesDefaultImage = !safeRequestedUrl;

  return {
    url: safeRequestedUrl ?? absoluteUrl(DEFAULT_SOCIAL_IMAGE.url),
    width:
      positiveInteger(input?.width) ??
      (usesDefaultImage ? DEFAULT_SOCIAL_IMAGE.width : undefined),
    height:
      positiveInteger(input?.height) ??
      (usesDefaultImage ? DEFAULT_SOCIAL_IMAGE.height : undefined),
    alt: input?.alt?.trim() || DEFAULT_SOCIAL_IMAGE.alt,
  };
}

export function publicPageMetadata({
  title,
  description,
  path,
  image,
}: PublicPageMetadataInput): Metadata {
  const canonical = absoluteUrl(path);
  const socialImage = seoImageMetadata(image);

  return {
    title,
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
