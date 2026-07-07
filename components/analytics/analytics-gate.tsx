"use client";

import { Suspense, useCallback, useSyncExternalStore } from "react";

import { ConsentBanner } from "@/components/analytics/consent-banner";
import { GtmLoader } from "@/components/analytics/gtm-loader";
import { GtmPageView } from "@/components/analytics/gtm-page-view";
import { useConsentBannerVariant } from "@/components/analytics/use-consent-banner-variant";
import {
  CONSENT_CHANGED_EVENT,
  notifyConsentChanged,
  readClientConsent,
  writeClientConsent,
  type ConsentState,
} from "@/lib/analytics/consent";
import { getGtmId } from "@/lib/analytics/gtm";

/** Subscribe to consent changes (our own setter dispatches the event). */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

/**
 * Client-side orchestrator for consent-gated analytics.
 *
 * Consent is read from a first-party cookie via `useSyncExternalStore`, which
 * is SSR-safe (server snapshot = "unknown") and avoids setState-in-effect. The
 * server render and first client paint both use "unknown"; after hydration the
 * real cookie value is applied, so returning visitors don't get a persistent
 * banner.
 *
 * - "granted": mounts GTM + the SPA page_view tracker.
 * - "unknown": shows the consent banner.
 * - "denied": renders nothing (no analytics loads).
 *
 * When `NEXT_PUBLIC_GTM_ID` is unset, renders nothing at all (no banner, no
 * scripts).
 */
export function AnalyticsGate() {
  const gtmConfigured = Boolean(getGtmId());

  const consent = useSyncExternalStore<ConsentState>(
    subscribe,
    readClientConsent,
    () => "unknown",
  );

  const setConsent = useCallback((state: Exclude<ConsentState, "unknown">) => {
    writeClientConsent(state);
    notifyConsentChanged();
  }, []);

  const accept = useCallback(() => setConsent("granted"), [setConsent]);
  const decline = useCallback(() => setConsent("denied"), [setConsent]);

  // No container id → analytics fully disabled (no banner, no scripts).
  if (!gtmConfigured) return null;

  if (consent === "granted") {
    return (
      <>
        <GtmLoader />
        <Suspense fallback={null}>
          <GtmPageView />
        </Suspense>
      </>
    );
  }

  if (consent === "unknown") {
    return <ConsentBannerHost onAccept={accept} onDecline={decline} />;
  }

  return null;
}

/**
 * Hosts the consent banner and computes its section-aware visual variant. Split
 * into its own component so the scroll/resize listener in
 * `useConsentBannerVariant` only runs while the banner is actually shown.
 */
function ConsentBannerHost({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const variant = useConsentBannerVariant();
  return (
    <ConsentBanner variant={variant} onAccept={onAccept} onDecline={onDecline} />
  );
}
