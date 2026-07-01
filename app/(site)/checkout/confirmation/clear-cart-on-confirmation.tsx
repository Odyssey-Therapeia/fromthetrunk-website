"use client";

import { useEffect } from "react";

import { useCartStore } from "@/lib/store/cart-store";

export function ClearCartOnConfirmation({ enabled }: { enabled: boolean }) {
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    if (!enabled) return;
    clearCart();
  }, [clearCart, enabled]);

  return null;
}
