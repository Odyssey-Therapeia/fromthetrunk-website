"use client";

/**
 * Keeps every open tab looking at the same bag.
 *
 * The storage event is only an opaque invalidation bell. It contains no cart
 * membership, account identifier, or reservation proof. The receiving tab
 * asks its authenticated server cart for the truth.
 *
 * The `storage` event only fires in the tabs that did not write, which is
 * exactly the audience that needs to know.
 *
 * It no longer rehydrates the device-level guest wishlist. Nothing renders
 * that list, and it belongs to the browser rather than any account.
 */

import { useEffect } from "react";

import { useServerCart } from "@/lib/commerce/use-server-cart";
import {
  CART_TAB_SYNC_KEY,
  isCartTabSignal,
} from "@/lib/commerce/cart-tab-bus";

export function CartTabSync() {
  const { isAuthenticated, refresh, userId } = useServerCart();

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CART_TAB_SYNC_KEY) return;
      if (isAuthenticated && userId && isCartTabSignal(event.newValue)) {
        void refresh();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [isAuthenticated, refresh, userId]);

  return null;
}
