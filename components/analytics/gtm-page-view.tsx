"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { trackPageView } from "@/lib/analytics/track";

/**
 * Fires a single `page_view` dataLayer event on every client route change
 * (including the first load). Mounted only after consent is granted.
 *
 * To avoid DUPLICATE page views, the GTM container must NOT also send an
 * automatic page_view from the GA4 Configuration tag — configure a GA4 Event
 * tag on the custom `page_view` event instead (see GTM setup notes). The
 * per-URL ref guard here prevents double fires from React re-renders.
 *
 * Uses `useSearchParams`, so callers MUST wrap this in a <Suspense> boundary.
 */
export function GtmPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<null | string>(null);

  useEffect(() => {
    const qs = searchParams?.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (lastUrl.current === url) return;
    lastUrl.current = url;

    trackPageView(url, document.title);
  }, [pathname, searchParams]);

  return null;
}
