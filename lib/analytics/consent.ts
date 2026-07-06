/**
 * Consent state — persisted in a first-party cookie the user explicitly controls.
 *
 * Values:
 *   - "all": user accepted all tracking (PostHog + GA4)
 *   - "essential": user declined non-essential tracking
 *
 * Default BEFORE the user chooses: treated as "essential" (opt-in model).
 * PostHog/GA4 scripts and the PostHog mirror only run when consent === "all".
 *
 * Framework-agnostic: copyable to TFC/Manifold.
 */
export const CONSENT_COOKIE = "ftt_consent";
export type ConsentValue = "all" | "essential";

export function parseConsent(raw: string | undefined): ConsentValue {
  return raw === "all" ? "all" : "essential";
}
