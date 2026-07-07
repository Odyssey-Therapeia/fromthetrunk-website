/**
 * Client-side GTM dataLayer event helpers.
 *
 * These push `ftt_*` (and `page_view`) events onto `window.dataLayer`; GA4 Event
 * tags configured INSIDE the GTM container map them to GA4 events. Every push is
 * SSR-safe (guards on `window`) and never throws — analytics must never break
 * browsing or checkout. Consent gating is enforced upstream: these run only
 * inside components mounted after consent (see `AnalyticsGate`); GTM itself is
 * not loaded until consent, so pushes before that simply queue in the array.
 *
 * OWNERSHIP (no double-counting with the server-side GA4 Measurement Protocol
 * sink in `lib/adapters/ga4-sink.ts`):
 *   - Browser / GTM owns: page_view + UX events (search, signup, login,
 *     contact_submit, generate_lead, whatsapp_click, start_flow, complete_flow).
 *   - Server owns the backend conversion. The MP sink currently forwards the RAW
 *     event name `payment_completed` — NOT a proper GA4 e-commerce `purchase`.
 * => There is intentionally NO client purchase helper here. Do not add one:
 *    server Measurement Protocol owns payment/conversion. (Follow-up: map the
 *    backend payment_completed → GA4 `purchase` with transaction_id/value/
 *    currency/items, then mark `purchase` a GA4 key event.)
 */

type EventParams = Record<string, unknown>;

/** Stamped on every push so client vs server events are distinguishable in GTM/GA4. */
const EVENT_SOURCE = "client_gtm";

/** Low-level push. Guarded and non-throwing. */
function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(payload);
  } catch {
    // Analytics must never break the app.
  }
}

/** Push a named event with arbitrary params onto the dataLayer. */
export function trackEvent(event: string, params: EventParams = {}): void {
  pushToDataLayer({ event, event_source: EVENT_SOURCE, ...params });
}

/**
 * SPA route change / page view.
 * @param url   page path (+ query), e.g. "/collection?type=blouse"
 * @param title optional document title
 */
export function trackPageView(url?: string, title?: string): void {
  const isBrowser = typeof window !== "undefined";
  trackEvent("page_view", {
    page_path: url ?? (isBrowser ? window.location.pathname + window.location.search : undefined),
    page_location: isBrowser ? window.location.href : undefined,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
  });
}

export function trackSignup(method = "email"): void {
  trackEvent("ftt_signup", { method });
}

export function trackLogin(method = "email"): void {
  trackEvent("ftt_login", { method });
}

export function trackLead(formName: string, leadType: string): void {
  trackEvent("ftt_generate_lead", { form_name: formName, lead_type: leadType });
}

export function trackSearch(searchTerm: string): void {
  trackEvent("ftt_search", { search_term: searchTerm });
}

export function trackWhatsappClick(location: string): void {
  trackEvent("ftt_click_whatsapp", { location });
}

/**
 * Optional non-key UX signal for a form submission. NOT a lead — the contact
 * form fires `trackLead` (→ GA4 generate_lead) for the conversion. If you ever
 * wire this, map `ftt_contact_submit` to a CUSTOM non-key GA4 event, never to
 * generate_lead, or you will double-count the lead. Currently unused.
 */
export function trackContactSubmit(formName: string): void {
  trackEvent("ftt_contact_submit", { form_name: formName });
}

/** Multi-step flow started (checkout, contact wizard, signup, …). */
export function trackStartFlow(flowName: string, params: EventParams = {}): void {
  trackEvent("ftt_start_flow", { flow_name: flowName, ...params });
}

/** Multi-step flow completed (browser-owned; NOT a purchase). */
export function trackCompleteFlow(
  flowName: string,
  params: EventParams = {},
): void {
  trackEvent("ftt_complete_flow", { flow_name: flowName, ...params });
}
