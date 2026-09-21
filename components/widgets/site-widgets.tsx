"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import type { LatestReel } from "@/lib/social/latest-reel";
import { canMountWelcomePopup } from "@/lib/widgets/welcome-popup-guard";

const OPTIONAL_WIDGET_DELAY_MS = 6500;

const FloatingReel = dynamic(
  () => import("./floating-reel").then((module) => module.FloatingReel),
  { ssr: false },
);
const FloatingWhatsApp = dynamic(
  () =>
    import("./floating-whatsapp").then((module) => module.FloatingWhatsApp),
  { ssr: false },
);
const WelcomePopup = dynamic(
  () => import("./welcome-popup").then((module) => module.WelcomePopup),
  { ssr: false },
);

/**
 * Site-wide floating widgets, mounted once in the (site) layout.
 *
 * The reel + WhatsApp are gated to the landing hero: on the homepage they stay
 * hidden while the hero (`#home-hero`) is on screen and only appear once it has
 * scrolled out of view. On every other route there is no `#home-hero`, so they
 * show normally.
 *
 * The welcome popup is an invitation, so it gives way to anything the shopper
 * is actually doing: it stays unmounted on sign-in, checkout and payment
 * routes, and while the Drape Room or the sign-in email dialog holds the modal
 * layer, so two modals never compete for focus or pointer input.
 */
export function SiteWidgets() {
  const pathname = usePathname();
  const drapeRoomPresentationOpen = useDrapeRoomOperationalStore(
    (state) => state.isOpen,
  );
  const commerceAuthDialogOpen = useCommerceAuth()?.isDialogOpen ?? false;
  const [heroPassed, setHeroPassed] = useState(false);
  const [latestReel, setLatestReel] = useState<LatestReel | null>(null);
  const [widgetsReady, setWidgetsReady] = useState(false);
  const shouldRenderReel = pathname === "/" && heroPassed && latestReel;
  const shouldRenderWelcomePopup =
    widgetsReady &&
    canMountWelcomePopup({
      commerceAuthDialogOpen,
      drapeRoomOpen: drapeRoomPresentationOpen,
      pathname,
    });

  useEffect(() => {
    const timer = window.setTimeout(
      () => setWidgetsReady(true),
      OPTIONAL_WIDGET_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!widgetsReady || pathname !== "/" || !heroPassed) return;
    if (latestReel) return;

    let cancelled = false;

    fetch("/api/v2/social/latest-reel", {
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LatestReel | null) => {
        if (!cancelled) setLatestReel(data);
      })
      .catch(() => {
        if (!cancelled) setLatestReel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [heroPassed, latestReel, pathname, widgetsReady]);

  useEffect(() => {
    const compute = () => {
      const hero = document.getElementById("home-hero");
      if (!hero) {
        setHeroPassed(pathname !== "/");
        return;
      }
      // Visible once the hero's bottom edge has (almost) left the top of the
      // viewport (96px ≈ the sticky header), i.e. the next section is on screen.
      setHeroPassed(hero.getBoundingClientRect().bottom <= 96);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [pathname]);

  return (
    <>
      {shouldRenderWelcomePopup ? <WelcomePopup /> : null}
      {widgetsReady && heroPassed ? (
        <>
          <FloatingWhatsApp />
          {shouldRenderReel ? <FloatingReel reel={latestReel} /> : null}
        </>
      ) : null}
    </>
  );
}
