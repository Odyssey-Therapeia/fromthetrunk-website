"use client";

import { useEffect } from "react";

import { trackCompleteFlow, trackEvent } from "@/lib/analytics/track";

/**
 * Browser-side confirmation tracking.
 *
 * Fires ONLY the browser-owned events on a paid confirmation:
 *   - `order_confirmation_view` (a page/return view, not a conversion)
 *   - `ftt_complete_flow` (checkout funnel completed)
 *
 * It deliberately does NOT fire a `purchase` event. The backend conversion is
 * owned server-side: the Measurement Protocol sink (`lib/adapters/ga4-sink.ts`)
 * forwards `payment_completed` when a paid order is confirmed. That is the
 * current backend conversion event — it is NOT yet a proper GA4 e-commerce
 * `purchase` (see the follow-up to map payment_completed → purchase with
 * transaction_id/value/currency/items). Firing a client `purchase` now would
 * double-count against a future server `purchase`. Guarded once-per-order via
 * sessionStorage so the payment-status poller re-render cannot re-fire it.
 */
export function ConfirmationAnalytics({
  currency = "INR",
  enabled,
  orderId,
  value,
}: {
  currency?: string;
  enabled: boolean;
  orderId: string;
  value: number;
}) {
  useEffect(() => {
    if (!enabled || !orderId) return;

    const key = `ftt.complete_flow.${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — fall through and fire once for this mount.
    }

    trackEvent("order_confirmation_view", {
      transaction_id: orderId,
      value,
      currency,
    });
    trackCompleteFlow("checkout", {
      transaction_id: orderId,
      value,
      currency,
    });
  }, [currency, enabled, orderId, value]);

  return null;
}
