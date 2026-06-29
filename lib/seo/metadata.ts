import type { Metadata } from "next";

import { absoluteUrl } from "@/lib/seo/site-url";

const DEFAULT_OG_IMAGE = "/banner/collection_banner.png";

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function publicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadataInput): Metadata {
  const canonical = absoluteUrl(path);

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
      images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE) }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
  };
}
