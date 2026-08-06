export const MEDIA_DERIVATIVE_GENERATION_VERSION = 1;

export const MEDIA_DERIVATIVE_ROLES = [
  "seo_master",
  "pdp",
  "card",
  "thumbnail",
  "social_og",
  "feed",
] as const;

export type MediaDerivativeRole = (typeof MEDIA_DERIVATIVE_ROLES)[number];
export type MediaDerivativeStatus = "failed" | "processing" | "ready";

export const APPROVED_MEDIA_HOSTS = new Set([
  "ll1rv51y3jxrt1nr.public.blob.vercel-storage.com",
  "mgkwfyatucnr0yzo.public.blob.vercel-storage.com",
  "njufw8f4mlcjsl7g.public.blob.vercel-storage.com",
]);

const isSafeMediaUrl = (value: string, allowedHosts: ReadonlySet<string>): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      allowedHosts.has(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/media/") &&
      !url.search &&
      !url.hash &&
      !url.pathname.includes("/_next/image")
    );
  } catch {
    return false;
  }
};

const configuredSourceHosts = (): Set<string> =>
  new Set(
    (process.env.FTT_MEDIA_SOURCE_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

export const isApprovedSourceMediaUrl = (value: string): boolean => {
  const allowed = new Set([...APPROVED_MEDIA_HOSTS, ...configuredSourceHosts()]);
  return isSafeMediaUrl(value, allowed);
};

export const isApprovedDerivativeDestinationUrl = (value: string): boolean => {
  const expectedHost = process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST
    ?.trim()
    .toLowerCase();
  return Boolean(expectedHost && isSafeMediaUrl(value, new Set([expectedHost])));
};

export const APPROVED_SOURCE_MIME_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type MediaDerivativeBudget = {
  format: "jpeg" | "webp";
  hardMaxBytes: number;
  maxWidth: number;
  minWidth: number;
  mimeType: "image/jpeg" | "image/webp";
  targetBytes: number;
  targetHeight?: number;
  targetWidth: number;
};

export const MEDIA_DERIVATIVE_BUDGETS: Record<
  MediaDerivativeRole,
  MediaDerivativeBudget
> = {
  thumbnail: {
    format: "webp",
    hardMaxBytes: 80_000,
    maxWidth: 320,
    minWidth: 240,
    mimeType: "image/webp",
    targetBytes: 50_000,
    targetWidth: 320,
  },
  card: {
    format: "webp",
    hardMaxBytes: 220_000,
    maxWidth: 800,
    minWidth: 640,
    mimeType: "image/webp",
    targetBytes: 150_000,
    targetWidth: 800,
  },
  pdp: {
    format: "webp",
    hardMaxBytes: 700_000,
    maxWidth: 1_600,
    minWidth: 1_200,
    mimeType: "image/webp",
    targetBytes: 400_000,
    targetWidth: 1_600,
  },
  seo_master: {
    format: "webp",
    hardMaxBytes: 500_000,
    maxWidth: 1_600,
    minWidth: 1_200,
    mimeType: "image/webp",
    targetBytes: 400_000,
    targetWidth: 1_600,
  },
  feed: {
    format: "webp",
    hardMaxBytes: 500_000,
    maxWidth: 1_600,
    minWidth: 1_200,
    mimeType: "image/webp",
    targetBytes: 400_000,
    targetWidth: 1_600,
  },
  social_og: {
    format: "jpeg",
    hardMaxBytes: 300_000,
    maxWidth: 1_200,
    minWidth: 1_200,
    mimeType: "image/jpeg",
    targetBytes: 250_000,
    targetHeight: 630,
    targetWidth: 1_200,
  },
};

export type MediaDerivativeLike = {
  byteSize?: number | null;
  failureReason?: string | null;
  generationVersion?: number | null;
  height?: number | null;
  mediaAssetId?: string | null;
  mimeType?: string | null;
  objectKey?: string | null;
  role?: MediaDerivativeRole | null;
  sourceHash?: string | null;
  sourceUpdatedAt?: Date | string | null;
  status?: MediaDerivativeStatus | null;
  url?: string | null;
  width?: number | null;
};

export type DerivativeValidationReason =
  | "invalid_dimensions"
  | "invalid_generation_version"
  | "failure_recorded"
  | "missing_output_metadata"
  | "not_ready"
  | "over_budget"
  | "unexpected_mime"
  | "unsafe_host_or_path";

export const isApprovedMediaUrl = (value: string): boolean => {
  return (
    isApprovedSourceMediaUrl(value) ||
    isApprovedDerivativeDestinationUrl(value)
  );
};

export const validateReadyMediaDerivative = (
  derivative: MediaDerivativeLike,
): { reason: DerivativeValidationReason | null; valid: boolean } => {
  if (derivative.status !== "ready") {
    return { reason: "not_ready", valid: false };
  }
  if (derivative.failureReason) {
    return { reason: "failure_recorded", valid: false };
  }
  if (derivative.generationVersion !== MEDIA_DERIVATIVE_GENERATION_VERSION) {
    return { reason: "invalid_generation_version", valid: false };
  }
  const role = derivative.role;
  if (!role || !MEDIA_DERIVATIVE_ROLES.includes(role)) {
    return { reason: "missing_output_metadata", valid: false };
  }
  const budget = MEDIA_DERIVATIVE_BUDGETS[role];
  if (
    !derivative.url ||
    !derivative.objectKey ||
    !derivative.sourceHash ||
    !derivative.mimeType ||
    !derivative.byteSize ||
    !derivative.width ||
    !derivative.height
  ) {
    return { reason: "missing_output_metadata", valid: false };
  }
  if (!isApprovedDerivativeDestinationUrl(derivative.url)) {
    return { reason: "unsafe_host_or_path", valid: false };
  }
  if (derivative.mimeType !== budget.mimeType) {
    return { reason: "unexpected_mime", valid: false };
  }
  if (
    derivative.width < budget.minWidth ||
    derivative.width > budget.maxWidth ||
    derivative.height <= 0 ||
    (budget.targetHeight !== undefined &&
      derivative.height !== budget.targetHeight)
  ) {
    return { reason: "invalid_dimensions", valid: false };
  }
  if (derivative.byteSize > budget.hardMaxBytes) {
    return { reason: "over_budget", valid: false };
  }
  return { reason: null, valid: true };
};

export const derivativeObjectKey = ({
  mediaAssetId,
  role,
  sourceHash,
}: {
  mediaAssetId: string;
  role: MediaDerivativeRole;
  sourceHash: string;
}): string => {
  const extension = MEDIA_DERIVATIVE_BUDGETS[role].format === "jpeg" ? "jpg" : "webp";
  return `media/derivatives/v${MEDIA_DERIVATIVE_GENERATION_VERSION}/${mediaAssetId}/${sourceHash.slice(0, 24)}/${role}.${extension}`;
};
