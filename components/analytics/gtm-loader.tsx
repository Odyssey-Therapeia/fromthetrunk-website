"use client";

import Script from "next/script";
import { useEffect } from "react";

import { buildGtmSrc, getGtmId } from "@/lib/analytics/gtm";

/**
 * Loads the Google Tag Manager container.
 *
 * IMPORTANT: This component must only be MOUNTED after analytics consent has
 * been granted (see `AnalyticsGate`). It renders nothing when
 * `NEXT_PUBLIC_GTM_ID` is not configured, so GTM never loads without an id.
 *
 * CSP: there is NO inline `<Script>` here. The dataLayer is bootstrapped in a
 * useEffect and only the EXTERNAL gtm.js is loaded via `next/script src`, so the
 * loader does not depend on `script-src 'unsafe-inline'`. googletagmanager.com
 * must be allowlisted in `script-src` (see next.config.ts).
 *
 * We deliberately do NOT render a `<noscript>` iframe here — an unconditional
 * noscript would load GTM without consent. If a no-JS fallback is needed later,
 * render it server-side only when the consent cookie is present and granted.
 */
export function GtmLoader() {
  const gtmId = getGtmId();

  useEffect(() => {
    if (!gtmId || typeof window === "undefined") return;
    // Bootstrap the dataLayer + gtm.start marker before gtm.js executes. This is
    // an ordinary array push (not an inline <script>), so no 'unsafe-inline' is
    // required. GTM tolerates gtm.js loading before/after this push.
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  }, [gtmId]);

  if (!gtmId) return null;

  return (
    <Script
      id="google-tag-manager"
      src={buildGtmSrc(gtmId)}
      strategy="afterInteractive"
    />
  );
}
