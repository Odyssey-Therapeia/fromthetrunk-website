"use client";

import { readClientConsent } from "@/lib/analytics/consent";
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
  // Consent gate: these are browser-origin analytics events. When consent is
  // unknown or denied we send NOTHING — no /api/v2/events/track request — so
  // first-party analytics also respects consent (not just GTM). Once granted,
  // events flow to the internal store; the GA4 MP sink still excludes these
  // browser events (GTM owns them client-side).
  if (readClientConsent() !== "granted") return;

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
  // Consent gate first, BEFORE the sessionStorage marker — otherwise a pre-
  // consent attempt would set the "already sent" flag and suppress the event
  // after the visitor later accepts.
  if (readClientConsent() !== "granted") return;

  try {
    const storageKey = `ftt.metric.${key}`;
    if (sessionStorage.getItem(storageKey)) return;

    sessionStorage.setItem(storageKey, "1");
    trackWebsiteMetric(type, payload);
  } catch {
    trackWebsiteMetric(type, payload);
  }
}
