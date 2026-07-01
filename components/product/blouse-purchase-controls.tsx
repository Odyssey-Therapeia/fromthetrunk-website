"use client";

import { useRef, useState } from "react";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { BlouseSizeSelector } from "@/components/product/blouse-size-selector";
import { WishlistButton } from "@/components/product/wishlist-button";
import {
  getAvailableBlouseSizes,
  type BlouseSize,
} from "@/lib/catalog/blouse-size-chart";
import type { StockStatus } from "@/types/domain";
import type { Product } from "@/types/domain";

type BlousePurchaseControlsProps = {
  initialStatus?: StockStatus;
  product: Product;
};

const REQUIRED_SIZE_MESSAGE =
  "Please select a blouse size before adding to bag.";

export function BlousePurchaseControls({
  initialStatus,
  product,
}: BlousePurchaseControlsProps) {
  const [selectedSize, setSelectedSize] = useState<BlouseSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const availableSizes = getAvailableBlouseSizes(product);

  const focusSelector = () => {
    setError(REQUIRED_SIZE_MESSAGE);
    selectorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    selectorRef.current
      ?.querySelector<HTMLButtonElement>("[data-size-option]")
      ?.focus({ preventScroll: true });
  };

  return (
    <div className="flex flex-col gap-3">
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
          className="h-11 w-11 shrink-0 border border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C] hover:bg-[#601D1C] hover:text-[#FDF7F1]"
        />
      </div>
    </div>
  );
}
