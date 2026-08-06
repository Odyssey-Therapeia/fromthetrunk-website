import { createHash } from "node:crypto";

import sharp from "sharp";

import type { MediaDerivativeRecord } from "@/db/queries/media-derivatives";
import {
  APPROVED_SOURCE_MIME_TYPES,
  derivativeObjectKey,
  isApprovedDerivativeDestinationUrl,
  isApprovedMediaUrl,
  isApprovedSourceMediaUrl,
  MEDIA_DERIVATIVE_BUDGETS,
  MEDIA_DERIVATIVE_GENERATION_VERSION,
  MEDIA_DERIVATIVE_ROLES,
  type MediaDerivativeRole,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";

const MAX_SOURCE_BYTES = 12 * 1_024 * 1_024;
const MAX_SOURCE_PIXELS = 24_000_000;
const SOURCE_FETCH_TIMEOUT_MS = 30_000;

export type DerivativeFailureCode =
  | "invalid_source_url"
  | "missing_destination_configuration"
  | "output_over_budget"
  | "processing_failed"
  | "source_pixels_exceeded"
  | "source_too_large"
  | "source_too_small"
  | "unapproved_derivative_url"
  | "unsupported_source_mime"
  | "upload_failed"
  | "upload_verification_failed";

export class DerivativeGenerationError extends Error {
  constructor(readonly code: DerivativeFailureCode) {
    super(code);
    this.name = "DerivativeGenerationError";
  }
}

export type DerivativeSourceAsset = {
  id: string;
  mimeType: string | null;
  updatedAt: Date;
  url: string;
};

export type DerivativeBlobUpload = {
  byteSize: number;
  url: string;
};

export type DerivativeBlobStore = {
  uploadImmutable(input: {
    body: Buffer;
    contentType: string;
    objectKey: string;
  }): Promise<DerivativeBlobUpload>;
};

export type DerivativeRepository = {
  listForAsset(mediaAssetId: string): Promise<MediaDerivativeRecord[]>;
  markProcessing(input: {
    generationVersion: number;
    mediaAssetId: string;
    objectKey: string;
    role: MediaDerivativeRole;
    sourceHash: string;
    sourceUpdatedAt: Date;
  }): Promise<MediaDerivativeRecord>;
  recordFailure(input: {
    failureReason: string;
    generationVersion: number;
    mediaAssetId: string;
    objectKey: string;
    role: MediaDerivativeRole;
    sourceHash: string;
    sourceUpdatedAt: Date;
  }): Promise<MediaDerivativeRecord>;
  saveReady(input: {
    byteSize: number;
    generationVersion: number;
    height: number;
    mediaAssetId: string;
    mimeType: string;
    objectKey: string;
    role: MediaDerivativeRole;
    sourceHash: string;
    sourceUpdatedAt: Date;
    url: string;
    width: number;
  }): Promise<MediaDerivativeRecord>;
};

export type SourceLoader = (
  source: DerivativeSourceAsset,
) => Promise<Buffer>;

type GeneratedOutput = {
  body: Buffer;
  height: number;
  mimeType: "image/jpeg" | "image/webp";
  width: number;
};

export type MediaDerivativeRoleResult = {
  byteSize: number;
  reason: DerivativeFailureCode | null;
  role: MediaDerivativeRole;
  status: "failed" | "generated" | "skipped";
};

export type MediaDerivativeGenerationResult = {
  mediaAssetId: string;
  roles: MediaDerivativeRoleResult[];
  sourceBytes: number;
  sourceHash: string;
};

const qualitySteps = (role: MediaDerivativeRole): number[] => {
  if (role === "social_og") return [88, 85, 82, 80, 78, 75, 72];
  if (role === "thumbnail") return [82, 78, 75, 72, 68, 64, 60];
  return [84, 82, 80, 78, 75, 72, 68, 64, 60];
};

const renderAtQuality = async (
  source: Buffer,
  role: MediaDerivativeRole,
  quality: number,
): Promise<GeneratedOutput> => {
  const budget = MEDIA_DERIVATIVE_BUDGETS[role];
  if (role === "social_og") {
    const product = await sharp(source)
      .rotate()
      .resize({
        fit: "inside",
        height: 570,
        width: 1_100,
        withoutEnlargement: true,
      })
      .toBuffer();
    const { data, info } = await sharp({
      create: {
        background: "#3c0c0f",
        channels: 3,
        height: 630,
        width: 1_200,
      },
    })
      .composite([{ gravity: "center", input: product }])
      .jpeg({ chromaSubsampling: "4:4:4", mozjpeg: true, quality })
      .toBuffer({ resolveWithObject: true });
    return {
      body: data,
      height: info.height,
      mimeType: "image/jpeg",
      width: info.width,
    };
  }

  const { data, info } = await sharp(source)
    .rotate()
    .resize({
      fit: "inside",
      width: budget.targetWidth,
      withoutEnlargement: true,
    })
    .webp({ effort: 5, quality, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  if (info.width < budget.minWidth) {
    throw new DerivativeGenerationError("source_too_small");
  }
  return {
    body: data,
    height: info.height,
    mimeType: "image/webp",
    width: info.width,
  };
};

export const renderMediaDerivative = async (
  source: Buffer,
  role: MediaDerivativeRole,
): Promise<GeneratedOutput> => {
  const budget = MEDIA_DERIVATIVE_BUDGETS[role];
  let hardBudgetCandidate: GeneratedOutput | null = null;

  for (const quality of qualitySteps(role)) {
    const candidate = await renderAtQuality(source, role, quality);
    if (candidate.body.byteLength <= budget.targetBytes) return candidate;
    if (candidate.body.byteLength <= budget.hardMaxBytes) {
      hardBudgetCandidate = candidate;
    }
  }

  if (hardBudgetCandidate) return hardBudgetCandidate;
  throw new DerivativeGenerationError("output_over_budget");
};

export const loadDerivativeSource: SourceLoader = async (source) => {
  if (!isApprovedSourceMediaUrl(source.url)) {
    throw new DerivativeGenerationError("invalid_source_url");
  }
  const response = await fetch(source.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok || !isApprovedSourceMediaUrl(response.url)) {
    throw new DerivativeGenerationError("invalid_source_url");
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SOURCE_BYTES) {
    throw new DerivativeGenerationError("source_too_large");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength <= 0 || body.byteLength > MAX_SOURCE_BYTES) {
    throw new DerivativeGenerationError("source_too_large");
  }
  return body;
};

const validateSource = async (
  source: DerivativeSourceAsset,
  body: Buffer,
): Promise<void> => {
  if (
    source.mimeType &&
    !APPROVED_SOURCE_MIME_TYPES.has(source.mimeType.toLowerCase())
  ) {
    throw new DerivativeGenerationError("unsupported_source_mime");
  }
  const metadata = await sharp(body).metadata();
  const detectedMime = metadata.format === "jpg" ? "jpeg" : metadata.format;
  if (!detectedMime || !["avif", "jpeg", "png", "webp"].includes(detectedMime)) {
    throw new DerivativeGenerationError("unsupported_source_mime");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0 || width * height > MAX_SOURCE_PIXELS) {
    throw new DerivativeGenerationError("source_pixels_exceeded");
  }
};

export const sanitizeDerivativeFailure = (
  error: unknown,
): DerivativeFailureCode =>
  error instanceof DerivativeGenerationError ? error.code : "processing_failed";

export const generateMediaDerivatives = async ({
  blobStore,
  loadSource = loadDerivativeSource,
  repository,
  roles = MEDIA_DERIVATIVE_ROLES,
  source,
}: {
  blobStore: DerivativeBlobStore;
  loadSource?: SourceLoader;
  repository: DerivativeRepository;
  roles?: readonly MediaDerivativeRole[];
  source: DerivativeSourceAsset;
}): Promise<MediaDerivativeGenerationResult> => {
  const sourceBody = await loadSource(source);
  await validateSource(source, sourceBody);
  const sourceHash = createHash("sha256").update(sourceBody).digest("hex");
  const existing = await repository.listForAsset(source.id);
  const roleResults: MediaDerivativeRoleResult[] = [];

  for (const role of roles) {
    const current = existing.find(
      (row) =>
        row.role === role &&
        row.generationVersion === MEDIA_DERIVATIVE_GENERATION_VERSION,
    );
    if (
      current?.sourceHash === sourceHash &&
      validateReadyMediaDerivative(current).valid
    ) {
      roleResults.push({
        byteSize: current.byteSize ?? 0,
        reason: null,
        role,
        status: "skipped",
      });
      continue;
    }

    const objectKey = derivativeObjectKey({
      mediaAssetId: source.id,
      role,
      sourceHash,
    });
    try {
      await repository.markProcessing({
        generationVersion: MEDIA_DERIVATIVE_GENERATION_VERSION,
        mediaAssetId: source.id,
        objectKey,
        role,
        sourceHash,
        sourceUpdatedAt: source.updatedAt,
      });
      const output = await renderMediaDerivative(sourceBody, role);
      const uploaded = await blobStore.uploadImmutable({
        body: output.body,
        contentType: output.mimeType,
        objectKey,
      });
      if (uploaded.byteSize !== output.body.byteLength) {
        throw new DerivativeGenerationError("upload_verification_failed");
      }
      if (!isApprovedDerivativeDestinationUrl(uploaded.url)) {
        throw new DerivativeGenerationError("unapproved_derivative_url");
      }
      const ready = await repository.saveReady({
        byteSize: output.body.byteLength,
        generationVersion: MEDIA_DERIVATIVE_GENERATION_VERSION,
        height: output.height,
        mediaAssetId: source.id,
        mimeType: output.mimeType,
        objectKey,
        role,
        sourceHash,
        sourceUpdatedAt: source.updatedAt,
        url: uploaded.url,
        width: output.width,
      });
      if (!validateReadyMediaDerivative(ready).valid) {
        throw new DerivativeGenerationError("upload_verification_failed");
      }
      roleResults.push({
        byteSize: output.body.byteLength,
        reason: null,
        role,
        status: "generated",
      });
    } catch (error) {
      const failureReason = sanitizeDerivativeFailure(error);
      await repository.recordFailure({
        failureReason,
        generationVersion: MEDIA_DERIVATIVE_GENERATION_VERSION,
        mediaAssetId: source.id,
        objectKey,
        role,
        sourceHash,
        sourceUpdatedAt: source.updatedAt,
      });
      roleResults.push({
        byteSize: 0,
        reason: failureReason,
        role,
        status: "failed",
      });
    }
  }

  return {
    mediaAssetId: source.id,
    roles: roleResults,
    sourceBytes: sourceBody.byteLength,
    sourceHash,
  };
};
