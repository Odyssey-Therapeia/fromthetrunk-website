import {
  APPROVED_SOURCE_MIME_TYPES,
  isApprovedMediaUrl,
  type MediaDerivativeLike,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";
import { getCurrentProductMediaMeasurement } from "@/lib/media/current-product-media-measurements.generated";

export const PRODUCT_IMAGE_ROLES = [
  "card",
  "thumbnail",
  "pdp",
  "seo",
  "social",
  "feed",
] as const;

export type ProductImageRole = (typeof PRODUCT_IMAGE_ROLES)[number];

export type ProductImageFailureReason =
  | "missing_image"
  | "over_budget"
  | "undersized"
  | "unknown_dimensions"
  | "unknown_filesize"
  | "unsafe_host_or_path"
  | "unsupported_mime";

export type ProductImageSource =
  | "card"
  | "compressed"
  | "feed"
  | "large"
  | "main"
  | "medium"
  | "pdp"
  | "seo"
  | "social"
  | "thumbnail"
  | "web_ready";

type ImageVariantLike = {
  alt?: null | string;
  byteSize?: null | number;
  filesize?: null | number;
  height?: null | number;
  mimeType?: null | string;
  url?: null | string;
  width?: null | number;
};

type VariantValue = ImageVariantLike | null | string | undefined;

type VariantContainer = {
  card?: VariantValue;
  compressed?: VariantValue;
  feed?: VariantValue;
  large?: VariantValue;
  medium?: VariantValue;
  pdp?: VariantValue;
  seo?: VariantValue;
  seo_master?: VariantValue;
  social?: VariantValue;
  social_og?: VariantValue;
  thumb?: VariantValue;
  thumbnail?: VariantValue;
  web?: VariantValue;
  webReady?: VariantValue;
  web_ready?: VariantValue;
};

export type CurrentMediaLike = ImageVariantLike & {
  alt?: null | string;
  derivativeDeliveryActive?: boolean;
  derivatives?: MediaDerivativeLike[];
  id?: null | string;
  filename?: null | string;
  metadata?: null | (Record<string, unknown> & {
    sizes?: VariantContainer;
    variants?: VariantContainer;
  });
  sizes?: VariantContainer;
  variants?: VariantContainer;
};

export type CurrentProductImageLike = {
  media?: CurrentMediaLike | null;
  sortOrder?: null | number;
};

type ProductWithImagesLike = {
  images?: CurrentProductImageLike[] | null;
};

export type ResolvedProductImage = {
  alt: string | null;
  fallbackToOriginal: boolean;
  filesize?: number;
  height?: number;
  mediaId: string | null;
  mimeType?: string;
  source: ProductImageSource;
  url: string;
  width?: number;
};

export type ProductImageResolution =
  | { image: ResolvedProductImage; reason: null }
  | { image: null; reason: ProductImageFailureReason };

type Candidate = ResolvedProductImage & { isMain: boolean };

const DIRECT_ROLE_LIMITS: Record<
  Extract<ProductImageRole, "feed" | "seo" | "social">,
  { maxBytes: number; maxPixels: number; minHeight: number; minWidth: number }
> = {
  // Current-data SEO remains deliberately tighter than feed delivery so a
  // crawler never receives a very large original merely because it is first.
  seo: { maxBytes: 5_000_000, maxPixels: 40_000_000, minHeight: 500, minWidth: 500 },
  // Merchant Center accepts images up to 16 MB / 64 MP. Requiring 500px on
  // both axes also meets Google's announced 2027 apparel minimum early.
  feed: { maxBytes: 16_000_000, maxPixels: 64_000_000, minHeight: 500, minWidth: 500 },
  social: { maxBytes: 300_000, maxPixels: 4_000_000, minHeight: 630, minWidth: 1_200 },
};

const MAX_VISIBLE_CURRENT_SOURCE_BYTES = 16_000_000;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

const normalizeMimeType = (value: null | string | undefined) => {
  const mime = value?.trim().toLowerCase();
  return mime && APPROVED_SOURCE_MIME_TYPES.has(mime) ? mime : undefined;
};

const measuredMetadata = (url: string) =>
  getCurrentProductMediaMeasurement(url.trim());

const sourceForKey = (key: keyof VariantContainer): ProductImageSource => {
  if (key === "thumb") return "thumbnail";
  if (key === "web" || key === "webReady" || key === "web_ready") {
    return "web_ready";
  }
  if (key === "seo_master") return "seo";
  if (key === "social_og") return "social";
  return key;
};

const normalizeVariant = (
  value: VariantValue,
  source: ProductImageSource,
  media: CurrentMediaLike,
): Candidate | null => {
  const record =
    typeof value === "string" ? ({ url: value } satisfies ImageVariantLike) : value;
  if (!record) return null;
  const url = record.url?.trim();
  if (!url) return null;
  const measured = measuredMetadata(url);
  const byteSize = positiveInteger(
    measured?.byteSize ?? record.byteSize ?? record.filesize,
  );
  const height = positiveInteger(measured?.height ?? record.height);
  const mimeType = normalizeMimeType(measured?.mimeType ?? record.mimeType);
  const width = positiveInteger(measured?.width ?? record.width);

  return {
    alt: record.alt?.trim() || media.alt?.trim() || null,
    fallbackToOriginal: false,
    ...(byteSize !== undefined ? { filesize: byteSize } : {}),
    ...(height !== undefined ? { height } : {}),
    isMain: false,
    mediaId: media.id ?? null,
    ...(mimeType ? { mimeType } : {}),
    source,
    url,
    ...(width !== undefined ? { width } : {}),
  };
};

const visibleUrlIsUsable = (url: string): boolean => {
  if (url.startsWith("/")) {
    return !url.startsWith("/_next/image") && !url.includes("?") && !url.includes("#");
  }
  return isApprovedMediaUrl(url);
};

const variantContainers = (media: CurrentMediaLike): VariantContainer[] => {
  const metadata = media.metadata ?? {};
  const metadataSizes =
    metadata.sizes && typeof metadata.sizes === "object"
      ? metadata.sizes
      : undefined;
  const metadataVariants =
    metadata.variants && typeof metadata.variants === "object"
      ? metadata.variants
      : undefined;
  return [media.sizes, media.variants, metadataSizes, metadataVariants].filter(
    (value): value is VariantContainer => Boolean(value),
  );
};

const derivativeKeyForRole = (role: ProductImageRole) => {
  if (role === "seo") return "seo_master" as const;
  if (role === "social") return "social_og" as const;
  return role;
};

const derivativeCandidate = (
  media: CurrentMediaLike,
  role: ProductImageRole,
): Candidate | null => {
  if (!media.derivativeDeliveryActive) return null;
  const derivative = media.derivatives?.find(
    (candidate) =>
      candidate.role === derivativeKeyForRole(role) &&
      validateReadyMediaDerivative(candidate).valid,
  );
  if (!derivative?.url) return null;
  return normalizeVariant(
    {
      byteSize: derivative.byteSize,
      height: derivative.height,
      mimeType: derivative.mimeType,
      url: derivative.url,
      width: derivative.width,
    },
    role,
    media,
  );
};

const collectCandidates = (
  media: CurrentMediaLike,
  keys: readonly (keyof VariantContainer)[],
): Candidate[] => {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const container of variantContainers(media)) {
      const candidate = normalizeVariant(container[key], sourceForKey(key), media);
      if (!candidate || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      candidates.push(candidate);
    }
  }
  return candidates;
};

const mainCandidate = (media: CurrentMediaLike): Candidate | null => {
  const url = media.url?.trim();
  if (!url) return null;
  const measured = measuredMetadata(url);
  const byteSize = positiveInteger(
    measured?.byteSize ?? media.filesize ?? media.byteSize,
  );
  const height = positiveInteger(measured?.height ?? media.height);
  const mimeType = normalizeMimeType(measured?.mimeType ?? media.mimeType);
  const width = positiveInteger(measured?.width ?? media.width);
  return {
    alt: media.alt?.trim() || null,
    fallbackToOriginal: true,
    ...(byteSize !== undefined ? { filesize: byteSize } : {}),
    ...(height !== undefined ? { height } : {}),
    isMain: true,
    mediaId: media.id ?? null,
    ...(mimeType ? { mimeType } : {}),
    source: "main",
    url,
    ...(width !== undefined ? { width } : {}),
  };
};

const visibleCandidateKeys: Record<
  Extract<ProductImageRole, "card" | "pdp" | "thumbnail">,
  readonly (keyof VariantContainer)[]
> = {
  card: ["card", "webReady", "web_ready", "web", "medium", "compressed"],
  thumbnail: [
    "thumbnail",
    "thumb",
    "card",
    "webReady",
    "web_ready",
    "web",
    "medium",
  ],
  pdp: ["pdp", "webReady", "web_ready", "web", "large", "medium", "compressed"],
};

const safeCandidateKeys: Record<
  Extract<ProductImageRole, "feed" | "seo" | "social">,
  readonly (keyof VariantContainer)[]
> = {
  seo: ["seo", "seo_master", "webReady", "web_ready", "web", "pdp", "large"],
  social: ["social", "social_og", "seo", "seo_master", "webReady", "web_ready"],
  feed: ["feed", "seo", "seo_master", "webReady", "web_ready", "web", "pdp"],
};

const toResolution = (candidate: Candidate): ProductImageResolution => {
  const { isMain: _isMain, ...image } = candidate;
  return { image, reason: null };
};

const resolveVisible = (
  media: CurrentMediaLike,
  role: Extract<ProductImageRole, "card" | "pdp" | "thumbnail">,
): ProductImageResolution => {
  const derivative = derivativeCandidate(media, role);
  if (derivative && visibleUrlIsUsable(derivative.url)) return toResolution(derivative);

  const variants = collectCandidates(media, visibleCandidateKeys[role]).filter(
    (candidate) => visibleUrlIsUsable(candidate.url),
  );
  let selected: Candidate | undefined;
  if (role === "thumbnail") {
    selected = [...variants].sort((a, b) => {
      const widthA = a.width ?? Number.MAX_SAFE_INTEGER;
      const widthB = b.width ?? Number.MAX_SAFE_INTEGER;
      const bytesA = a.filesize ?? Number.MAX_SAFE_INTEGER;
      const bytesB = b.filesize ?? Number.MAX_SAFE_INTEGER;
      return widthA - widthB || bytesA - bytesB;
    })[0];
  } else if (role === "card") {
    selected =
      variants.find((candidate) =>
        candidate.width ? candidate.width >= 640 && candidate.width <= 800 : false,
      ) ?? variants[0];
  } else {
    selected =
      variants.find((candidate) =>
        candidate.width ? candidate.width >= 1_200 && candidate.width <= 1_600 : false,
      ) ?? variants[0];
  }
  if (selected) return toResolution(selected);

  const main = mainCandidate(media);
  if (!main) return { image: null, reason: "missing_image" };
  if (!visibleUrlIsUsable(main.url)) {
    return { image: null, reason: "unsafe_host_or_path" };
  }
  if (
    main.filesize !== undefined &&
    main.filesize > MAX_VISIBLE_CURRENT_SOURCE_BYTES
  ) {
    return { image: null, reason: "over_budget" };
  }
  return toResolution(main);
};

const safeFailureReason = (
  candidate: Candidate,
  role: Extract<ProductImageRole, "feed" | "seo" | "social">,
): ProductImageFailureReason | null => {
  if (!isApprovedMediaUrl(candidate.url)) return "unsafe_host_or_path";
  if (!candidate.mimeType || !APPROVED_SOURCE_MIME_TYPES.has(candidate.mimeType)) {
    return "unsupported_mime";
  }
  if (!candidate.width || !candidate.height) return "unknown_dimensions";
  if (!candidate.filesize) return "unknown_filesize";
  const limits = DIRECT_ROLE_LIMITS[role];
  if (candidate.width < limits.minWidth || candidate.height < limits.minHeight) {
    return "undersized";
  }
  if (
    candidate.width * candidate.height > limits.maxPixels ||
    candidate.filesize > limits.maxBytes
  ) {
    return "over_budget";
  }
  return null;
};

const resolveSafeDirect = (
  media: CurrentMediaLike,
  role: Extract<ProductImageRole, "feed" | "seo" | "social">,
): ProductImageResolution => {
  const derivative = derivativeCandidate(media, role);
  if (derivative && safeFailureReason(derivative, role) === null) {
    return toResolution(derivative);
  }
  const candidates = [
    ...collectCandidates(media, safeCandidateKeys[role]),
    mainCandidate(media),
  ].filter((candidate): candidate is Candidate => Boolean(candidate));
  if (candidates.length === 0) return { image: null, reason: "missing_image" };
  for (const candidate of candidates) {
    if (safeFailureReason(candidate, role) === null) return toResolution(candidate);
  }
  return {
    image: null,
    reason: safeFailureReason(candidates[0]!, role) ?? "missing_image",
  };
};

export function resolveCurrentMediaImage(
  media: CurrentMediaLike | null | undefined,
  role: ProductImageRole,
): ProductImageResolution {
  if (!media) return { image: null, reason: "missing_image" };
  return role === "card" || role === "thumbnail" || role === "pdp"
    ? resolveVisible(media, role)
    : resolveSafeDirect(media, role);
}

export const resolveCurrentProductImage = (
  image: CurrentProductImageLike | null | undefined,
  role: ProductImageRole,
): ProductImageResolution => resolveCurrentMediaImage(image?.media, role);

export function resolvePrimaryCurrentProductImage(
  product: ProductWithImagesLike,
  role: ProductImageRole,
): ProductImageResolution {
  const ordered = [...(product.images ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  if (ordered.length === 0) return { image: null, reason: "missing_image" };

  // PDP selection is relationship-specific so gallery order remains stable.
  // For cards and direct publishing surfaces, compare every current image.
  // This prevents a slow/oversized sort-order-zero original from winning when
  // the same product already has a smaller, valid source image.
  if (role === "pdp") {
    return resolveCurrentProductImage(ordered[0], role);
  }
  const resolved = ordered
    .map((image, index) => ({ index, result: resolveCurrentProductImage(image, role) }))
    .filter(
      (entry): entry is { index: number; result: { image: ResolvedProductImage; reason: null } } =>
        Boolean(entry.result.image),
    )
    .sort((a, b) => {
      if (role === "card") {
        const fallbackOrder =
          Number(a.result.image.fallbackToOriginal) -
          Number(b.result.image.fallbackToOriginal);
        if (fallbackOrder !== 0) return fallbackOrder;
      }
      const bytesA = a.result.image.filesize ?? Number.MAX_SAFE_INTEGER;
      const bytesB = b.result.image.filesize ?? Number.MAX_SAFE_INTEGER;
      return bytesA - bytesB || a.index - b.index;
    });
  return resolved[0]?.result ?? resolveCurrentProductImage(ordered[0], role);
}

export const serializeCurrentProductImages = (product: ProductWithImagesLike) =>
  [...(product.images ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((image) => {
      const card = resolveCurrentProductImage(image, "card").image;
      const pdp = resolveCurrentProductImage(image, "pdp").image;
      const thumbnail = resolveCurrentProductImage(image, "thumbnail").image;
      return {
        alt: image.media?.alt ?? null,
        fallbackToOriginal:
          card?.fallbackToOriginal === true ||
          pdp?.fallbackToOriginal === true ||
          thumbnail?.fallbackToOriginal === true,
        filename: image.media?.filename ?? null,
        height: card?.height ?? null,
        pdpUrl: pdp?.url ?? null,
        sortOrder: image.sortOrder ?? 0,
        source: card?.source ?? null,
        thumbnailUrl: thumbnail?.url ?? null,
        url: card?.url ?? null,
        width: card?.width ?? null,
      };
    });
