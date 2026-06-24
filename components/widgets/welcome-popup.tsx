"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WELCOME_SEEN_KEY = "ftt-welcome-seen-v1";
const SHOW_AFTER_MS = 20000; // 20s of browsing
const SCROLL_THRESHOLD_PX = 200;

/**
 * Warm welcome modal that appears once — after ~20s of browsing AND the visitor
 * has actually scrolled (so it lands while they're exploring, not on the hero).
 * Once dismissed it is remembered in localStorage and never shown again.
 */
export function WelcomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(WELCOME_SEEN_KEY)) return;

    let elapsed = false;
    let scrolled = window.scrollY > SCROLL_THRESHOLD_PX;
    let done = false;

    const reveal = () => {
      if (done || !elapsed || !scrolled) return;
      done = true;
      setOpen(true);
    };

    const onScroll = () => {
      if (window.scrollY > SCROLL_THRESHOLD_PX) scrolled = true;
      reveal();
    };

    const timer = window.setTimeout(() => {
      elapsed = true;
      reveal();
    }, SHOW_AFTER_MS);

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      // non-fatal in private mode
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent className="max-w-md rounded-3xl border-ftt-gold/30 bg-ftt-card text-center sm:rounded-3xl">
        <DialogHeader className="items-center text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
            Welcome to From the Trunk
          </p>
          <DialogTitle className="mt-2 font-serif text-3xl leading-tight text-ftt-navy">
            So glad you&apos;re here.
          </DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-7 text-ftt-burgundy/70">
            Every saree in our trunk is a pre-loved treasure — authenticated,
            cared for, and ready for its next chapter. Thank you for letting us
            be part of your story. ✨
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm leading-7 text-ftt-burgundy/70">
          This week, enjoy a{" "}
          <span className="font-semibold text-ftt-navy">
            complimentary styling consult
          </span>{" "}
          with every order.
        </p>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            asChild
            onClick={dismiss}
            className="rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight"
          >
            <Link href="/collection">Explore the collection</Link>
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs uppercase tracking-[0.18em] text-ftt-burgundy/50 transition hover:text-ftt-burgundy"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
