"use client";

import Script from "next/script";

import { getGtmId } from "@/lib/analytics/gtm";

/**
 * Loads the Google Tag Manager container.
 *
 * IMPORTANT: This component must only be MOUNTED after analytics consent has
 * been granted (see `AnalyticsGate`). It renders nothing when
 * `NEXT_PUBLIC_GTM_ID` is not configured, so GTM never loads without an id.
 *
 * We deliberately do NOT render a `<noscript>` iframe here — an unconditional
 * noscript would load GTM without consent. If a no-JS fallback is needed later,
 * render it server-side only when the consent cookie is present and granted.
 */
export function GtmLoader() {
  const gtmId = getGtmId();
  if (!gtmId) return null;

  return (
    <Script id="ftt-gtm-loader" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
    </Script>
  );
}
