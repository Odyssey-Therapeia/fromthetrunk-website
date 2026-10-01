"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { trackMetaPageView, type MetaPixelWindow } from "@/lib/analytics/meta-pixel";

/**
 * Fires a single Meta `PageView` on every client route change, including the
 * first load. Mounted only after consent is granted.
 *
 * This is the ONLY place a PageView is sent. Meta's stock snippet fires one
 * itself right after `init`, which is why `MetaPixelLoader` does not use that
 * snippet: an SPA would then report the landing page twice and every
 * subsequent navigation not at all.
 *
 * Each navigation gets one random event ID, retained if a later effect run
 * retries tracking after `init` completes. The sent flag prevents double fires
 * from React re-renders and Strict Mode effect replay. Returning to a previously
 * visited URL is a new navigation and gets a new ID.
 *
 * Uses `useSearchParams`, so callers MUST wrap this in a <Suspense> boundary.
 */
export function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageView = useRef<{
    url: string;
    eventId: string;
    sent: boolean;
  } | null>(null);

  useEffect(() => {
    const qs = searchParams?.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (!url) return;

    if (pageView.current?.url !== url) {
      pageView.current = { url, eventId: crypto.randomUUID(), sent: false };
    }
    if (pageView.current.sent) return;

    // False means there is nothing of ours to track: either the library has
    // not initialised yet, or a foreign (GTM) pixel owns the page and is
    // already reporting its own PageViews.
    pageView.current.sent = trackMetaPageView(
      window as unknown as MetaPixelWindow,
      pageView.current.eventId,
    );
  }, [pathname, searchParams]);

  return null;
}
