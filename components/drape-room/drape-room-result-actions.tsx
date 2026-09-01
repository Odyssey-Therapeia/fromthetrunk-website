"use client";

import type { ReactNode } from "react";
import { Download, Heart, RefreshCw, ShoppingBag, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrapeRoomActionTile } from "./drape-room-action-tile";

export interface DrapeRoomResultActionsProps {
  isBusy?: boolean;
  generationDisabled?: boolean;
  remainingGenerations?: 0 | 1 | 2 | 3;
  wishlistControl?: ReactNode;
  addToCartControl?: ReactNode;
  onSave: () => void;
  onVisitProduct: () => void;
  onWishlist?: () => void;
  onAddToCart?: () => void;
  onRegenerate: () => void;
}

export function DrapeRoomResultActions({
  isBusy = false,
  generationDisabled = false,
  remainingGenerations = 3,
  wishlistControl,
  addToCartControl,
  onSave,
  onVisitProduct,
  onWishlist,
  onAddToCart,
  onRegenerate,
}: DrapeRoomResultActionsProps) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 min-w-0 border-t border-ftt-border bg-ftt-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur @sm:-mx-5 @sm:px-5 @3xl:static @3xl:mx-0 @3xl:rounded-2xl @3xl:border @3xl:px-3 @3xl:pb-3">
      <div
        role="group"
        aria-label="Drape Room result actions"
        className="grid w-full min-w-0 max-w-full auto-rows-fr grid-cols-2 gap-2 @3xl:grid-cols-4"
      >
        <div data-drape-primary-action="save" className="flex h-full min-w-0">
          <DrapeRoomActionTile
            icon={<Download aria-hidden="true" />}
            label="Save image"
            onClick={onSave}
          />
        </div>
        <div data-drape-primary-action="visit-product" className="flex h-full min-w-0">
          <DrapeRoomActionTile
            icon={<Store aria-hidden="true" />}
            label="Visit product"
            onClick={onVisitProduct}
          />
        </div>
        <div data-drape-primary-action="wishlist" className="flex h-full min-w-0">
          {wishlistControl ?? (
            <DrapeRoomActionTile
              disabled={isBusy || !onWishlist}
              onClick={onWishlist}
              icon={<Heart aria-hidden="true" />}
              label="Wishlist"
            />
          )}
        </div>
        <div data-drape-primary-action="add-to-cart" className="flex h-full min-w-0">
          {addToCartControl ?? (
            <DrapeRoomActionTile
              disabled={isBusy || !onAddToCart}
              onClick={onAddToCart}
              icon={<ShoppingBag aria-hidden="true" />}
              label="Add to bag"
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2 rounded-2xl border border-ftt-border bg-ftt-ivory p-2 @sm:flex-row @sm:items-center">
        <Button
          data-drape-regenerate
          type="button"
          variant="outline"
          disabled={isBusy || generationDisabled || remainingGenerations === 0}
          onClick={onRegenerate}
          className="min-h-11 min-w-0 flex-1 rounded-xl border-ftt-gold/35 bg-ftt-card text-ftt-burgundy shadow-none hover:bg-ftt-gold/10 hover:text-ftt-burgundy"
        >
          <RefreshCw className={isBusy ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
          Regenerate preview
        </Button>
        <p className="shrink-0 px-2 text-center text-[11px] font-semibold text-ftt-burgundy/70">
          {remainingGenerations === 0
            ? "Daily limit reached · available tomorrow"
            : `${remainingGenerations} generation${remainingGenerations === 1 ? "" : "s"} left today`}
        </p>
      </div>
    </div>
  );
}
