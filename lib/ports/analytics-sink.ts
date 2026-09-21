/**
 * P2-07: Analytics sink port.
 *
 * Defines the stable event shape and sink interface.
 * event_id must be stable and globally unique (use crypto.randomUUID()).
 * It is shared across all adapters and with client-side pixels (e.g. Meta Pixel)
 * to enable server-to-client event deduplication.
 */

export type AnalyticsEventType =
  | "order_created"
  | "payment_completed"
  | "reservation_expired"
  | "content_published"
  | "wishlist_added"
  | "wishlist_removed"
  | "restock_notify_requested"
  | "collection_view"
  | "product_card_click"
  | "product_view"
  | "add_to_cart"
  | "cart_viewed"
  | "checkout_started"
  | "search_performed"
  | "filter_applied";

/**
 * The visitor's optional-tracking consent, as it applies to one event.
 *
 * Mirrors the two banner categories in lib/analytics/consent.ts:
 *   analytics   → Google Analytics / GA4
 *   advertising → Meta
 *
 * `false` means refused AND means never established. There is no third state
 * on purpose: a sink must not be able to treat "we do not know" as permission.
 */
export type AnalyticsConsent = {
  advertising: boolean;
  analytics: boolean;
};

/** Nothing optional is permitted until something proves otherwise. */
export const NO_TRACKING_CONSENT: AnalyticsConsent = Object.freeze({
  advertising: false,
  analytics: false,
});

export type AnalyticsEvent = {
  /** Globally unique per logical event — stable across all adapter calls. */
  event_id: string;
  type: AnalyticsEventType;
  payload: Record<string, unknown>;
  /** When the business event occurred (not when the record was written). */
  occurredAt: Date;
  /**
   * The visitor's consent for this event. OMITTING THIS SENDS THE EVENT TO
   * FIRST-PARTY SINKS ONLY — every third-party sink is skipped. Server paths
   * with no visitor attached (cron, provider webhooks) therefore leak nothing
   * by default; they have to load a recorded decision to opt in.
   */
  consent?: AnalyticsConsent;
};

export interface AnalyticsSink {
  emit(event: AnalyticsEvent): Promise<void>;
  /**
   * The consent category this sink needs before it may receive an event.
   *
   * Omitted means first-party: our own database, which records the order we
   * are contractually performing and is not optional tracking. EVERY sink that
   * sends to a third party MUST declare one — `tests/unit/analytics-consent-\
   * server.test.ts` fails the build if one does not.
   */
  requiresConsent?: keyof AnalyticsConsent;
  /** Stable name for logs and for the "third-party sinks declare consent" test. */
  readonly name?: string;
}
