/** Browser-supplied customer photos remain tightly bounded at ingress. */
export const MAX_CUSTOMER_SOURCE_BYTES = 2_000_000;

/**
 * Product references are resolved only from FTT-owned catalogue metadata and
 * approved media hosts. A larger fetch ceiling lets legacy originals reach
 * Sharp; only the normalized result is passed to an image provider.
 */
export const MAX_PRODUCT_SOURCE_BYTES = 16_000_000;

/**
 * Browser-supplied images must never decode above these limits. They bound the
 * customer photo and every provider output.
 */
export const MAX_TRYON_IMAGE_PIXELS = 24_000_000;
export const MAX_TRYON_IMAGE_EDGE = 8_192;

/**
 * Catalogue originals get a higher ceiling than browser-supplied images, and
 * for one reason: they are FTT-owned, resolved from our own metadata, and
 * downscaled to a bounded working image before anything else touches them —
 * so their pixel count is a decode budget, not a delivery size.
 *
 * These match the reviewed offline backfill policy, so a photo the backfill
 * would accept is a photo the Drape Room can drape without one.
 */
export const MAX_PRODUCT_REFERENCE_PIXELS = 100_000_000;
export const MAX_PRODUCT_REFERENCE_EDGE = 12_000;

/**
 * Catalogue originals above the browser limits are downscaled to this box
 * before validation, mirroring the derivative pipeline's working source. Large
 * enough to feed the 1536px normalization without softening it.
 */
export const PRODUCT_REFERENCE_WORKING_MAX_WIDTH = 2_400;
export const PRODUCT_REFERENCE_WORKING_MAX_HEIGHT = 3_600;

/** Both provider references must be normalized below this ceiling. */
export const MAX_NORMALIZED_REFERENCE_BYTES = 2_000_000;
