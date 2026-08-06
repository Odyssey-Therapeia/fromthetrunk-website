"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import type { LatestReel } from "@/lib/social/latest-reel";

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
 * show normally. The welcome popup is independent and not gated.
 */
export function SiteWidgets() {
  const pathname = usePathname();
  const [heroPassed, setHeroPassed] = useState(false);
  const [latestReel, setLatestReel] = useState<LatestReel | null>(null);
  const [widgetsReady, setWidgetsReady] = useState(false);
  const shouldRenderReel = pathname === "/" && heroPassed && latestReel;

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
      {widgetsReady ? <WelcomePopup /> : null}
      {widgetsReady && heroPassed ? (
        <>
          <FloatingWhatsApp />
          {shouldRenderReel ? <FloatingReel reel={latestReel} /> : null}
        </>
      ) : null}
    </>
  );
}
