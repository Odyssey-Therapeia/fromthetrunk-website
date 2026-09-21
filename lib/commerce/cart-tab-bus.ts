"use client";

/**
 * A tiny, opaque cross-tab invalidation signal. It carries no account id, cart
 * membership, reservation proof, price, or ownership claim; every receiving
 * tab must read its authenticated bag from the server again.
 */

export const CART_TAB_SYNC_KEY = "ftt-cart-sync-v1";

let signalSequence = 0;

export function announceCartChangedAcrossTabs(userId: null | string): void {
  if (!userId || typeof window === "undefined") return;

  try {
    signalSequence += 1;
    window.localStorage.setItem(
      CART_TAB_SYNC_KEY,
      `${Date.now()}:${signalSequence}`,
    );
  } catch {
    // Storage can be unavailable in hardened/private contexts. The current
    // tab is already reconciled, and other tabs will refresh on focus.
  }
}

export const isCartTabSignal = (value: null | string): boolean =>
  typeof value === "string" && /^\d+:\d+$/.test(value);
