"use client";

import posthog from "posthog-js";

import type { AnalyticsEventType } from "@/lib/ports/analytics-sink";
import { isPosthogEnabled } from "@/lib/analytics/config";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics/consent";

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

const ENTRY_KEY = "ftt_entry_v1";

/** True only when the user has accepted non-essential cookies. */
function consented(): boolean {
  if (typeof document === "undefined") return false;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.split("=")[1]) === "all";
}

/**
 * Capture the entry gate (referrer + UTM) once per session so we always know
 * how a user arrived — even if they accept consent several navigations in.
 */
function captureEntry(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = sessionStorage.getItem(ENTRY_KEY);
    if (existing) return JSON.parse(existing) as Record<string, unknown>;
  } catch {
    /* ignore parse errors */
  }
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  const entry: Record<string, unknown> = {
    referrer: document.referrer || null,
    utm,
    landingPath: window.location.pathname,
    landedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(entry));
  } catch {
    /* storage may be unavailable */
  }
  return entry;
}

export function trackWebsiteMetric(
  type: WebsiteMetricType,
  payload: TrackPayload = {},
) {
  // 1) Existing first-party ingestion → /api/v2/events/track → events table.
  //    Always fires (the events table is the owned permanent record).
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
      if (!queued) {
        void fetch(url, {
          body,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          method: "POST",
        });
      }
    } else {
      void fetch(url, {
        body,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      });
    }
  } catch {
    // Tracking must never break browsing or checkout.
  }

  // 2) Mirror to PostHog for product analytics (funnels, replay, retention).
  //    Consent-gated — only fires after the user accepts non-essential cookies.
  if (consented() && isPosthogEnabled()) {
    const entry = captureEntry();
    try {
      posthog.capture(type, {
        ...payload,
        $pathname: window.location.pathname,
        $href: window.location.href,
        referrer: entry?.referrer ?? null,
        utm: entry?.utm ?? {},
        landingPath: entry?.landingPath ?? null,
      });
    } catch {
      /* posthog not initialised yet — the provider init will re-evaluate */
    }
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
