"use client";

/**
 * Cross-provider wishlist synchronisation.
 *
 * The header commerce island, the route-level product buttons, and the Drape
 * Room each mount their own QueryClient (see components/providers.tsx). A
 * `queryClient.invalidateQueries` call inside one provider is invisible to the
 * others, so a save made on a product card would leave the header badge stale.
 *
 * A DOM CustomEvent is the one channel every provider shares. Mutations
 * announce themselves here; listeners refetch their own copy of the count.
 * There is no polling and no duplicated wishlist API logic.
 */

export const WISHLIST_UPDATED_EVENT = "ftt:wishlist-updated";

export type WishlistUpdatedDetail = {
  /** "add" | "remove" | "merge" — advisory only; listeners just refetch. */
  reason: "add" | "remove" | "merge";
  productId?: string;
};

export function dispatchWishlistUpdated(detail: WishlistUpdatedDetail): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<WishlistUpdatedDetail>(WISHLIST_UPDATED_EVENT, { detail }),
  );
}

/** Subscribe to wishlist mutations from any provider tree. Returns an unsubscribe. */
export function subscribeToWishlistUpdated(
  handler: (detail: WishlistUpdatedDetail | undefined) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const listener = (event: Event) => {
    handler((event as CustomEvent<WishlistUpdatedDetail>).detail);
  };

  window.addEventListener(WISHLIST_UPDATED_EVENT, listener);
  return () => window.removeEventListener(WISHLIST_UPDATED_EVENT, listener);
}
