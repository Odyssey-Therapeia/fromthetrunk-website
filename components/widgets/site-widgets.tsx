"use client";

import { useEffect, useState } from "react";

import type { LatestReel } from "@/lib/social/latest-reel";

import { FloatingReel } from "./floating-reel";
import { FloatingWhatsApp } from "./floating-whatsapp";
import { WelcomePopup } from "./welcome-popup";

/**
 * Site-wide floating widgets, mounted once in the (site) layout.
 *
 * The reel + WhatsApp are gated to the landing hero: on the homepage they stay
 * hidden while the hero (`#home-hero`) is on screen and only appear once it has
 * scrolled out of view. On every other route there is no `#home-hero`, so they
 * show normally. The welcome popup is independent and not gated.
 */
export function SiteWidgets({ latestReel }: { latestReel: LatestReel | null }) {
  const [heroPassed, setHeroPassed] = useState(false);

  useEffect(() => {
    const compute = () => {
      const hero = document.getElementById("home-hero");
      if (!hero) {
        // No hero on this route → always visible.
        setHeroPassed(true);
        return;
      }
      // Visible once the hero's bottom edge has (almost) left the top of the
      // viewport (96px ≈ the sticky header), i.e. the next section is on screen.
      setHeroPassed(hero.getBoundingClientRect().bottom <= 96);
    };

    // Defer the first run out of the effect body, then track scroll + resize.
    const raf = requestAnimationFrame(compute);
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <>
      <WelcomePopup />
      {heroPassed ? (
        <>
          <FloatingWhatsApp />
          {latestReel ? <FloatingReel reel={latestReel} /> : null}
        </>
      ) : null}
    </>
  );
}
