import sharp from "sharp";

import {
  MAX_PRODUCT_REFERENCE_PIXELS,
  PRODUCT_REFERENCE_WORKING_MAX_HEIGHT,
  PRODUCT_REFERENCE_WORKING_MAX_WIDTH,
} from "@/lib/drape-room/server/image-limits";

/**
 * Catalogue originals are shot at camera resolution — 70 MP and 12 MB is
 * ordinary for this shop. Nothing downstream wants that: the provider is fed a
 * 1536px reference. This decodes the original once, straight down to a bounded
 * working image, so the rest of the pipeline sees a normal-sized photo.
 *
 * Sharp resizes JPEG during decode (libjpeg shrink-on-load), so the full frame
 * is never materialised at source resolution.
 */
export async function toReferenceWorkingImage(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mimeType: "image/jpeg" }> {
  const output = await sharp(Buffer.from(bytes), {
    failOn: "error",
    limitInputPixels: MAX_PRODUCT_REFERENCE_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      fit: "inside",
      height: PRODUCT_REFERENCE_WORKING_MAX_HEIGHT,
      width: PRODUCT_REFERENCE_WORKING_MAX_WIDTH,
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .flatten({ background: "#ffffff" })
    .jpeg({ chromaSubsampling: "4:4:4", mozjpeg: true, quality: 94 })
    .toBuffer();

  return { bytes: Uint8Array.from(output), mimeType: "image/jpeg" };
}

/**
 * Working images keyed by the reference version, which is content-addressed
 * (media id, source hash, dimensions, byte size) — so an entry can never be
 * served for different bytes than it was built from.
 *
 * This is a warm-instance cache, nothing more. It exists because the same
 * saree is draped by many shoppers, and every hit saves both the original's
 * download and its decode. A cold instance simply rebuilds.
 *
 * Product photography only: customer photos never reach this module.
 */
const MAX_CACHED_WORKING_IMAGES = 4;

const workingImageCache = new Map<string, Uint8Array>();

export function getCachedWorkingImage(version: string): Uint8Array | null {
  const cached = workingImageCache.get(version);
  if (!cached) return null;

  // Refresh recency so the popular sarees are the ones that survive.
  workingImageCache.delete(version);
  workingImageCache.set(version, cached);
  return cached;
}

export function cacheWorkingImage(version: string, bytes: Uint8Array): void {
  workingImageCache.set(version, bytes);
  while (workingImageCache.size > MAX_CACHED_WORKING_IMAGES) {
    const oldest = workingImageCache.keys().next();
    if (oldest.done) break;
    workingImageCache.delete(oldest.value);
  }
}

/** Test seam. */
export function clearWorkingImageCache(): void {
  workingImageCache.clear();
}
