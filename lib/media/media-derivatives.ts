import {
  isApprovedMediaUrl,
  type MediaDerivativeLike,
  type MediaDerivativeRole,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";

export const SEO_IMAGE_MIN_WIDTH = 1_200;
export const SEO_IMAGE_MAX_WIDTH = 1_600;
export const SEO_IMAGE_MAX_BYTES = 500_000;

export type SeoImageFailureReason =
  | "legacy_original_only"
  | "missing_derivative"
  | "over_budget"
  | "unsupported_mime"
  | "unsafe_host_or_path"
  | "unknown_dimensions";

type MediaLike = {
  alt?: null | string;
  derivativeDeliveryActive?: boolean;
  derivatives?: MediaDerivativeLike[];
  filesize?: null | number;
  height?: null | number;
  id?: null | string;
  metadata?: null | Record<string, unknown>;
  mimeType?: null | string;
  url?: null | string;
  width?: null | number;
};

type ProductImageLike = {
  media?: null | MediaLike;
  sortOrder?: null | number;
};

type ProductWithImagesLike = {
  images?: null | ProductImageLike[];
};

export type ResolvedSeoImage = {
  alt: string | null;
  filesize?: number;
  height?: number;
  mediaId: string | null;
  role?: MediaDerivativeRole;
  url: string;
  width?: number;
};

export type SeoImageResolution =
  | { image: ResolvedSeoImage; reason: null }
  | { image: null; reason: SeoImageFailureReason };

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** Phase 2A bounded-source audit helper. Not the pre-activation resolver. */
export function resolveBoundedSeoImage(
  media: MediaLike | null | undefined,
): SeoImageResolution {
  if (!media?.url) return { image: null, reason: "missing_derivative" };
  const metadata = media.metadata ?? {};
  if (metadata.legacySource === "payload") {
    return { image: null, reason: "legacy_original_only" };
  }
  if (metadata.source !== "vercel-blob") {
    return { image: null, reason: "missing_derivative" };
  }
  if (
    !media.mimeType ||
    !["image/avif", "image/jpeg", "image/webp"].includes(media.mimeType)
  ) {
    return { image: null, reason: "unsupported_mime" };
  }
  if (
    !positiveInteger(media.width) ||
    !positiveInteger(media.height) ||
    !positiveInteger(media.filesize)
  ) {
    return { image: null, reason: "unknown_dimensions" };
  }
  if (
    media.width < SEO_IMAGE_MIN_WIDTH ||
    media.width > SEO_IMAGE_MAX_WIDTH ||
    media.filesize > SEO_IMAGE_MAX_BYTES
  ) {
    return { image: null, reason: "over_budget" };
  }
  if (!isApprovedMediaUrl(media.url)) {
    return { image: null, reason: "unsafe_host_or_path" };
  }
  return {
    image: {
      alt: media.alt?.trim() || null,
      filesize: media.filesize,
      height: media.height,
      mediaId: media.id ?? null,
      url: media.url,
      width: media.width,
    },
    reason: null,
  };
}

const resolvePreActivationOriginal = (
  media: MediaLike | null | undefined,
  requireApprovedUrl = false,
): SeoImageResolution => {
  if (!media?.url) return { image: null, reason: "missing_derivative" };
  if (requireApprovedUrl && !isApprovedMediaUrl(media.url)) {
    return { image: null, reason: "unsafe_host_or_path" };
  }
  return {
    image: {
      alt: media.alt?.trim() || null,
      ...(positiveInteger(media.filesize) ? { filesize: media.filesize } : {}),
      ...(positiveInteger(media.height) ? { height: media.height } : {}),
      mediaId: media.id ?? null,
      url: media.url,
      ...(positiveInteger(media.width) ? { width: media.width } : {}),
    },
    reason: null,
  };
};

export const resolveMediaImageForRole = (
  media: MediaLike | null | undefined,
  role: MediaDerivativeRole,
): SeoImageResolution => {
  if (!media?.derivativeDeliveryActive) {
    return resolvePreActivationOriginal(
      media,
      role === "seo_master" || role === "feed" || role === "social_og",
    );
  }
  const derivative = media.derivatives?.find(
    (candidate) =>
      candidate.role === role && validateReadyMediaDerivative(candidate).valid,
  );
  if (!derivative?.url) {
    return { image: null, reason: "missing_derivative" };
  }
  return {
    image: {
      alt: media.alt?.trim() || null,
      filesize: derivative.byteSize ?? undefined,
      height: derivative.height ?? undefined,
      mediaId: media.id ?? null,
      role,
      url: derivative.url,
      width: derivative.width ?? undefined,
    },
    reason: null,
  };
};

export const resolveProductImageForRole = (
  image: ProductImageLike | null | undefined,
  role: MediaDerivativeRole,
): SeoImageResolution => resolveMediaImageForRole(image?.media, role);

export function resolvePrimaryProductImageForRole(
  product: ProductWithImagesLike,
  role: MediaDerivativeRole,
): SeoImageResolution {
  const primary = [...(product.images ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0];
  return resolveProductImageForRole(primary, role);
}

export const resolvePrimarySeoImage = (
  product: ProductWithImagesLike,
): SeoImageResolution => resolvePrimaryProductImageForRole(product, "seo_master");

export const resolvePrimaryFeedImage = (
  product: ProductWithImagesLike,
): SeoImageResolution => resolvePrimaryProductImageForRole(product, "feed");

export const resolvePrimarySocialImage = (
  product: ProductWithImagesLike,
): SeoImageResolution => resolvePrimaryProductImageForRole(product, "social_og");

export const serializePublicProductImages = (product: ProductWithImagesLike) =>
  [...(product.images ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((image) => {
      if (!image.media?.derivativeDeliveryActive) {
        return {
          alt: image.media?.alt ?? null,
          filename:
            image.media && "filename" in image.media
              ? (image.media as MediaLike & { filename?: string }).filename ?? null
              : null,
          height: image.media?.height ?? null,
          sortOrder: image.sortOrder ?? 0,
          url: image.media?.url ?? null,
          width: image.media?.width ?? null,
        };
      }
      const card = resolveProductImageForRole(image, "card").image;
      const pdp = resolveProductImageForRole(image, "pdp").image;
      const thumbnail = resolveProductImageForRole(image, "thumbnail").image;
      return {
        alt: image.media?.alt ?? null,
        filename:
          image.media && "filename" in image.media
            ? (image.media as MediaLike & { filename?: string }).filename ?? null
            : null,
        height: card?.height ?? null,
        pdpUrl: pdp?.url ?? null,
        sortOrder: image.sortOrder ?? 0,
        thumbnailUrl: thumbnail?.url ?? null,
        url: card?.url ?? null,
        width: card?.width ?? null,
      };
    });
