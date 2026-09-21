"use client";

import { useEffect } from "react";

import { useServerCart } from "@/lib/commerce/use-server-cart";

export function ClearCartOnConfirmation({ enabled }: { enabled: boolean }) {
  const { isAuthenticated, refresh } = useServerCart();

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    // The paid-order transaction clears only matching database rows. Mirroring
    // that answer preserves any unrelated item added from another tab.
    void refresh();
  }, [enabled, isAuthenticated, refresh]);

  return null;
}
