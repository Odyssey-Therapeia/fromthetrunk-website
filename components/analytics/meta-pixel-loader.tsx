"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import {
  detectExistingPixel,
  flushMetaPixelQueue,
  getMetaPixelId,
  initMetaPixel,
  META_PIXEL_SRC,
  revokeMetaPixelConsent,
  type MetaPixelWindow,
} from "@/lib/analytics/meta-pixel";

/**
 * Loads the Meta Pixel library.
 *
 * IMPORTANT: This component must only be MOUNTED after analytics consent has
 * been granted (see `AnalyticsGate`). It renders nothing when
 * `NEXT_PUBLIC_META_PIXEL_ID` is not configured, so the Pixel never loads
 * without an id.
 *
 * CSP: there is NO inline `<Script>` here. The `fbq` queue is bootstrapped in a
 * useEffect and only the EXTERNAL fbevents.js is loaded via `next/script src`,
 * so the loader does not depend on `script-src 'unsafe-inline'`.
 * connect.facebook.net must be allowlisted in `script-src` (see next.config.ts).
 *
 * We deliberately do NOT render Meta's `<noscript>` tracking image — an
 * unconditional beacon would report a visit without consent, which is the one
 * thing this gate exists to prevent.
 *
 * PageView is not fired here. `MetaPixelPageView` owns every PageView so the
 * first load and each client-side navigation are counted exactly once.
 */
export function MetaPixelLoader() {
  const pixelId = getMetaPixelId();

  /*
   * Whether to fetch fbevents.js at all, decided once at the first client
   * render. `AnalyticsGate` reads consent through useSyncExternalStore whose
   * server snapshot is always "unknown", so this subtree never renders on the
   * server and this initialiser has a real `window` to look at.
   *
   * A pixel that is already present belongs to someone else — in this codebase
   * that means a Meta Pixel tag inside the GTM container `GtmLoader` also
   * loads. Loading the library again on top of it buys nothing.
   */
  const [shouldLoadLibrary] = useState(() => {
    if (!pixelId || typeof window === "undefined") return false;
    return detectExistingPixel(window as unknown as MetaPixelWindow) !== "foreign";
  });

  useEffect(() => {
    if (!pixelId || typeof window === "undefined") return;
    const win = window as unknown as MetaPixelWindow;

    /*
     * The authoritative check. GTM loads asynchronously, so its Pixel tag may
     * land between the render above and this effect; re-checking here is what
     * actually prevents a second `init`, and therefore a doubled PageView.
     */
    const install = initMetaPixel(win, pixelId);

    if (install.status === "skipped-foreign") {
      console.warn(
        "[meta-pixel] A Meta Pixel is already installed on this page " +
          "(most likely a Google Tag Manager container tag). Skipping the " +
          "in-app Pixel so PageView is not counted twice. Remove one of the " +
          "two installations. Pixel ids seen: " +
          (install.pixelIds.length > 0 ? install.pixelIds.join(", ") : "unknown"),
      );
      return;
    }

    return () => {
      // Consent was withdrawn (AnalyticsGate unmounts this subtree) or the
      // visitor navigated away. Unmounting does not unload fbevents.js, so the
      // Pixel is told to stop sending rather than merely being forgotten.
      revokeMetaPixelConsent(win);
    };
  }, [pixelId]);

  if (!pixelId || !shouldLoadLibrary) return null;

  return (
    <Script
      id="meta-pixel"
      src={META_PIXEL_SRC}
      strategy="afterInteractive"
      onLoad={() => {
        /*
         * fbevents.js is meant to replay whatever the stub queued before it
         * arrived. In production it did not: it set `callMethod` and left the
         * init, the consent grant and every PageView sitting in the queue, so
         * nothing was ever sent. Flushing here makes the hand-off ours rather
         * than something we hope the vendor does.
         */
        flushMetaPixelQueue(window as unknown as MetaPixelWindow);
      }}
    />
  );
}
