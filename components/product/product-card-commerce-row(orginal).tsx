"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useLiveProductStock } from "@/lib/realtime/use-live-product-stock";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import type { Product, StockStatus } from "@/types/domain";

type ProductWithCommerceMeta = Product & {
  rating?: number | null;
  ratingAverage?: number | null;
  reviewCount?: number | null;
  ratingCount?: number | null;
  ratingsCount?: number | null;
};

type AddState = "idle" | "added";

export function ProductCardCommerceRow({
  product,
  className,
}: {
  product: ProductWithCommerceMeta;
  className?: string;
}) {
  const [state, setState] = useState<AddState>("idle");
  const addItem = useCartStore((store) => store.addItem);
  const hasItem = useCartStore((store) => store.hasItem);
  const inCart = hasItem(product.id);
  const image = resolveMediaURL(product.images?.[0]) ?? "";
  const { stockStatus } = useLiveProductStock({
    initialStatus: product.stockStatus as StockStatus,
    productId: product.id,
    productSlug: product.slug,
  });
  const isSold = stockStatus === "sold";
  const isReserved = stockStatus === "reserved";
  const isUnavailable = isSold || isReserved;
  const rating = normalizeRating(
    product.ratingAverage ??
      product.rating ??
      metadataNumber(product.metadata, "ratingAverage") ??
      metadataNumber(product.metadata, "rating"),
  );
  const reviewCount = firstNumber(
    product.reviewCount,
    product.ratingCount,
    product.ratingsCount,
    metadataNumber(product.metadata, "reviewCount"),
    metadataNumber(product.metadata, "ratingCount"),
    metadataNumber(product.metadata, "ratingsCount"),
  );

  useEffect(() => {
    if (state !== "added") return;
    const timer = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  const buttonLabel = isSold
    ? "Sold"
    : isReserved
      ? "Reserved"
      : inCart
        ? "In bag"
        : state === "added"
          ? "Added"
          : "+ Cart";

  return (
    <div
      className={cn(
        "mt-3 flex items-center justify-between gap-2 border-t border-(--ftt-border)/80 pt-3",
        className,
      )}
    >
      <div className="min-w-0 text-xs font-medium text-ftt-muted">
        <div className="flex items-center gap-1.5">
          <span className="text-ftt-gold" aria-hidden="true">
            ★
          </span>
          {rating !== null ? (
            <>
              <span className="text-ftt-navy">
                {rating.toFixed(1)}
              </span>
              {typeof reviewCount === "number" && reviewCount > 0 ? (
                <span className="truncate text-ftt-muted">
                  · {reviewCount.toLocaleString("en-IN")}
                </span>
              ) : null}
            </>
          ) : (
            <span className="truncate text-ftt-navy">
              Verified
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={isUnavailable || inCart}
        aria-live="polite"
        onClick={() => {
          if (isUnavailable || inCart) return;

          addItem({
            id: product.id,
            name: product.name,
            price: product.pricePaise / 100,
            image,
          });
          setState("added");
          toast.success(`${product.name} added to your bag`);
        }}
        className={cn(
          "inline-flex h-9 min-w-20 items-center justify-center rounded-full px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ftt-ivory @sm:min-w-22 @sm:px-4 @sm:text-sm",
          isUnavailable
            ? "cursor-not-allowed bg-ftt-burgundy text-ftt-ivory opacity-90"
            : inCart || state === "added"
              ? "border border-ftt-navy bg-transparent text-ftt-navy"
              : "bg-ftt-navy text-ftt-ivory shadow-[0_8px_20px_rgba(20,29,70,0.16)] hover:bg-ftt-midnight",
        )}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function normalizeRating(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(5, value));
}

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function metadataNumber(
  metadata: Product["metadata"],
  key: string,
): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
