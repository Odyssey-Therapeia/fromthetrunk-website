"use client";

import { Suspense, useCallback, useSyncExternalStore } from "react";

import {
  ConsentBanner,
  type ConsentSelection,
} from "@/components/analytics/consent-banner";
import { GtmLoader } from "@/components/analytics/gtm-loader";
import { GtmPageView } from "@/components/analytics/gtm-page-view";
import { MetaPixelLoader } from "@/components/analytics/meta-pixel-loader";
import { MetaPixelPageView } from "@/components/analytics/meta-pixel-page-view";
import {
  CONSENT_CHANGED_EVENT,
  isAdvertisingAllowed,
  isAnalyticsAllowed,
  notifyConsentChanged,
  readConsentDecision,
  shouldShowConsentBanner,
  writeConsentDecision,
  type ConsentDecision,
} from "@/lib/analytics/consent";
import { getGtmId } from "@/lib/analytics/gtm";
import { getMetaPixelId } from "@/lib/analytics/meta-pixel";

/** Subscribe to consent changes (our own setter dispatches the event). */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

/**
 * The SSR snapshot: nothing decided, so the server renders no tag and no
 * banner. Frozen and reused because useSyncExternalStore compares snapshots by
 * identity and would loop on a fresh object every render.
 */
const SERVER_DECISION: ConsentDecision = Object.freeze({
  advertising: "unknown",
  analytics: "unknown",
  noticeVersion: null,
});

let cachedCookie: null | string = null;
let cachedDecision: ConsentDecision = SERVER_DECISION;

/**
 * Read the decision, returning the SAME object until document.cookie actually
 * changes. useSyncExternalStore requires a referentially stable snapshot.
 */
function getDecisionSnapshot(): ConsentDecision {
  if (typeof document === "undefined") return SERVER_DECISION;
  if (document.cookie !== cachedCookie) {
    cachedCookie = document.cookie;
    cachedDecision = readConsentDecision();
  }
  return cachedDecision;
}

/**
 * Client-side orchestrator for consent-gated analytics and advertising.
 *
 * Consent is read from first-party cookies via `useSyncExternalStore`, which is
 * SSR-safe (server snapshot = nothing decided) and avoids setState-in-effect.
 * The server render and first client paint both show no tags; after hydration
 * the real cookie values are applied, so returning visitors don't get a
 * persistent banner.
 *
 * Each vendor is gated on its OWN category and its own id, so neither can be
 * inferred from the other:
 *   - analytics granted   → Google Tag Manager + the SPA page_view tracker.
 *   - advertising granted → the Meta Pixel + its SPA PageView tracker.
 *
 * A visitor who accepted under the previous analytics-only notice keeps
 * analytics and gets NO Pixel, because their advertising cookie is absent and
 * "unknown" is never permission. See `shouldShowConsentBanner`.
 *
 * Withdrawing consent unmounts this subtree. That is enough to stop GTM, which
 * only reacts to dataLayer pushes, but not the Meta Pixel: fbevents.js stays in
 * memory, so `MetaPixelLoader` revokes Meta's consent in its effect cleanup.
 *
 * When NEITHER `NEXT_PUBLIC_GTM_ID` nor `NEXT_PUBLIC_META_PIXEL_ID` is set,
 * renders nothing at all (no banner, no scripts).
 */
export function AnalyticsGate() {
  const gtmConfigured = Boolean(getGtmId());
  const metaPixelConfigured = Boolean(getMetaPixelId());

  const decision = useSyncExternalStore<ConsentDecision>(
    subscribe,
    getDecisionSnapshot,
    () => SERVER_DECISION,
  );

  const save = useCallback((selection: ConsentSelection) => {
    writeConsentDecision({
      advertising: selection.advertising ? "granted" : "denied",
      analytics: selection.analytics ? "granted" : "denied",
    });
    notifyConsentChanged();
  }, []);

  const accept = useCallback(
    () => save({ advertising: true, analytics: true }),
    [save],
  );
  const decline = useCallback(
    () => save({ advertising: false, analytics: false }),
    [save],
  );

  // No tag configured at all → analytics fully disabled (no banner, no scripts).
  if (!gtmConfigured && !metaPixelConfigured) return null;

  const analyticsOn = gtmConfigured && isAnalyticsAllowed(decision);
  const advertisingOn = metaPixelConfigured && isAdvertisingAllowed(decision);

  return (
    <>
      {analyticsOn ? (
        <>
          <GtmLoader />
          <Suspense fallback={null}>
            <GtmPageView />
          </Suspense>
        </>
      ) : null}
      {advertisingOn ? (
        <>
          <MetaPixelLoader />
          <Suspense fallback={null}>
            <MetaPixelPageView />
          </Suspense>
        </>
      ) : null}
      {shouldShowConsentBanner(decision) ? (
        <ConsentBanner onAccept={accept} onDecline={decline} onSave={save} />
      ) : null}
    </>
  );
}
