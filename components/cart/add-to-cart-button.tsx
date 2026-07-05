"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trackWebsiteMetric } from "@/lib/analytics/client";
import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import {
  getSelectedSizeLabel,
  normalizeBlouseSize,
  type SelectedOptions,
} from "@/lib/catalog/blouse-size-chart";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useLiveProductStock } from "@/lib/realtime/use-live-product-stock";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product, StockStatus } from "@/types/domain";

interface AddToCartButtonProps {
  product: Product;
  /**
   * P4-05: optional flag-gated override for the initial stock status.
   * When isInventoryV2() is ON, the PDP passes effectiveStockStatus (derived
   * from quantity_available + active reservations) so the button's buyability
   * reflects v2 availability, not the raw stockStatus column.
   * When absent (flag OFF), falls back to product.stockStatus — byte-identical
   * to the pre-P4-05 behavior.
   */
  initialStatus?: StockStatus;
  onMissingRequiredOption?: () => void;
  requiresBlouseSize?: boolean;
  selectedOptions?: SelectedOptions;
}

const stockLabels: Record<StockStatus, string> = {
  available: "Add to Bag",
  reserved: "Reserved",
  sold: "Sold",
};

export function AddToCartButton({
  product,
  initialStatus,
  onMissingRequiredOption,
  requiresBlouseSize,
  selectedOptions,
}: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const existingItem = useCartStore((state) =>
    state.items.find((item) => item.id === product.id),
  );
  const updateSelectedOptions = useCartStore(
    (state) => state.updateSelectedOptions,
  );
  const [added, setAdded] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const image = resolveMediaURL(product.images?.[0]) ?? "";
  const inCart = Boolean(existingItem);
  const selectedSize = normalizeBlouseSize(selectedOptions?.size);
  const existingSize = normalizeBlouseSize(existingItem?.selectedOptions?.size);
  const canUpdateSelectedOptions =
    Boolean(requiresBlouseSize && inCart && selectedSize && selectedSize !== existingSize);

  const { stockStatus } = useLiveProductStock({
    // P4-05: use effectiveStockStatus when flag ON; fall back to product.stockStatus (flag OFF).
    initialStatus: (initialStatus ?? product.stockStatus) as StockStatus,
    productId: product.id,
    productSlug: product.slug,
  });
  const canAttemptAdd = stockStatus === "available" && !inCart;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  const handleAddToCart = async () => {
    if (requiresBlouseSize && !selectedSize) {
      onMissingRequiredOption?.();
      return;
    }

    if (canUpdateSelectedOptions && selectedSize) {
      updateSelectedOptions(product.id, { size: selectedSize });
      setAdded(true);
      toast.success(`Updated blouse size to ${selectedSize}`);
      return;
    }

    if (!canAttemptAdd || isReserving) return;

    setIsReserving(true);
    try {
      const response = await fetch("/api/v2/cart/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
        reservationToken?: string;
        reservedUntil?: string;
      } | null;

      if (!response.ok) {
        toast.error(getAvailabilityErrorMessage(payload?.code, payload?.message));
        return;
      }

      addItem({
        id: product.id,
        name: product.name,
        price: product.pricePaise / 100,
        image,
        slug: product.slug,
        detailsFabric: product.detailsFabric ?? null,
        reservationToken: payload?.reservationToken ?? null,
        reservedUntil: payload?.reservedUntil ?? null,
        ...(selectedSize ? { selectedOptions: { size: selectedSize } } : {}),
      });
      trackWebsiteMetric("add_to_cart", {
        pricePaise: product.pricePaise,
        productId: product.id,
        slug: product.slug,
        source: "pdp",
        stockStatus,
      });
      setAdded(true);
      toast.success(
        selectedSize
          ? `Added to bag, Size ${selectedSize}`
          : `${product.name} added to your bag`,
      );
    } finally {
      setIsReserving(false);
    }
  };

  if (stockStatus === "sold") {
    return (
      <Button className="w-full rounded-full py-6" disabled>
        Sold
      </Button>
    );
  }

  if (stockStatus === "reserved" && !inCart) {
    return (
      <Button className="w-full rounded-full py-6" disabled>
        Reserved by another buyer
      </Button>
    );
  }

  if (inCart && !canUpdateSelectedOptions) {
    const sizeLabel = getSelectedSizeLabel(existingItem?.selectedOptions);
    return (
      <Button className="w-full rounded-full py-6" disabled>
        {sizeLabel ? `${sizeLabel} in your bag` : "Already in your bag"}
      </Button>
    );
  }

  return (
    <Button
      className="w-full rounded-full py-6 text-[#FDF7F1]"
      disabled={
        isReserving ||
        (stockStatus !== "available" && !canUpdateSelectedOptions) ||
        (inCart && !canUpdateSelectedOptions)
      }
      onClick={handleAddToCart}
    >
      {canUpdateSelectedOptions
        ? "Update Size"
        : isReserving
          ? "Reserving..."
          : added
            ? "Added to Bag"
            : stockLabels[stockStatus]}
    </Button>
  );
}
