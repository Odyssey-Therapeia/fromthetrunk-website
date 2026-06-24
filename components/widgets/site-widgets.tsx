"use client";

import type { LatestReel } from "@/lib/social/latest-reel";

import { FloatingReel } from "./floating-reel";
import { FloatingWhatsApp } from "./floating-whatsapp";
import { WelcomePopup } from "./welcome-popup";

/** Site-wide floating widgets, mounted once in the (site) layout. */
export function SiteWidgets({ latestReel }: { latestReel: LatestReel | null }) {
  return (
    <>
      <WelcomePopup />
      <FloatingWhatsApp />
      {latestReel ? <FloatingReel reel={latestReel} /> : null}
    </>
  );
}
