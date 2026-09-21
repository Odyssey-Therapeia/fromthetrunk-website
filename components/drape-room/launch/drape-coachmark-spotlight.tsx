"use client";

/**
 * Blurs and darkens the whole page except one Drape Room button.
 *
 * The button is not lifted, cloned or re-parented. Instead a single full-screen
 * blur layer is masked with a radial gradient whose centre is transparent, so
 * the layer is simply not painted over the button — the real control shows
 * through, sharp, in its real place, and stays that way as the page scrolls.
 *
 * The overlay is pointer-transparent from top to bottom. The lit button stays
 * tappable, the page stays scrollable, and a shopper who ignores the lesson
 * loses nothing.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Breathing room around the button so the ring is not flush against it. */
const PADDING_PX = 6;

type Rect = { height: number; left: number; top: number; width: number };

const sameRect = (a: Rect, b: Rect) =>
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.height === b.height;

export function DrapeCoachmarkSpotlight({
  target,
  onTargetLost,
}: {
  target: HTMLElement | null;
  /** The button scrolled out of view — a dark page lit on nothing helps nobody. */
  onTargetLost: () => void;
}) {
  const [rect, setRect] = useState<null | Rect>(null);

  /*
   * Held in a ref rather than an effect dependency: the effect writes state on
   * every scroll frame, so a caller passing a fresh closure each render would
   * make it tear itself down and rebuild on every one of those frames.
   */
  const onTargetLostRef = useRef(onTargetLost);
  useEffect(() => {
    onTargetLostRef.current = onTargetLost;
  }, [onTargetLost]);

  useEffect(() => {
    if (!target) return;

    let frame = 0;

    const sync = () => {
      frame = 0;
      const box = target.getBoundingClientRect();

      if (box.bottom <= 0 || box.top >= window.innerHeight) {
        onTargetLostRef.current();
        return;
      }

      const next: Rect = {
        top: box.top - PADDING_PX,
        left: box.left - PADDING_PX,
        width: box.width + PADDING_PX * 2,
        height: box.height + PADDING_PX * 2,
      };
      // Most scroll frames do not move the button relative to the viewport.
      setRect((current) => (current && sameRect(current, next) ? current : next));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    // Measured on the next frame rather than here: the grid may still be
    // laying out, and a synchronous first measure would cascade a render.
    schedule();

    // Captured, so scrolling inside any container moves the spotlight too.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [target]);

  // Null until an effect has measured, so the server renders nothing and
  // `document` is only touched in the browser.
  if (!target || !rect) return null;

  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) / 2;

  /*
   * Transparent inside the circle, opaque outside, with a single pixel of
   * feather so the rim is not aliased. The mask hides the blur layer over the
   * button rather than cutting a hole in anything the shopper can touch.
   */
  const hole = `radial-gradient(circle at ${centreX}px ${centreY}px, transparent ${radius}px, #000 ${radius + 1}px)`;

  return createPortal(
    <div
      aria-hidden="true"
      // Over the sticky header (z-50) and the grid, under the coach mark itself.
      className="pointer-events-none fixed inset-0 z-[70]"
    >
      <div
        className="absolute inset-0 backdrop-blur-[3px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
        style={{
          backgroundColor: "rgba(14,13,14,0.55)",
          maskImage: hole,
          WebkitMaskImage: hole,
        }}
      />
      <div
        className="absolute rounded-full ring-2 ring-ftt-gold shadow-[0_0_0_7px_rgba(179,145,82,0.22)]"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />
    </div>,
    document.body,
  );
}
