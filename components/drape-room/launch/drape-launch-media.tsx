"use client";

import { useState } from "react";

import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";
import { cn } from "@/lib/utils";

const { media } = drapeLaunchConfig;

/**
 * Launch media for the teaser.
 *
 * Both files are ANIMATED AVIF image sequences (ISO ftyp brand `avis`). The
 * Next.js image optimiser re-encodes to a single still frame, so these are
 * served untouched from /public through a native <picture>. The browser picks
 * the source from the media query — no user-agent sniffing, and only the
 * matching file is fetched.
 *
 * No MP4/WebM equivalents exist for this campaign, so there is no audio track
 * and no playback control to offer.
 */
export function DrapeLaunchMedia({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // A neutral brand-tinted panel keeps the card's shape and the CTA usable.
    return (
      <div
        aria-hidden="true"
        className={cn(
          "h-full w-full bg-linear-to-br from-ftt-navy via-ftt-navy to-ftt-burgundy",
          className,
        )}
      />
    );
  }

  return (
    <picture>
      <source
        media={`(max-width: ${media.mobileMaxWidthPx}px)`}
        srcSet={media.mobile.src}
        width={media.mobile.width}
        height={media.mobile.height}
      />
      {/* Animated AVIF: next/image would flatten the sequence to one frame. */}
      <img
        src={media.desktop.src}
        alt={media.alt}
        width={media.desktop.width}
        height={media.desktop.height}
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        // contain, never cover: these frames carry branding and type at the
        // edges, so cropping to fill silently cuts the message.
        className={cn("h-full w-full object-contain object-center", className)}
      />
    </picture>
  );
}
