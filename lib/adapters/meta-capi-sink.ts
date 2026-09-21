/**
 * P2-07: Meta Conversions API (CAPI) sink adapter.
 *
 * Env-gated: only active when META_CAPI_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set.
 * Sends server-side conversion events to the Meta Conversions API.
 * Shares event_id with the P1-18 client-side Meta Pixel to enable
 * server-to-browser pixel deduplication.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";

const META_CAPI_ENDPOINT = "https://graph.facebook.com/v18.0";

/** Map internal event types to Meta standard event names. */
const META_EVENT_NAME: Record<string, string> = {
  order_created: "InitiateCheckout",
  payment_completed: "Purchase",
  reservation_expired: "CustomEvent",
};

/**
 * What Meta is allowed to receive beyond the bare fact that a conversion
 * happened. Currently: NOTHING.
 *
 * This used to spread the whole internal payload into `custom_data`, which
 * sent Meta our internal user id, the referrer, discount codes, and order and
 * payment references. None of that is needed to count a conversion, and the
 * user id in particular is a stable per-person identifier that has no business
 * leaving our systems. The allowlist is empty by deliberate default: a field
 * reaches Meta only if it is named here, so adding one to an internal payload
 * can never quietly widen what a third party sees.
 *
 * Meta still receives event_name (which conversion), event_time, event_id
 * (deduplication against the browser Pixel) and action_source.
 *
 * TO REPORT REVENUE in Meta Ads, return
 *   { currency: "INR", value: (event.payload.totalPaise as number) / 100 }
 * for "payment_completed". TO RUN CATALOGUE/DYNAMIC ADS, add
 *   { content_ids: event.payload.productIds, content_type: "product" }.
 * Either one widens what Meta receives, so update the "Transaction records
 * sent to Meta" paragraph in lib/legal/policies.ts in the same change.
 */
function buildMetaCustomData(
  _event: AnalyticsEvent,
): Record<string, unknown> | undefined {
  return undefined;
}

/**
 * Returns the Meta CAPI sink when env vars are present,
 * or null if the adapter is not configured.
 */
export function buildMetaCapiSink(): AnalyticsSink | null {
  const pixelId = process.env.META_CAPI_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return null;
  }

  return {
    name: "meta-capi",
    // Meta is a third party and an advertising purpose. emitAnalyticsEvent()
    // will not hand this sink an event without the visitor's advertising
    // consent, so an order placed by someone who refused never reaches Meta.
    requiresConsent: "advertising",
    async emit(event: AnalyticsEvent): Promise<void> {
      const url = `${META_CAPI_ENDPOINT}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
      const customData = buildMetaCustomData(event);

      const body = JSON.stringify({
        data: [
          {
            event_name: META_EVENT_NAME[event.type] ?? event.type,
            event_time: Math.floor(event.occurredAt.getTime() / 1000),
            // event_id is shared with the client pixel for CAPI dedup
            event_id: event.event_id,
            action_source: "website",
            ...(customData ? { custom_data: customData } : {}),
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
          `[meta-capi-sink] Meta CAPI returned ${response.status}: ${await response.text()}`
        );
      }
    },
  };
}
