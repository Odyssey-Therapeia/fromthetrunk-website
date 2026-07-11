/**
 * Global type augmentation for the Google Tag Manager dataLayer.
 *
 * GTM (and the GA4 tags configured inside it) read events from
 * `window.dataLayer`. The consent-gated loader in
 * `components/analytics/gtm-loader.tsx` bootstraps this array, and the helpers
 * in `lib/analytics/track.ts` push events onto it.
 */
export {};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}
