/**
 * Analytics consent state.
 *
 * We use a strict "load-only-after-consent" model: GTM (and therefore GA4) is
 * NOT loaded at all until the visitor accepts. This is stricter than Google
 * Consent Mode's default-denied approach and keeps zero third-party scripts on
 * the page for visitors who have not opted in.
 *
 * The decision is persisted in a first-party cookie so it survives reloads and
 * is readable server-side (e.g. if a `<noscript>` GTM fallback is added later).
 * This module is framework-agnostic and safe to import from both server and
 * client code — the browser-only helpers guard on `document`.
 */

export const CONSENT_COOKIE = "ftt_analytics_consent";

/** Persist the decision for ~180 days. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Window event dispatched whenever the consent decision changes (accept,
 * reject, or reset via "Cookie settings"). `AnalyticsGate` listens for it and
 * re-reads the cookie, so the banner and GTM react without a page reload.
 */
export const CONSENT_CHANGED_EVENT = "ftt:consent-changed";

export type ConsentState = "granted" | "denied" | "unknown";

/** Normalise an arbitrary cookie value into a ConsentState. */
export function parseConsent(value: null | string | undefined): ConsentState {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "unknown";
}

/**
 * Read the current consent decision from the browser cookie.
 * Returns "unknown" during SSR or when no decision has been made.
 */
export function readClientConsent(): ConsentState {
  if (typeof document === "undefined") return "unknown";

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));

  if (!match) return "unknown";
  return parseConsent(decodeURIComponent(match.split("=")[1] ?? ""));
}

/**
 * Persist a consent decision to a first-party cookie (client-side).
 * SameSite=Lax, path=/, not HttpOnly (the banner must be able to write it).
 * This is not a secret.
 */
export function writeClientConsent(state: Exclude<ConsentState, "unknown">): void {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${state}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Clear the stored decision (client-side), returning the visitor to the
 * "unknown" state so the consent banner shows again. Used by the footer
 * "Cookie settings" control.
 */
export function clearClientConsent(): void {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/** Notify listeners (AnalyticsGate) that the consent decision changed. */
export function notifyConsentChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}
