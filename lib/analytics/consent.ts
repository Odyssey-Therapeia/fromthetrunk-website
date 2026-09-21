/**
 * Analytics and advertising consent state.
 *
 * We use a strict "load-only-after-consent" model: no third-party tag is loaded
 * at all until the visitor accepts. This is stricter than Google Consent Mode's
 * default-denied approach and keeps zero third-party scripts on the page for
 * visitors who have not opted in.
 *
 * TWO INDEPENDENT CATEGORIES, because they are different purposes with
 * different recipients:
 *
 *   - analytics   → Google Analytics, loaded through Google Tag Manager.
 *   - advertising → the Meta Pixel.
 *
 * Each has its own first-party cookie so neither can be inferred from the
 * other. The analytics cookie keeps its original name and its original
 * "granted"/"denied" values, so a decision made under the previous
 * analytics-only notice is preserved exactly as the visitor left it. The
 * advertising cookie is new: a visitor who never saw the revised notice simply
 * has no advertising cookie, which reads as "unknown" and keeps the Pixel off.
 * An analytics grant can therefore never become advertising permission.
 *
 * The notice version is recorded alongside any decision made under the revised
 * wording, so it is possible to tell which notice a visitor actually agreed to.
 *
 * This module is framework-agnostic and safe to import from both server and
 * client code — the browser-only helpers guard on `document`.
 */

/** Analytics decision. Unchanged name and values: existing choices survive. */
export const CONSENT_COOKIE = "ftt_analytics_consent";

/** Advertising (Meta Pixel) decision. Absent means "never asked" → off. */
export const ADVERTISING_CONSENT_COOKIE = "ftt_advertising_consent";

/** Which notice version a recorded decision was made under. */
export const CONSENT_NOTICE_COOKIE = "ftt_consent_notice";

/**
 * The revised notice that names Google Analytics and the Meta Pixel and
 * separates analytics from advertising. Bump this only when the banner's
 * disclosure materially changes — it makes the banner ask again.
 */
export const CONSENT_NOTICE_VERSION = "2026-09-17";

/** Persist the decision for ~180 days. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Window event dispatched whenever the consent decision changes (accept,
 * reject, save preferences, or reset via "Cookie settings"). `AnalyticsGate`
 * listens for it and re-reads the cookies, so the banner and the tags react
 * without a page reload.
 */
export const CONSENT_CHANGED_EVENT = "ftt:consent-changed";

export type ConsentState = "granted" | "denied" | "unknown";

export type ConsentCategory = "advertising" | "analytics";

/** Every optional category, plus the notice the decision was recorded under. */
export type ConsentDecision = {
  advertising: ConsentState;
  analytics: ConsentState;
  noticeVersion: null | string;
};

/** Normalise an arbitrary cookie value into a ConsentState. */
export function parseConsent(value: null | string | undefined): ConsentState {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "unknown";
}

function readCookie(name: string): null | string {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=")[1] ?? "");
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function expireCookie(name: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/**
 * Read the ANALYTICS decision.
 *
 * Kept as the module's original export and original meaning, so every existing
 * analytics call site (`lib/analytics/track.ts`, `lib/analytics/client.ts`)
 * keeps working unchanged. Returns "unknown" during SSR or when no decision has
 * been made. Use `readConsentDecision()` when you need advertising too.
 */
export function readClientConsent(): ConsentState {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

/** Read the ADVERTISING decision. "unknown" keeps the Meta Pixel off. */
export function readAdvertisingConsent(): ConsentState {
  return parseConsent(readCookie(ADVERTISING_CONSENT_COOKIE));
}

/** Read every category at once, plus the notice version on record. */
export function readConsentDecision(): ConsentDecision {
  return {
    advertising: readAdvertisingConsent(),
    analytics: readClientConsent(),
    noticeVersion: readCookie(CONSENT_NOTICE_COOKIE),
  };
}

/** Only an explicit grant runs a tag. "unknown" is never permission. */
export function isAnalyticsAllowed(decision: ConsentDecision): boolean {
  return decision.analytics === "granted";
}

export function isAdvertisingAllowed(decision: ConsentDecision): boolean {
  return decision.advertising === "granted";
}

/**
 * Whether the consent banner should be shown.
 *
 * Three cases, in order:
 *
 *   1. A decision recorded under the CURRENT notice → the visitor has already
 *      answered the question as it is now worded. Stay quiet.
 *   2. No current-notice decision, but a previous REJECTION on record → that
 *      refusal is preserved and treated as refusing both categories. Someone
 *      who said no is not asked again on every visit.
 *   3. Otherwise → ask. This covers a first-time visitor and, deliberately, a
 *      visitor who accepted under the old analytics-only notice: their
 *      analytics choice keeps working, but they have never been told about
 *      advertising, so they are shown the revised notice.
 */
export function shouldShowConsentBanner(decision: ConsentDecision): boolean {
  if (decision.noticeVersion === CONSENT_NOTICE_VERSION) return false;
  if (decision.analytics === "denied") return false;
  return true;
}

/**
 * Persist a decision to a first-party cookie (client-side).
 * SameSite=Lax, path=/, not HttpOnly (the banner must be able to write it).
 * This is not a secret.
 *
 * Analytics only. Retained for existing callers; the banner uses
 * `writeConsentDecision`, which also records the notice version.
 */
export function writeClientConsent(state: Exclude<ConsentState, "unknown">): void {
  if (typeof document === "undefined") return;
  writeCookie(CONSENT_COOKIE, state);
  document.documentElement.setAttribute("data-ftt-analytics-consent", state);
}

/**
 * Persist a full decision — both categories plus the notice version it was
 * made under. This is what every control on the revised banner calls.
 */
export function writeConsentDecision(decision: {
  advertising: Exclude<ConsentState, "unknown">;
  analytics: Exclude<ConsentState, "unknown">;
}): void {
  if (typeof document === "undefined") return;
  writeCookie(CONSENT_COOKIE, decision.analytics);
  writeCookie(ADVERTISING_CONSENT_COOKIE, decision.advertising);
  writeCookie(CONSENT_NOTICE_COOKIE, CONSENT_NOTICE_VERSION);
  document.documentElement.setAttribute(
    "data-ftt-analytics-consent",
    decision.analytics,
  );
  document.documentElement.setAttribute(
    "data-ftt-advertising-consent",
    decision.advertising,
  );
}

/**
 * Clear every stored decision (client-side), returning the visitor to the
 * "unknown" state so the consent banner shows again and every optional tag
 * stops. Used by the footer "Cookie settings" control, which is the visitor's
 * own withdrawal route — no email required.
 */
export function clearClientConsent(): void {
  if (typeof document === "undefined") return;
  expireCookie(CONSENT_COOKIE);
  expireCookie(ADVERTISING_CONSENT_COOKIE);
  expireCookie(CONSENT_NOTICE_COOKIE);
  document.documentElement.setAttribute("data-ftt-analytics-consent", "unknown");
  document.documentElement.setAttribute(
    "data-ftt-advertising-consent",
    "unknown",
  );
}

/** Notify listeners (AnalyticsGate) that the consent decision changed. */
export function notifyConsentChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}
