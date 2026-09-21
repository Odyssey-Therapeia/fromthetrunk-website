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
 * The per-URL ref guard prevents double fires from React re-renders, and is
 * only advanced once the Pixel has actually accepted the event — so a PageView
 * that arrives before `init` completes is retried rather than silently lost.
 *
 * Uses `useSearchParams`, so callers MUST wrap this in a <Suspense> boundary.
 */
export function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<null | string>(null);

  useEffect(() => {
    const qs = searchParams?.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (lastUrl.current === url) return;

    // False means there is nothing of ours to track: either the library has
    // not initialised yet, or a foreign (GTM) pixel owns the page and is
    // already reporting its own PageViews.
    if (!trackMetaPageView(window as unknown as MetaPixelWindow)) return;

    lastUrl.current = url;
  }, [pathname, searchParams]);

  return null;
}
