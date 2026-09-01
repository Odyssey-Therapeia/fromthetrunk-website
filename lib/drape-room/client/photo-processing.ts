"use client";

import imageCompression from "browser-image-compression";
import { sha256Hex } from "./storage";
import {
  PHOTO_READINESS_POLICY_VERSION,
  type PhotoReadinessResult,
} from "./photo-readiness-policy";

export const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_SOURCE_PHOTO_PIXELS = 40_000_000;
export const MAX_PROCESSED_PHOTO_EDGE = 1_280;
export const TARGET_PROCESSED_PHOTO_BYTES = 1_900_000;
export const MAX_PROCESSED_PHOTO_BYTES = 2_000_000;

const TARGET_PROCESSED_PHOTO_MB = TARGET_PROCESSED_PHOTO_BYTES / (1024 * 1024);
const SECOND_PASS_TARGET_MB = 1_800_000 / (1024 * 1024);
const SOURCE_HEADER_BYTES = 1_024;
const ACCEPTED_SOURCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const BLOCKED_SOURCE_EXTENSIONS = /\.(?:pdf|svg|svgz)$/i;

export type PhotoProcessingErrorCode =
  | "unsupported-type"
  | "source-too-large"
  | "invalid-image"
  | "too-many-pixels"
  | "compression-failed"
  | "compressed-too-large"
  | "readiness-failed"
  | "readiness-unavailable"
  | "browser-unsupported";

export class PhotoProcessingError extends Error {
  constructor(
    readonly code: PhotoProcessingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PhotoProcessingError";
  }
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ValidatedSourcePhoto extends ImageDimensions {
  file: File;
  sourceBytes: number;
  warnings: PhotoGuidanceWarning[];
}

export type PhotoGuidanceWarning =
  | "very-small"
  | "landscape"
  | "extreme-aspect";

export interface ProcessedUserPhoto extends ImageDimensions {
  blob: Blob;
  mimeType: "image/jpeg";
  byteSize: number;
  digest: string;
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  warnings: PhotoGuidanceWarning[];
  readiness: {
    state: "ready";
    policyVersion: typeof PHOTO_READINESS_POLICY_VERSION;
    checkedAt: number;
  };
}

export type PhotoProcessingStage = "compressing" | "checking-readiness";

export async function validateSourcePhoto(
  file: File,
): Promise<ValidatedSourcePhoto> {
  if (!(file instanceof Blob) || typeof file.name !== "string" || file.size <= 0) {
    throw new PhotoProcessingError(
      "invalid-image",
      "Choose a valid photo to continue.",
    );
  }
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new PhotoProcessingError(
      "source-too-large",
      "Choose a photo smaller than 15 MB.",
    );
  }
  const mimeType = file.type.toLowerCase();
  if (
    BLOCKED_SOURCE_EXTENSIONS.test(file.name) ||
    mimeType === "image/svg+xml" ||
    mimeType === "application/pdf" ||
    !ACCEPTED_SOURCE_TYPES.has(mimeType)
  ) {
    throw new PhotoProcessingError(
      "unsupported-type",
      "Use a JPG, PNG, or WebP photo. SVG and PDF files are not accepted.",
    );
  }

  const header = new Uint8Array(
    await file.slice(0, SOURCE_HEADER_BYTES).arrayBuffer(),
  );
  if (looksLikePdf(header) || looksLikeSvg(header) || !signatureMatches(header, mimeType)) {
    throw new PhotoProcessingError(
      "invalid-image",
      "That file does not contain a supported photo.",
    );
  }

  const dimensions = await readImageDimensions(file);
  const pixels = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_SOURCE_PHOTO_PIXELS) {
    throw new PhotoProcessingError(
      "too-many-pixels",
      "Choose a photo no larger than 40 megapixels.",
    );
  }

  return {
    file,
    sourceBytes: file.size,
    ...dimensions,
    warnings: getPhotoGuidanceWarnings(dimensions),
  };
}

export async function processUserPhoto(
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    onStage?: (stage: PhotoProcessingStage) => void;
    analyzeReadiness?: (blob: Blob) => Promise<PhotoReadinessResult>;
  } = {},
): Promise<ProcessedUserPhoto> {
  const source = await validateSourcePhoto(file);
  options.onStage?.("compressing");
  let compressed: File;

  try {
    compressed = await imageCompression(file, {
      maxSizeMB: TARGET_PROCESSED_PHOTO_MB,
      maxWidthOrHeight: MAX_PROCESSED_PHOTO_EDGE,
      fileType: "image/jpeg",
      initialQuality: 0.92,
      preserveExif: false,
      useWebWorker: false,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (compressed.size > MAX_PROCESSED_PHOTO_BYTES) {
      compressed = await imageCompression(compressed, {
        maxSizeMB: SECOND_PASS_TARGET_MB,
        maxWidthOrHeight: MAX_PROCESSED_PHOTO_EDGE,
        fileType: "image/jpeg",
        initialQuality: 0.88,
        preserveExif: false,
        useWebWorker: false,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new PhotoProcessingError(
      "compression-failed",
      "We could not prepare that photo. Try a different image.",
    );
  }

  const blob = new Blob([compressed], { type: "image/jpeg" });
  if (blob.size <= 0 || blob.size > MAX_PROCESSED_PHOTO_BYTES) {
    throw new PhotoProcessingError(
      "compressed-too-large",
      "The prepared photo is still larger than 2 MB. Try a smaller image.",
    );
  }

  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (!signatureMatches(header, "image/jpeg")) {
    throw new PhotoProcessingError(
      "compression-failed",
      "The prepared photo was not a valid JPEG.",
    );
  }

  const dimensions = await readImageDimensions(blob);
  if (
    Math.max(dimensions.width, dimensions.height) > MAX_PROCESSED_PHOTO_EDGE ||
    dimensions.width > source.width ||
    dimensions.height > source.height
  ) {
    throw new PhotoProcessingError(
      "compression-failed",
      "The prepared photo exceeded the maximum dimensions.",
    );
  }

  let readiness: PhotoReadinessResult;
  try {
    options.onStage?.("checking-readiness");
    const analyze =
      options.analyzeReadiness ??
      (await import("./photo-readiness-mediapipe")).analyzePhotoReadiness;
    readiness = await analyze(blob);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new PhotoProcessingError(
      "readiness-unavailable",
      "This browser could not check that your face is clearly visible. Try again or use a current Chrome or Safari browser.",
    );
  }
  if (!readiness.ready) {
    throw new PhotoProcessingError("readiness-failed", readiness.message);
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[drape-room:photo] Local photo preparation complete", {
      source: {
        width: source.width,
        height: source.height,
        bytes: source.sourceBytes,
      },
      output: {
        width: dimensions.width,
        height: dimensions.height,
        bytes: blob.size,
      },
      initialQuality: 0.92,
      readinessPolicyVersion: readiness.policyVersion,
    });
  }

  return {
    blob,
    mimeType: "image/jpeg",
    byteSize: blob.size,
    digest: await sha256Hex(blob),
    width: dimensions.width,
    height: dimensions.height,
    sourceBytes: source.sourceBytes,
    sourceWidth: source.width,
    sourceHeight: source.height,
    warnings: source.warnings,
    readiness: {
      state: "ready",
      policyVersion: readiness.policyVersion,
      checkedAt: Date.now(),
    },
  };
}

export function getPhotoGuidanceWarnings({
  width,
  height,
}: ImageDimensions): PhotoGuidanceWarning[] {
  const warnings: PhotoGuidanceWarning[] = [];
  if (Math.max(width, height) < 800 || Math.min(width, height) < 480) {
    warnings.push("very-small");
  }
  if (width > height) warnings.push("landscape");
  const aspect = width / height;
  if (aspect > 2.2 || aspect < 0.4) warnings.push("extreme-aspect");
  return warnings;
}

export async function readImageDimensions(
  image: Blob,
): Promise<ImageDimensions> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(image);
      try {
        return validateDimensions(bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      throw new PhotoProcessingError(
        "invalid-image",
        "The browser could not decode that photo.",
      );
    }
  }

  if (
    typeof window === "undefined" ||
    typeof window.Image !== "function" ||
    typeof window.URL?.createObjectURL !== "function"
  ) {
    throw new PhotoProcessingError(
      "browser-unsupported",
      "This browser cannot safely prepare photos for try-on.",
    );
  }

  const objectUrl = window.URL.createObjectURL(image);
  try {
    return await new Promise<ImageDimensions>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => {
        try {
          resolve(validateDimensions(element.naturalWidth, element.naturalHeight));
        } catch (error) {
          reject(error);
        }
      };
      element.onerror = () =>
        reject(
          new PhotoProcessingError(
            "invalid-image",
            "The browser could not decode that photo.",
          ),
        );
      element.src = objectUrl;
    });
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

function validateDimensions(width: number, height: number): ImageDimensions {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new PhotoProcessingError(
      "invalid-image",
      "That photo has invalid dimensions.",
    );
  }
  return { width, height };
}

function signatureMatches(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    mimeType === "image/webp" &&
    bytes.length >= 12 &&
    decodeAscii(bytes.subarray(0, 4)) === "RIFF" &&
    decodeAscii(bytes.subarray(8, 12)) === "WEBP"
  );
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return decodeAscii(bytes.subarray(0, 5)) === "%PDF-";
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return text.startsWith("<svg") || /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/.test(text);
}

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}
