"use client";

/**
 * A small popover pointing at one product card's Drape Room button.
 *
 * Deliberately not a dialog: it teaches where a control is, so it must leave
 * that control reachable. Focus is not trapped and the page stays scrollable.
 * The page around the button is dimmed by a separate, pointer-transparent
 * spotlight — a lesson that blocked the very tap it asks for would be absurd.
 */

import { Sparkles } from "lucide-react";

import { PopoverContent } from "@/components/ui/popover";
import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";
import { cn } from "@/lib/utils";

export function DrapeCardCoachmark({
  onDismiss,
  onTryThis,
}: {
  onDismiss: () => void;
  onTryThis: () => void;
}) {
  const copy = drapeLaunchConfig.coachmarkCopy;

  return (
    <PopoverContent
      side="top"
      align="end"
      sideOffset={14}
      collisionPadding={12}
      // A lesson about a button must not steal focus from it.
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      // Open is controlled, so Radix cannot close itself: Escape has to be
      // routed to the same ending as "Got it" or it would do nothing at all.
      onEscapeKeyDown={onDismiss}
      className={cn(
        // Above the spotlight it is explaining.
        "z-[75] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border-ftt-gold/30",
        "bg-ftt-navy p-4 text-ftt-ivory shadow-[0_18px_50px_rgba(14,13,14,0.45)]",
        "motion-reduce:animate-none",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
        {copy.eyebrow}
      </p>

      <p className="mt-1.5 font-serif text-lg leading-tight text-ftt-ivory">
        {copy.heading}
      </p>

      <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-ftt-ivory/80">
        <Sparkles
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-ftt-gold"
        />
        <span>{copy.body}</span>
      </p>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 rounded-full px-3 text-xs font-semibold text-ftt-ivory/70 transition hover:text-ftt-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold"
        >
          {copy.secondaryCta}
        </button>
        <button
          type="button"
          onClick={onTryThis}
          className="min-h-9 rounded-full bg-ftt-gold px-4 text-xs font-semibold text-ftt-navy transition hover:bg-[#c9a463] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ftt-navy"
        >
          {copy.primaryCta}
        </button>
      </div>
    </PopoverContent>
  );
}
