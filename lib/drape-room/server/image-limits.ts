/** Browser-supplied customer photos remain tightly bounded at ingress. */
export const MAX_CUSTOMER_SOURCE_BYTES = 2_000_000;

/**
 * Product references are resolved only from FTT-owned catalogue metadata and
 * approved media hosts. A larger fetch ceiling lets legacy originals reach
 * Sharp; only the normalized result is passed to an image provider.
 */
export const MAX_PRODUCT_SOURCE_BYTES = 16_000_000;

/**
 * Live try-on requests must never decode catalogue originals above these
 * limits. Oversized legacy assets are handled only by the protected offline
 * derivative backfill, then Drape Room consumes the bounded derivative.
 */
export const MAX_TRYON_IMAGE_PIXELS = 24_000_000;
export const MAX_TRYON_IMAGE_EDGE = 8_192;

/** Both provider references must be normalized below this ceiling. */
export const MAX_NORMALIZED_REFERENCE_BYTES = 2_000_000;
