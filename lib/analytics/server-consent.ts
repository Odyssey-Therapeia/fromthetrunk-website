/**
 * Reading the visitor's optional-tracking consent on the SERVER.
 *
 * The banner records its decision in first-party cookies (lib/analytics/consent.ts).
 * Server code that wants to forward an event to Google or Meta has to prove the
 * visitor allowed it, and the only proof available in a request is those
 * cookies. Anything that cannot read them — a cron run, a Razorpay webhook —
 * gets NO_TRACKING_CONSENT and therefore reaches first-party sinks only.
 *
 * This module never writes a cookie and never decides policy. It answers one
 * question: what did this visitor agree to?
 */
import {
  ADVERTISING_CONSENT_COOKIE,
  CONSENT_COOKIE,
  parseConsent,
} from "@/lib/analytics/consent";
import {
  NO_TRACKING_CONSENT,
  type AnalyticsConsent,
} from "@/lib/ports/analytics-sink";

/**
 * Parse one cookie out of a raw `Cookie:` header.
 *
 * Deliberately hand-rolled rather than split("; "): a header assembled by a
 * proxy can use bare "," or omit the space, and a value can legitimately
 * contain "=".
 */
function readCookieHeader(header: null | string, name: string): null | string {
  if (!header) return null;
  for (const pair of header.split(/[;,]/)) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(eq + 1).trim());
    } catch {
      // A malformed percent-escape is not a grant.
      return null;
    }
  }
  return null;
}

/** The consent carried by a raw Cookie header. Absent cookies mean refusal. */
export function consentFromCookieHeader(header: null | string): AnalyticsConsent {
  if (!header) return NO_TRACKING_CONSENT;
  return {
    advertising:
      parseConsent(readCookieHeader(header, ADVERTISING_CONSENT_COOKIE)) ===
      "granted",
    analytics:
      parseConsent(readCookieHeader(header, CONSENT_COOKIE)) === "granted",
  };
}

/** The consent carried by an incoming request. */
export function consentFromRequest(request: Request): AnalyticsConsent {
  return consentFromCookieHeader(request.headers.get("cookie"));
}

/**
 * Rebuild consent from what was recorded on an order.
 *
 * The visitor is present when the order is created, but payment can complete
 * later through a Razorpay webhook or the expiry reconciler, where there is no
 * browser and no cookie. The decision is therefore stored on the order at
 * creation and read back here, so a purchase is forwarded on the consent the
 * shopper actually gave — and a NULL column (an order placed before this was
 * recorded) reads as refusal.
 */
export function consentFromRecord(record: {
  advertisingConsent?: boolean | null;
  analyticsConsent?: boolean | null;
}): AnalyticsConsent {
  return {
    advertising: record.advertisingConsent === true,
    analytics: record.analyticsConsent === true,
  };
}
