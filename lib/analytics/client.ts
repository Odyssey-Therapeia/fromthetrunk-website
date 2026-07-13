"use client";

import { readClientConsent } from "@/lib/analytics/consent";
import type { Ga4EcommerceEvent } from "@/lib/analytics/ga4-ecommerce";
import { trackEvent } from "@/lib/analytics/track";
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

/**
 * Records one browser-owned website metric in both analytics systems:
 *
 * 1. Internal FTT event → /api/v2/events/track → events table
 * 2. Optional canonical GA4 event → dataLayer → GTM → GA4
 *
 * Both representations share the same event ID for reconciliation.
 */
export function trackWebsiteMetric(
  type: WebsiteMetricType,
  payload: TrackPayload = {},
  ga4Event?: Ga4EcommerceEvent,
): void {
  // Consent gate: when consent is unknown or denied, send nothing to either the
  // internal event store or GTM/GA4.
  if (readClientConsent() !== "granted") return;

  try {
    const eventId = crypto.randomUUID();

    // Mirror the canonical GA4 representation into the dataLayer. This occurs
    // before sendBeacon's early return so both analytics paths receive the event.
    if (ga4Event) {
      trackEvent(ga4Event.name, {
        ...ga4Event.params,
        event_id: eventId,
      });
    }

    const body = JSON.stringify({
      eventId,
      payload,
      type,
    });

    const url = "/api/v2/events/track";

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
    }).catch(() => {
      // Tracking failures must never become unhandled promise rejections.
    });
  } catch {
    // Tracking must never break browsing or checkout.
  }
}

export function trackOncePerSession(
  key: string,
  type: WebsiteMetricType,
  payload: TrackPayload = {},
  ga4Event?: Ga4EcommerceEvent,
): void {
  // Consent gate first, BEFORE the sessionStorage marker — otherwise a pre-
  // consent attempt would set the "already sent" flag and suppress the event
  // after the visitor later accepts.
  if (readClientConsent() !== "granted") return;

  try {
    const storageKey = `ftt.metric.${key}`;
    if (sessionStorage.getItem(storageKey)) return;

    sessionStorage.setItem(storageKey, "1");
    trackWebsiteMetric(type, payload, ga4Event);
  } catch {
    trackWebsiteMetric(type, payload, ga4Event);
  }
}
