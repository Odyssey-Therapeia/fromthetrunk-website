/**
 * P2-07: GA4 Measurement Protocol sink adapter.
 *
 * Env-gated: only active when GA4_MEASUREMENT_ID and GA4_API_SECRET are set.
 * Sends BACKEND-owned server events to GA4 via the Measurement Protocol v2.
 *
 * OWNERSHIP: browser UX events are owned by GTM (client-side) once the container
 * is live, so this sink does NOT forward them — that would duplicate GTM's GA4
 * events and bypass the browser consent gate (these arrive via
 * /api/v2/events/track without a server-side consent signal). See
 * GTM_OWNED_BROWSER_EVENTS below. Backend events (payment_completed, etc.) are
 * still forwarded and stamped event_source=server_mp.
 *
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsSink,
} from "@/lib/ports/analytics-sink";

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

/**
 * Browser-origin UX events that GTM sends to GA4 client-side. NOT forwarded via
 * Measurement Protocol (would double-count with GTM and leak past consent).
 */
const GTM_OWNED_BROWSER_EVENTS: ReadonlySet<AnalyticsEventType> = new Set([
  "product_view",
  "product_card_click",
  "add_to_cart",
  "cart_viewed",
  "checkout_started",
  "collection_view",
  "filter_applied",
  "search_performed",
]);

/**
 * Returns the GA4 Measurement Protocol sink when env vars are present,
 * or null if the adapter is not configured.
 */
export function buildGa4Sink(): AnalyticsSink | null {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return null;
  }

  return {
    async emit(event: AnalyticsEvent): Promise<void> {
      // Skip GTM-owned browser UX events — they reach GA4 client-side via GTM.
      if (GTM_OWNED_BROWSER_EVENTS.has(event.type)) return;

      const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

      const body = JSON.stringify({
        // Use event_id as client_id for stable dedup in GA4.
        // In production you may want to pass a real user/session client_id;
        // for server-side CAPI events this sentinel is acceptable.
        client_id: event.event_id,
        timestamp_micros: String(event.occurredAt.getTime() * 1000),
        events: [
          {
            name: event.type,
            params: {
              event_id: event.event_id,
              event_source: "server_mp",
              ...event.payload,
            },
          },
        ],
      });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `[ga4-sink] GA4 Measurement Protocol returned ${response.status}: ${await response.text()}`
        );
      }
    },
  };
}
