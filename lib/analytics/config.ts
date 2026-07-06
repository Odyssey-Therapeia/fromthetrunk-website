/**
 * Analytics configuration (PostHog primary, GA4/GTM secondary).
 *
 * All values are env-driven and fail safe to "disabled" when unset, so the
 * site never crashes because analytics secrets are missing. This module is
 * framework-agnostic and can be copied to other projects (TFC/Manifold).
 */

export const analyticsConfig = {
  posthog: {
    /** Public key — safe to expose (NEXT_PUBLIC_). Empty = PostHog disabled. */
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    /** Cloud host, defaults to PostHog Cloud (app.posthog.com). */
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
    /** Server-side only key for posthog-node (sinks). Empty = disabled. */
    serverKey: process.env.POSTHOG_KEY ?? "",
  },
  ga4: {
    measurementId: process.env.NEXT_PUBLIC_GA_ID ?? "",
  },
  gtm: {
    containerId: process.env.NEXT_PUBLIC_GTM_ID ?? "",
  },
} as const;

export function isPosthogEnabled(): boolean {
  return analyticsConfig.posthog.key.length > 0;
}

export function isPosthogServerEnabled(): boolean {
  return analyticsConfig.posthog.serverKey.length > 0;
}
