"use client";

/**
 * Refreshes the authenticated bag when its next server hold expires.
 *
 * The client never deletes the row itself. The timer only asks the cart API to
 * run its payment-aware expiry command and return the canonical membership.
 */

import { useEffect } from "react";

import { useServerCart } from "@/lib/commerce/use-server-cart";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function CartExpirySweeper() {
  const { isAuthenticated, items, refresh } = useServerCart();
  const nextExpiryMs = items.reduce<null | number>((earliest, item) => {
    if (!item.reservedUntil) return earliest;
    const value = new Date(item.reservedUntil).getTime();
    if (!Number.isFinite(value)) return earliest;
    return earliest == null || value < earliest ? value : earliest;
  }, null);

  useEffect(() => {
    if (!isAuthenticated || nextExpiryMs == null) return;

    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(0, nextExpiryMs - Date.now() + 100),
    );
    const timer = window.setTimeout(() => void refresh(), delay);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, nextExpiryMs, refresh]);

  useEffect(() => {
    if (!isAuthenticated || nextExpiryMs == null) return;

    const recheck = () => {
      if (
        document.visibilityState === "visible" &&
        nextExpiryMs <= Date.now()
      ) {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);

    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [isAuthenticated, nextExpiryMs, refresh]);

  return null;
}
