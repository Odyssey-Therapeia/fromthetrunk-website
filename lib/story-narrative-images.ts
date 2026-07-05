import { existsSync } from "fs";
import { join } from "path";

import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/domain";

export const STORY_NARRATIVE_IMAGE_COUNT = 5;
export const STORY_NARRATIVE_FALLBACK_IMAGE = "/footer/ftt-trunk-saree.webp";

function isUsableNarrativeImage(src: string): boolean {
  if (!src.startsWith("/dev-uploads/")) return true;

  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}

export function selectStoryNarrativeImages(
  products: Product[],
  count = STORY_NARRATIVE_IMAGE_COUNT,
): string[] {
  const images = products
    .map((product) => resolveMediaURL(product.images?.[0]))
    .filter((image): image is string => Boolean(image))
    .filter(isUsableNarrativeImage)
    .slice(0, count);

  while (images.length < count) {
    images.push(STORY_NARRATIVE_FALLBACK_IMAGE);
  }

  return images;
}
