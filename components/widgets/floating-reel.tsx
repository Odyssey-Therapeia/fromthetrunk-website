"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Instagram, Volume2, VolumeX, X } from "lucide-react";

import type { LatestReel } from "@/lib/social/latest-reel";

const REEL_DISMISSED_KEY = "ftt-reel-dismissed";

/** Floating picture-in-picture player for the latest Instagram reel (bottom-left). */
export function FloatingReel({ reel }: { reel: LatestReel }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(REEL_DISMISSED_KEY)) return;
    const timer = window.setTimeout(() => setOpen(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(REEL_DISMISSED_KEY, "1");
    } catch {
      // non-fatal in private mode
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-6 left-5 z-55 w-34 overflow-hidden rounded-2xl border border-ftt-border bg-ftt-midnight shadow-[var(--ftt-soft-shadow)] print:hidden sm:w-40"
        >
          <div className="relative aspect-[9/16]">
            <video
              src={reel.videoUrl}
              poster={reel.poster || undefined}
              autoPlay
              muted={muted}
              loop
              playsInline
              className="size-full object-cover"
            />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
              <span className="rounded-full bg-black/40 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.15em] text-white backdrop-blur">
                Live reel
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close reel"
                className="grid size-6 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-1.5">
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? "Unmute" : "Mute"}
                className="grid size-6 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                {muted ? (
                  <VolumeX className="size-3.5" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
              </button>
              {reel.href ? (
                <a
                  href={reel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View on Instagram"
                  className="grid size-6 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
                >
                  <Instagram className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
