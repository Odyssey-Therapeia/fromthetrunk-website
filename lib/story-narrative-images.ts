import { existsSync } from "fs";
import { join } from "path";

import { resolvePrimaryCurrentProductImage } from "@/lib/media/product-image-resolver";
import type { Product } from "@/types/domain";

export const STORY_NARRATIVE_IMAGE_COUNT = 5;
export const STORY_NARRATIVE_FALLBACK_IMAGES = [
  "/category/optimized-v1/silk-v1.webp",
  "/category/optimized-v1/georgette-v1.webp",
  "/category/optimized-v1/chiffon-v1.webp",
  "/category/optimized-v1/kanjeevaram-v1.webp",
  "/category/optimized-v1/cotton-v1.webp",
] as const;
export const STORY_NARRATIVE_FALLBACK_IMAGE =
  STORY_NARRATIVE_FALLBACK_IMAGES[0];

function isUsableNarrativeImage(src: string): boolean {
  if (!src.startsWith("/dev-uploads/")) return true;

  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}

export function selectStoryNarrativeImages(
  products: Product[],
  count = STORY_NARRATIVE_IMAGE_COUNT,
): string[] {
  const images = products
    .map(
      (product) =>
        resolvePrimaryCurrentProductImage(product, "card").image?.url ?? null,
    )
    .filter((image): image is string => Boolean(image))
    .filter(isUsableNarrativeImage)
    .slice(0, count);

  while (images.length < count) {
    images.push(
      STORY_NARRATIVE_FALLBACK_IMAGES[
        images.length % STORY_NARRATIVE_FALLBACK_IMAGES.length
      ],
    );
  }

  return images;
}
