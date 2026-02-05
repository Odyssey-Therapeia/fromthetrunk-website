import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find(
            (existingItem) => existingItem.id === item.id
          );
          if (existing) {
            return {
              items: state.items.map((existingItem) =>
                existingItem.id === item.id
                  ? { ...existingItem, quantity: existingItem.quantity + quantity }
                  : existingItem
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
          ),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "ftt-cart-v1",
      version: 1,
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
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  return { totalItems, subtotal };
};
