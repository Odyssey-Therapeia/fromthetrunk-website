import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  /** ISO date string — when the server-side reservation expires. */
  reservedUntil?: string | null;
}

interface CartState {
  items: CartItem[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  /**
   * Add item to cart.  Pre-loved items are one-of-a-kind so adding the same
   * item again is a no-op (quantity stays at 1).
   */
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  /**
   * Update quantity — clamped to exactly 1 for unique pre-loved items.
   * Kept for interface compat but enforces max = 1.
   */
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  /** Check whether a product is already in the cart. */
  hasItem: (id: string) => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addItem: (item) =>
        set((state) => {
          // One-of-a-kind — don't add duplicates
          const existing = state.items.find(
            (existingItem) => existingItem.id === item.id
          );
          if (existing) {
            return state; // no-op, already in cart
          }
          return {
            items: [
              ...state.items,
              { ...item, quantity: 1 }, // always qty 1
            ],
          };
        }),
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),
      updateQuantity: (_id, _quantity) => {
        // Pre-loved items are unique — quantity is always 1.
        // This is intentionally a no-op to prevent UI bugs.
        return;
      },
      clearCart: () => set({ items: [] }),
      hasItem: (id) => get().items.some((item) => item.id === id),
    }),
    {
      name: "ftt-cart-v2",
      version: 2,
      partialize: (state) => ({ items: state.items }),
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export const getCartTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
  return { totalItems, subtotal };
};
