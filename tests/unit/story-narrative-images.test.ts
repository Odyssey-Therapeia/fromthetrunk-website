import { describe, expect, it } from "vitest";

import {
  STORY_NARRATIVE_FALLBACK_IMAGES,
  selectStoryNarrativeImages,
} from "@/lib/story-narrative-images";
import type { Product } from "@/types/domain";

const makeProduct = (image?: unknown) =>
  ({
    images: image ? [{ media: image }] : [],
  }) as Product;

describe("selectStoryNarrativeImages", () => {
  const safeMedia = (filename: string) => ({
    url: `https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/${filename}`,
    filesize: 300000,
    height: 1800,
    metadata: { source: "vercel-blob" },
    mimeType: "image/webp",
    width: 1400,
  });

  it("skips products without valid images before truncating", () => {
    const images = selectStoryNarrativeImages([
      makeProduct(null),
      makeProduct(safeMedia("first.webp")),
      makeProduct(undefined),
      makeProduct(safeMedia("second.webp")),
      makeProduct(safeMedia("third.webp")),
      makeProduct(safeMedia("fourth.webp")),
      makeProduct(safeMedia("fifth.webp")),
    ]);

    expect(images).toEqual([
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/first.webp",
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/second.webp",
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/third.webp",
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/fourth.webp",
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/fifth.webp",
    ]);
  });

  it("pads with the fallback image when there are not enough valid URLs", () => {
    const images = selectStoryNarrativeImages([
      makeProduct(safeMedia("one.webp")),
      makeProduct(null),
      makeProduct(safeMedia("two.webp")),
    ]);

    expect(images).toEqual([
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/one.webp",
      "https://njufw8f4mlcjsl7g.public.blob.vercel-storage.com/media/two.webp",
      ...STORY_NARRATIVE_FALLBACK_IMAGES.slice(2, 5),
    ]);
  });
});
