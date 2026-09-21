import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getCartTotalsPaise } from "@/lib/cart/cart-totals";
import { getCartReservationExpiresAt } from "@/lib/cart/reservation-policy";
import type { ViewerProductState } from "@/lib/commerce/viewer-state";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  slug?: string;
  /**
   * Catalogue listing price before markdown, in paise (products.original_price_paise).
   * Optional on purpose: carts persisted before this field existed keep working
   * and simply contribute zero to the savings banner. Never synthesise a value.
   */
  originalPricePaise?: null | number;
  detailsFabric?: string | null;
  selectedOptions?: {
    size?: string;
  };
  /** ISO date string — when the server-side reservation expires. */
  reservedUntil?: string | null;
  /** ISO date string — when this line entered the bag. */
  addedAt?: string;
  /** Server-owned cart lifecycle state (for example active/payment_pending). */
  status?: string;
  /**
   * The server's viewer-state verdict for this line — the one answer the
   * cards, drawer and checkout share. Row status alone never grants trash.
   */
  viewerState?: ViewerProductState;
  /**
   * ISO date string — when this line leaves the bag on its own.
   *
   * For a one-of-one saree this mirrors the server reservation exactly, so the
   * bag can never outlive the hold behind it. Made-to-order blouses carry no
   * reservation, so they fall back to the same policy window from `addedAt`.
   */
  expiresAt?: string;
}

const cartLineExpiry = (item: {
  reservedUntil?: string | null;
}): { addedAt: string; expiresAt: string } => {
  const addedAt = new Date();
  const reservation = item.reservedUntil ? new Date(item.reservedUntil) : null;
  const expiresAt =
    reservation && !Number.isNaN(reservation.getTime())
      ? reservation
      : getCartReservationExpiresAt(addedAt);

  return { addedAt: addedAt.toISOString(), expiresAt: expiresAt.toISOString() };
};

/** Lines whose window has closed. Never mutates; safe to call during render. */
export const dropExpiredCartItems = (
  items: CartItem[],
  now = new Date(),
): CartItem[] =>
  items.filter((item) => {
    if (!item.expiresAt) return true;
    const expiresAt = new Date(item.expiresAt);
    return Number.isNaN(expiresAt.getTime()) || expiresAt > now;
  });

/**
 * Carry a stored cart across persist versions.
 *
 * Version 2 lines carry no window and would otherwise sit in the bag forever.
 * They are stamped on read, so an old bag gets one fresh policy window rather
 * than being silently dropped from under the shopper.
 */
export const migrateCartState = (
  persisted: unknown,
  version: number,
): { items: CartItem[] } => {
  const state = persisted as { items?: CartItem[] } | undefined;
  if (!state?.items) return { items: [] };
  if (version >= 3) return { items: state.items };

  return {
    items: state.items.map((item) => ({ ...item, ...cartLineExpiry(item) })),
  };
};

/** The soonest a line expires, or null when nothing is on a clock. */
export const nextCartExpiryAt = (items: CartItem[]): Date | null => {
  const times = items
    .map((item) => (item.expiresAt ? new Date(item.expiresAt) : null))
    .filter(
      (value): value is Date => value != null && !Number.isNaN(value.getTime()),
    );

  return times.length === 0
    ? null
    : new Date(Math.min(...times.map((value) => value.getTime())));
};

/** Legacy return shape retained for non-rendered callers during the cutover. */
export type CartReleaseOutcome =
  | "released"
  | "not-active"
  | "stale"
  | "failed";

export type CartRemovalResult = {
  outcome: CartReleaseOutcome;
  productId: string;
  removed: boolean;
};

interface CartState {
  items: CartItem[];
  /** Account whose rows the presentation mirror currently draws. */
  presentationUserId: null | string;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  /**
   * Add item to cart.  Pre-loved items are one-of-a-kind so adding the same
   * item again is a no-op (quantity stays at 1).
   */
  addItem: (item: Omit<CartItem, "quantity">) => void;
  /**
   * Product ids whose release is in flight. A product here must not be
   * re-added: the server still holds the reservation, so a reserve would come
   * back as another shopper's claim.
   */
  releasingIds: string[];
  /** True while this product's authenticated DELETE is in flight. */
  isReleasing: (id: string) => boolean;
  setReleasing: (id: string, releasing: boolean) => void;
  /**
   * Presentation-only compatibility shim. Rendered surfaces must use
   * useServerCart().removeFromBag so a row never disappears before DELETE.
   */
  removeItem: (id: string) => Promise<CartRemovalResult>;
  /**
   * Drop one line from the presentation cache. Pure: no fetch, no release, no
   * opinion about whether the shopper is allowed to remove it.
   *
   * The bag's authority is user_cart_items. This store only draws it, so the
   * only correct time to call this is after the server has confirmed the row
   * is gone — which is what removeFromBag does.
   */
  removePresentationItem: (id: string) => void;
  /**
   * Bumped once per deliberate add by a shopper.
   *
   * The drawer opens on this, not on the item count. A count can also rise
   * because the account's bag has just been mirrored down on page load or
   * after sign-in, and that must never pop the drawer open.
   */
  addSerial: number;
  /**
   * Announce an add the shopper actually made, when the line itself arrives by
   * sync — the OTP replay, where the click happened before the session did.
   */
  markExplicitAdd: () => void;
  /**
   * Update quantity — clamped to exactly 1 for unique pre-loved items.
   * Kept for interface compat but enforces max = 1.
   */
  updateQuantity: (id: string, quantity: number) => void;
  /**
   * Clear all items. Does NOT release reservations — used after successful
   * payment when items are already marked as sold.
   */
  clearCart: () => void;
  /**
   * Presentation-only compatibility shim. Server cart clearing belongs to the
   * authenticated cart command, not this store.
   */
  clearCartWithRelease: () => Promise<CartRemovalResult[]>;
  /**
   * Replace the whole bag with the server's copy.
   *
   * The account owns the bag now. This store stays because the drawer, the
   * header count, the add animation and the trash control all read it — making
   * it a faithful mirror kept every one of those surfaces working unchanged,
   * rather than rewriting them.
   */
  replaceItems: (items: CartItem[]) => void;
  /**
   * Drop lines whose window has closed. Idempotent, so the timer, the
   * visibility handler and rehydration can all call it freely.
   */
  pruneExpired: () => void;
  /** Check whether a product is already in the cart. */
  hasItem: (id: string) => boolean;
  /** Return the cart line for a product id. */
  getItem: (id: string) => CartItem | undefined;
  /** Update line-item options without changing one-of-one reservation state. */
  updateSelectedOptions: (
    id: string,
    selectedOptions: CartItem["selectedOptions"],
  ) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      presentationUserId: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addSerial: 0,
      markExplicitAdd: () => set((state) => ({ addSerial: state.addSerial + 1 })),
      removePresentationItem: (id) =>
        set((state) => {
          const items = state.items.filter((item) => item.id !== id);
          // Same reference when nothing matched, so no subscriber re-renders.
          return items.length === state.items.length
            ? state
            : {
                items,
                releasingIds: state.releasingIds.filter(
                  (releasingId) => releasingId !== id,
                ),
              };
        }),
      addItem: (item) =>
        set((state) => {
          // One-of-a-kind — don't add duplicates
          const existing = state.items.find(
            (existingItem) => existingItem.id === item.id
          );
          if (existing) {
            // The incoming server-confirmed display fields win. There is no
            // reservation proof in this store; ownership stays on the server.
            return {
              addSerial: state.addSerial + 1,
              items: state.items.map((existingItem) =>
                existingItem.id === item.id
                  ? {
                      ...existingItem,
                      ...item,
                      quantity: 1,
                      selectedOptions:
                        item.selectedOptions ?? existingItem.selectedOptions,
                    }
                  : existingItem
              ),
            };
          }
          return {
            addSerial: state.addSerial + 1,
            items: [
              ...state.items,
              { ...item, quantity: 1 }, // always qty 1
            ],
          };
        }),
      releasingIds: [],
      isReleasing: (id) => get().releasingIds.includes(id),
      setReleasing: (id, releasing) =>
        set((state) => ({
          releasingIds: releasing
            ? state.releasingIds.includes(id)
              ? state.releasingIds
              : [...state.releasingIds, id]
            : state.releasingIds.filter((releasingId) => releasingId !== id),
        })),
      removeItem: async (id) => {
        get().removePresentationItem(id);
        return { outcome: "not-active", productId: id, removed: true };
      },
      updateQuantity: (_id, _quantity) => {
        // Pre-loved items are unique — quantity is always 1.
        // This is intentionally a no-op to prevent UI bugs.
        return;
      },
      clearCart: () => set({ items: [] }),
      clearCartWithRelease: async () => {
        const results = get().items.map((item) => ({
          outcome: "not-active" as const,
          productId: item.id,
          removed: true,
        }));
        set({ items: [] });
        return results;
      },
      replaceItems: (items) =>
        set((state) => {
          /*
           * Same reference when genuinely nothing moved, so a thirty-second
           * poll re-renders nothing.
           *
           * Membership alone is not "nothing moved". Comparing ids only meant
           * a bag whose rows had not changed could never take a correction to
           * one — which is exactly how a line that arrived before the server
           * could supply its thumbnail kept the empty box for the rest of the
           * visit, however many times the real image came back down.
           */
          const unchanged =
            state.items.length === items.length &&
            state.items.every((item, index) => {
              const next = items[index];
              return (
                next != null &&
                item.id === next.id &&
                item.image === next.image &&
                item.name === next.name &&
                item.price === next.price &&
                item.slug === next.slug &&
                item.status === next.status &&
                item.viewerState === next.viewerState &&
                item.reservedUntil === next.reservedUntil
              );
            });
          return unchanged ? state : { items };
        }),
      pruneExpired: () =>
        set((state) => {
          const items = dropExpiredCartItems(state.items);
          // Same reference when nothing expired, so no subscriber re-renders.
          return items.length === state.items.length ? state : { items };
        }),
      hasItem: (id) => get().items.some((item) => item.id === id),
      getItem: (id) => get().items.find((item) => item.id === id),
      updateSelectedOptions: (id, selectedOptions) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, selectedOptions } : item
          ),
        })),
    }),
    {
      name: "ftt-cart-v2",
      version: 4,
      /*
       * Keep the middleware API while older tabs drain, but persist no bag
       * membership. The authenticated server cart is the only durable bag.
       */
      partialize: () => ({ items: [] }),
      storage: createJSONStorage(() => localStorage),
      // Version 4 intentionally drops every pre-cutover browser-owned row.
      migrate: () => ({ items: [] }),
    }
  )
);

/**
 * Rupee-facing totals for existing callers, derived from the shared integer-paise
 * helper so the cart, drawer, and savings banner can never disagree.
 */
export const getCartTotals = (items: CartItem[]) => {
  const { originalSubtotalPaise, savingsPaise, subtotalPaise, totalItems } =
    getCartTotalsPaise(items);

  return {
    totalItems,
    subtotal: subtotalPaise / 100,
    subtotalPaise,
    originalSubtotalPaise,
    savingsPaise,
  };
};
