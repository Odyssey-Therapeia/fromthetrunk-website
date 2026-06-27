"use client";

import type { AnalyticsEventType } from "@/lib/ports/analytics-sink";

type WebsiteMetricType = Extract<
  AnalyticsEventType,
  | "collection_view"
  | "product_card_click"
  | "product_view"
  | "add_to_cart"
  | "cart_viewed"
  | "checkout_started"
  | "search_performed"
  | "filter_applied"
>;

type TrackPayload = Record<string, unknown>;

export function trackWebsiteMetric(
  type: WebsiteMetricType,
  payload: TrackPayload = {},
) {
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    payload,
    type,
  });

  const url = "/api/v2/events/track";

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon(url, blob);
      if (queued) return;
    }

    void fetch(url, {
      body,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Tracking must never break browsing or checkout.
  }
}

export function trackOncePerSession(
  key: string,
  type: WebsiteMetricType,
  payload: TrackPayload = {},
) {
  try {
    const storageKey = `ftt.metric.${key}`;
    if (sessionStorage.getItem(storageKey)) return;

    sessionStorage.setItem(storageKey, "1");
    trackWebsiteMetric(type, payload);
  } catch {
    trackWebsiteMetric(type, payload);
  }
}
