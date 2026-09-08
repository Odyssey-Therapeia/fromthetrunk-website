"use client";

import { useCallback, useRef, useState } from "react";

import { ProductGallery } from "@/components/product/product-gallery";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { DrapeLaunchProductEntry } from "./drape-launch-product-entry";

export interface DrapeLaunchGallerySlotProps {
  alt: string;
  images: string[];
  imageAlts?: string[];
  thumbnailImages?: string[];
  productName?: string;
  /** Present only when the saree is Drape Room eligible. */
  drapeProduct: DrapeSaree | null;
}

/**
 * The product gallery plus the Drape Room launch entry directly beneath it.
 *
 * This is the one place that knows how many DISTINCT gallery images have been
 * viewed: the gallery reports its settled index, and a Set de-duplicates, so
 * paging back and forth between the same two photos counts as two views, not
 * ten. When the saree is not eligible this renders the plain gallery and adds
 * nothing to the page.
 */
export function DrapeLaunchGallerySlot({
  drapeProduct,
  ...galleryProps
}: DrapeLaunchGallerySlotProps) {
  const viewedRef = useRef<Set<number>>(new Set());
  const [viewedGalleryCount, setViewedGalleryCount] = useState(0);

  const handleActiveIndexChange = useCallback((index: number) => {
    if (viewedRef.current.has(index)) return;
    viewedRef.current.add(index);
    setViewedGalleryCount(viewedRef.current.size);
  }, []);

  if (!drapeProduct) return <ProductGallery {...galleryProps} />;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ProductGallery
        {...galleryProps}
        onActiveIndexChange={handleActiveIndexChange}
      />
      <DrapeLaunchProductEntry
        product={drapeProduct}
        viewedGalleryCount={viewedGalleryCount}
        className="self-start"
      />
    </div>
  );
}
