"use client";

import { useRef, useState } from "react";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { BlouseSizeSelector } from "@/components/product/blouse-size-selector";
import { WishlistButton } from "@/components/product/wishlist-button";
import { Button } from "@/components/ui/button";
import {
  getAvailableBlouseSizes,
  type BlouseSize,
} from "@/lib/catalog/blouse-size-chart";
import type { ViewerProductDisplayState } from "@/lib/commerce/viewer-state";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import type { StockStatus } from "@/types/domain";
import type { Product } from "@/types/domain";

type BlousePurchaseControlsProps = {
  initialStatus?: StockStatus;
  product: Product;
};

const REQUIRED_SIZE_MESSAGE =
  "Please select a blouse size before adding to bag.";

/** The server-rendered status as a seed, replaced by the live verdict. */
const seedViewerState = (
  status: StockStatus | undefined,
): ViewerProductDisplayState =>
  status === "sold"
    ? "sold"
    : status === "reserved"
      ? "reserved_by_other"
      : "available";

export function BlousePurchaseControls({
  initialStatus,
  product,
}: BlousePurchaseControlsProps) {
  const [selectedSize, setSelectedSize] = useState<BlouseSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const availableSizes = getAvailableBlouseSizes(product);
  const seededViewerState = seedViewerState(
    initialStatus ?? product.stockStatus,
  );
  const viewer = useCollectionStock(product.id, {
    reservedUntil: null,
    state: seededViewerState,
  });
  /*
   * The selector stays mounted while a verdict is still loading, so the
   * purchase block does not jump twice for a signed-in shopper. It goes only
   * for a blouse nobody can size now: sold, mid-payment, or held by another
   * shopper.
   */
  const canSelectSize =
    viewer.state !== "sold" &&
    viewer.state !== "payment_pending" &&
    viewer.state !== "reserved_by_other";

  const focusSelector = () => {
    setError(REQUIRED_SIZE_MESSAGE);
    selectorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    selectorRef.current
      ?.querySelector<HTMLButtonElement>("[data-size-option]")
      ?.focus({ preventScroll: true });
  };

  return (
    <div className="flex flex-col gap-3">
      {canSelectSize ? (
        <BlouseSizeSelector
          ref={selectorRef}
          availableSizes={availableSizes}
          error={error}
          selectedSize={selectedSize}
          onChange={(size) => {
            setSelectedSize(size);
            setError(null);
          }}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AddToCartButton
            product={product}
            initialStatus={initialStatus}
            requiresBlouseSize
            selectedOptions={selectedSize ? { size: selectedSize } : undefined}
            onMissingRequiredOption={focusSelector}
          />
        </div>
        <WishlistButton
          productId={product.id}
          productName={product.name}
          initialViewerState={seededViewerState}
          className="h-11 w-11 shrink-0 border border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C] hover:bg-[#601D1C] hover:text-[#FDF7F1]"
        />
      </div>
    </div>
  );
}

/**
 * The blouse action in the product page's mobile sticky bar.
 *
 * "Select size" jumps to the selector, which only an available blouse still
 * needs. Every other verdict gets the main button's own answer: the shopper's
 * own line reads In bag with its trash, and a sold blouse never offers a live
 * purchase control down here.
 */
export function BlouseStickyAction({
  initialStatus,
  product,
}: BlousePurchaseControlsProps) {
  const viewer = useCollectionStock(product.id, {
    reservedUntil: null,
    state: seedViewerState(initialStatus ?? product.stockStatus),
  });

  if (viewer.state === "available") {
    return (
      <Button asChild className="w-full rounded-full py-6">
        <a href="#blouse-size-selector">Select size</a>
      </Button>
    );
  }

  return (
    <AddToCartButton
      product={product}
      initialStatus={initialStatus}
      requiresBlouseSize
    />
  );
}
