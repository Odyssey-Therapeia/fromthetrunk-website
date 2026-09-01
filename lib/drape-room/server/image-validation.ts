import sharp, { type Metadata } from "sharp";

import {
  SUPPORTED_IMAGE_MIME_TYPES,
  type BinaryImage,
  type SupportedImageMimeType,
} from "@/lib/drape-room/server/provider";
import {
  MAX_CUSTOMER_SOURCE_BYTES,
  MAX_NORMALIZED_REFERENCE_BYTES,
  MAX_PRODUCT_SOURCE_BYTES,
  MAX_TRYON_IMAGE_EDGE,
  MAX_TRYON_IMAGE_PIXELS,
} from "@/lib/drape-room/server/image-limits";

export {
  MAX_CUSTOMER_SOURCE_BYTES,
  MAX_NORMALIZED_REFERENCE_BYTES,
  MAX_PRODUCT_SOURCE_BYTES,
  MAX_TRYON_IMAGE_EDGE,
  MAX_TRYON_IMAGE_PIXELS,
};
export const MAX_PROVIDER_IMAGE_BYTES = 12 * 1_024 * 1_024;
export const MAX_BROWSER_OUTPUT_BYTES = 3_800_000;
export const MAX_IMAGE_PIXELS = MAX_TRYON_IMAGE_PIXELS;
export const MAX_IMAGE_EDGE = MAX_TRYON_IMAGE_EDGE;
export const MIN_REFERENCE_EDGE = 256;
export const MIN_PROVIDER_OUTPUT_EDGE = 512;
export const NORMALIZED_REFERENCE_MAX_EDGE = 1_536;
export const NORMALIZED_OUTPUT_WIDTH = 1_152;
export const NORMALIZED_OUTPUT_HEIGHT = 1_536;

export type ImageValidationErrorCode =
  | "dimensions_out_of_range"
  | "empty_image"
  | "image_too_large"
  | "invalid_encoding"
  | "mime_mismatch"
  | "multiple_frames"
  | "output_over_budget"
  | "pixel_limit_exceeded"
  | "unsupported_mime";

export class ImageValidationError extends Error {
  constructor(readonly code: ImageValidationErrorCode) {
    super(code);
    this.name = "ImageValidationError";
  }
}

export type ValidatedBinaryImage = BinaryImage & {
  width: number;
  height: number;
};

type RasterLimits = {
  maxBytes: number;
  minEdge: number;
};

const REFERENCE_QUALITY_STEPS = [92, 88, 84, 80, 76, 72, 68, 64] as const;
const OUTPUT_QUALITY_STEPS = [90, 86, 82, 78, 74, 70, 66, 62] as const;

function bufferFrom(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

export function detectImageMime(
  bytes: Uint8Array,
): SupportedImageMimeType | null {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function metadataMime(metadata: Metadata): SupportedImageMimeType | null {
  if (metadata.format === "jpeg") return "image/jpeg";
  if (metadata.format === "png") return "image/png";
  if (metadata.format === "webp") return "image/webp";
  return null;
}

async function inspectRaster(
  image: BinaryImage,
  limits: RasterLimits,
): Promise<{ body: Buffer; height: number; width: number }> {
  if (!image.bytes.byteLength) {
    throw new ImageValidationError("empty_image");
  }
  if (image.bytes.byteLength > limits.maxBytes) {
    throw new ImageValidationError("image_too_large");
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(image.mimeType)) {
    throw new ImageValidationError("unsupported_mime");
  }

  const magicMime = detectImageMime(image.bytes);
  if (!magicMime) throw new ImageValidationError("unsupported_mime");
  if (magicMime !== image.mimeType) {
    throw new ImageValidationError("mime_mismatch");
  }

  const body = bufferFrom(image.bytes);
  let metadata: Metadata;
  try {
    metadata = await sharp(body, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new ImageValidationError("invalid_encoding");
  }

  if (metadataMime(metadata) !== magicMime) {
    throw new ImageValidationError("mime_mismatch");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new ImageValidationError("multiple_frames");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < limits.minEdge ||
    height < limits.minEdge ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE
  ) {
    throw new ImageValidationError("dimensions_out_of_range");
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new ImageValidationError("pixel_limit_exceeded");
  }

  return { body, height, width };
}

async function encodeReference(
  source: Buffer,
  quality: number,
): Promise<ValidatedBinaryImage> {
  const { data, info } = await sharp(source, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      fit: "inside",
      height: NORMALIZED_REFERENCE_MAX_EDGE,
      width: NORMALIZED_REFERENCE_MAX_EDGE,
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .flatten({ background: "#ffffff" })
    .jpeg({
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
      quality,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: Uint8Array.from(data),
    height: info.height,
    mimeType: "image/jpeg",
    width: info.width,
  };
}

/** Validates, auto-orients, strips metadata, resizes, and re-encodes a reference. */
export async function validateAndNormalizeReferenceImage(
  image: BinaryImage,
  options: { maxSourceBytes: number },
): Promise<ValidatedBinaryImage> {
  const inspected = await inspectRaster(image, {
    maxBytes: options.maxSourceBytes,
    minEdge: MIN_REFERENCE_EDGE,
  });

  try {
    for (const quality of REFERENCE_QUALITY_STEPS) {
      const candidate = await encodeReference(inspected.body, quality);
      if (candidate.bytes.byteLength <= MAX_NORMALIZED_REFERENCE_BYTES) {
        return candidate;
      }
    }
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("invalid_encoding");
  }
  throw new ImageValidationError("output_over_budget");
}

async function encodeOutput(
  source: Buffer,
  quality: number,
): Promise<ValidatedBinaryImage> {
  const { data, info } = await sharp(source, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      background: "#ffffff",
      fit: "contain",
      height: NORMALIZED_OUTPUT_HEIGHT,
      width: NORMALIZED_OUTPUT_WIDTH,
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .flatten({ background: "#ffffff" })
    .jpeg({ chromaSubsampling: "4:4:4", mozjpeg: true, quality })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: Uint8Array.from(data),
    height: info.height,
    mimeType: "image/jpeg",
    width: info.width,
  };
}

/**
 * Treats provider bytes as untrusted, then emits a single-frame metadata-free
 * JPEG small enough to stay below Vercel's response-body ceiling.
 */
export async function validateAndNormalizeProviderImage(
  image: BinaryImage,
): Promise<ValidatedBinaryImage> {
  const inspected = await inspectRaster(image, {
    maxBytes: MAX_PROVIDER_IMAGE_BYTES,
    minEdge: MIN_PROVIDER_OUTPUT_EDGE,
  });

  try {
    for (const quality of OUTPUT_QUALITY_STEPS) {
      const candidate = await encodeOutput(inspected.body, quality);
      if (
        candidate.height === NORMALIZED_OUTPUT_HEIGHT &&
        candidate.width === NORMALIZED_OUTPUT_WIDTH &&
        candidate.bytes.byteLength <= MAX_BROWSER_OUTPUT_BYTES
      ) {
        return candidate;
      }
    }
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("invalid_encoding");
  }
  throw new ImageValidationError("output_over_budget");
}
