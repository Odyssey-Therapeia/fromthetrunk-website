/**
 * Google Tag Manager configuration helpers.
 *
 * GTM is loaded through a hand-rolled, consent-gated loader
 * (`components/analytics/gtm-loader.tsx`) — NOT the standard unconditional
 * snippet and NOT `@next/third-parties`. It only loads when:
 *   1. `NEXT_PUBLIC_GTM_ID` is configured, and
 *   2. the visitor has accepted analytics consent (see `lib/analytics/consent.ts`).
 *
 * GA4 is configured INSIDE the GTM container (no client-side gtag.js here).
 * Server-side GA4 Measurement Protocol (`lib/adapters/ga4-sink.ts`) remains the
 * source of truth for `purchase`; do not duplicate purchase client-side.
 */

/** True when a GTM container id is configured (non-empty). */
export function shouldRenderGtm(gtmId: string | undefined): boolean {
  return Boolean(gtmId);
}

/** Canonical gtm.js URL for a given container id. */
export function buildGtmSrc(gtmId: string): string {
  return `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
}

/**
 * The configured GTM container id, or undefined when analytics is disabled.
 *
 * `NEXT_PUBLIC_GTM_ID` is inlined at build time by Next.js, so this reads
 * correctly on both server and client.
 */
export function getGtmId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_GTM_ID;
  return id && id.trim().length > 0 ? id : undefined;
}
