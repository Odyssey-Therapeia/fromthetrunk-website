"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  drapeLaunchConfig,
  isDrapeLaunchExcludedRoute,
} from "@/lib/drape-room/launch/config";
import {
  clearDrapeTeaserSeen,
  hasSeenDrapeTeaser,
  markDrapeTeaserSeen,
} from "@/lib/drape-room/launch/storage";

export type DrapeLaunchState = "dismissed" | "eligible" | "idle" | "open";
export type DrapeLaunchTrigger = "gallery" | "manual" | "scroll" | "timer";

type UseDrapeLaunchTriggerOptions = {
  /** False when the product is not Drape Room eligible, or context is missing. */
  enabled: boolean;
  /** Distinct gallery indices the shopper has viewed so far. Omit where there
   * is no gallery, such as the catalogue. */
  viewedGalleryCount?: number;
  /** Overrides the dwell threshold. Defaults to the product-page value. */
  dwellMs?: number;
  onAutoOpen?: (trigger: Exclude<DrapeLaunchTrigger, "manual">) => void;
};

/**
 * True while another major overlay owns the screen.
 *
 * This repo has no global overlay registry: every overlay except the Drape Room
 * holds its own local state. What they DO share is Radix, which marks the body
 * while any dialog/sheet is open. Reading that mark is the one non-fragile
 * signal available, and it covers the cart drawer, search, and every other
 * Radix surface at once.
 */
function anotherOverlayIsOpen(): boolean {
  if (typeof document === "undefined") return false;
  const body = document.body;
  if (body.hasAttribute("data-scroll-locked")) return true;
  if (body.style.pointerEvents === "none") return true;
  return competingOverlayIsOpen();
}

/**
 * The same question asked while OUR dialog is open.
 *
 * The teaser is itself a Radix dialog, so it sets the body marks above and
 * matches the open-dialog selector. Only a dialog that is not ours counts, or
 * the teaser would detect itself and close a moment after opening.
 */
function competingOverlayIsOpen(): boolean {
  if (typeof document === "undefined") return false;
  // Any dialog that is not ours counts. Radix surfaces carry
  // data-state="open"; hand-rolled ones such as the welcome popup only set
  // role="dialog", so match on the role and exclude the closed Radix case.
  const dialogs = document.querySelectorAll(
    "[role='dialog']:not([data-ftt-drape-teaser])",
  );
  for (const dialog of dialogs) {
    if (dialog.getAttribute("data-state") === "closed") continue;
    return true;
  }
  return false;
}

/** True while the shopper is typing or working a form control. */
function shopperIsBusy(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (active as HTMLElement).isContentEditable === true
  );
}

/**
 * Owns the whole auto-open decision: three OR-ed triggers, the once-per-tab
 * rule, route exclusion, and overlay/typing deferral.
 */
export function useDrapeLaunchTrigger({
  enabled,
  viewedGalleryCount = 0,
  dwellMs = drapeLaunchConfig.trigger.dwellMs,
  onAutoOpen,
}: UseDrapeLaunchTriggerOptions) {
  const pathname = usePathname();
  const excluded = isDrapeLaunchExcludedRoute(pathname);
  const active = enabled && !excluded;

  const [state, setState] = useState<DrapeLaunchState>("idle");
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const armedRef = useRef(false);

  /**
   * Auto-open, subject to every guard. Marks the session immediately so a
   * second product page in the same tab cannot open automatically.
   */
  const requestAutoOpen = useCallback(
    (trigger: Exclude<DrapeLaunchTrigger, "manual">) => {
      if (!active || armedRef.current) return;
      if (hasSeenDrapeTeaser()) {
        armedRef.current = true;
        return;
      }
      if (anotherOverlayIsOpen() || shopperIsBusy()) return;

      armedRef.current = true;
      markDrapeTeaserSeen();
      setHasAutoOpened(true);
      setState("open");
      onAutoOpen?.(trigger);
    },
    [active, onAutoOpen],
  );

  // Trigger 1 — dwell time. Paused while the tab is hidden, and retried on a
  // short interval so an overlay or a focused input only postpones the open.
  useEffect(() => {
    if (!active || armedRef.current) return;

    let elapsed = 0;
    let last = Date.now();
    const step = 250;

    const tick = window.setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (document.visibilityState !== "visible") return;
      elapsed += delta;
      if (elapsed < dwellMs) return;
      requestAutoOpen("timer");
    }, step);

    const resync = () => {
      last = Date.now();
    };
    document.addEventListener("visibilitychange", resync);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [active, dwellMs, requestAutoOpen]);

  // Trigger 2 — two distinct gallery images. The count is owned by the caller,
  // which observes the gallery's own index callback rather than the DOM.
  useEffect(() => {
    if (!active || armedRef.current) return;
    if (viewedGalleryCount < drapeLaunchConfig.trigger.distinctGalleryImages) {
      return;
    }
    const settle = window.setTimeout(
      () => requestAutoOpen("gallery"),
      drapeLaunchConfig.trigger.idleDelayMs,
    );
    return () => window.clearTimeout(settle);
  }, [active, requestAutoOpen, viewedGalleryCount]);

  // Trigger 3 — scroll depth, rAF-throttled.
  useEffect(() => {
    if (!active || armedRef.current) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      // A page shorter than the viewport can never reach the threshold.
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable >= drapeLaunchConfig.trigger.scrollProgress) {
        requestAutoOpen("scroll");
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active, requestAutoOpen]);

  // A major overlay opening while the teaser is up suspends the teaser rather
  // than stacking two layers — two modals would fight over focus and pointer
  // input. The shopper never read it, so the once-per-tab budget is handed
  // back and the triggers re-arm for after the other overlay closes.
  useEffect(() => {
    if (state !== "open") return;
    const guard = window.setInterval(() => {
      if (!competingOverlayIsOpen()) return;
      clearDrapeTeaserSeen();
      armedRef.current = false;
      setHasAutoOpened(false);
      setState("idle");
    }, 200);
    return () => window.clearInterval(guard);
  }, [state]);

  const openManually = useCallback(() => setState("open"), []);
  const dismiss = useCallback(() => {
    setState((current) => (current === "open" ? "dismissed" : current));
  }, []);

  return {
    /** Render the teaser only while this is "open". */
    state,
    isOpen: state === "open" && !excluded,
    /** The persistent button appears once the teaser has been seen. */
    showPersistentButton: active && (hasAutoOpened || state === "dismissed"),
    excluded,
    openManually,
    dismiss,
  };
}
