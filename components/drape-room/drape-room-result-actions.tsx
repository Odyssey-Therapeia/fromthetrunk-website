"use client";

import type { ReactNode } from "react";
import { Download, Heart, ShoppingBag, Store } from "lucide-react";

import { DrapeRoomActionTile } from "./drape-room-action-tile";

export interface DrapeRoomResultActionsProps {
  isBusy?: boolean;
  wishlistControl?: ReactNode;
  addToCartControl?: ReactNode;
  onSave: () => void;
  onVisitProduct: () => void;
  onWishlist?: () => void;
  onAddToCart?: () => void;
}

export function DrapeRoomResultActions({
  isBusy = false,
  wishlistControl,
  addToCartControl,
  onSave,
  onVisitProduct,
  onWishlist,
  onAddToCart,
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
    </div>
  );
}
