/**
 * P5-06: Per-product OG data extraction — pure function, no side effects.
 *
 * Derives the title, price (in rupees), and first image URL from a product
 * for use in the PDP opengraph-image route (app/(site)/collection/[slug]/
 * opengraph-image.tsx). Tested in tests/unit/aeo-schema-completeness.test.ts.
 *
 * Uses the fail-closed Phase 2A SEO image resolver and the shared
 * pricePaise / 100 convention.
 */

import type { Product } from "@/types/domain";
import { resolvePrimaryCurrentProductImage } from "@/lib/media/product-image-resolver";
import { getProductDisplayDetails } from "@/lib/products/display-details";
import { seoImageMetadata } from "@/lib/seo/metadata";

export type PdpOgData = {
  /** The OG title: product name + fabric shorthand. */
  title: string;
  /** Price in rupees (pricePaise / 100). */
  priceRupees: number;
  /** Absolute URL of the first product image, or null if none. */
  imageUrl: string | null;
};

/**
 * Extract the per-product OG data needed by the opengraph-image route.
 * Pure function — no DB calls, no async.
 */
export function extractPdpOgData(product: Product): PdpOgData {
  const displayDetails = getProductDisplayDetails(product);
  const { image } = resolvePrimaryCurrentProductImage(product, "social");
  const imageUrl = seoImageMetadata(image ?? undefined).url;

  const title = `${product.name}: ${displayDetails.fabric}`;

  return {
    title,
    priceRupees: product.pricePaise / 100,
    imageUrl,
  };
}
