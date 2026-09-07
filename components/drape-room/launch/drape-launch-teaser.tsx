"use client";

import Image from "next/image";
import { ShieldCheck, Sparkles, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";
import { cn } from "@/lib/utils";
import { DrapeLaunchMedia } from "./drape-launch-media";

const { copy } = drapeLaunchConfig;

export interface DrapeLaunchTeaserProps {
  open: boolean;
  /** Absent on the catalogue, where no saree has been selected yet. */
  product?: DrapeSaree | null;
  onDismiss: () => void;
  onPrimary: () => void;
}

/**
 * The product-page teaser: a compact centred dialog from `sm` up, a bottom
 * sheet below it. Built directly on the Radix dialog primitive the repo already
 * uses (components/ui/dialog.tsx wraps the same package) so focus trapping,
 * focus restore, Escape and scroll locking come for free, and it shares the
 * z-50 overlay layer rather than inventing a new stacking level.
 */
export function DrapeLaunchTeaser({
  open,
  product,
  onDismiss,
  onPrimary,
}: DrapeLaunchTeaserProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-ftt-midnight/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none!"
        />
        <DialogPrimitive.Content
          data-ftt-drape-teaser
          aria-labelledby="drape-teaser-heading"
          aria-describedby="drape-teaser-body"
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-ftt-border bg-ftt-ivory text-ftt-navy shadow-[0_28px_90px_rgba(20,29,70,0.28)]",
            "duration-200 motion-reduce:animate-none! motion-reduce:transition-none!",
            // Mobile: bottom sheet.
            "inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[1.6rem]",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4",
            // Tablet and up: compact centred card, never a takeover.
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(920px,calc(100vw-48px))] sm:max-h-[calc(100dvh-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.6rem]",
            "sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-bottom-2",
            // Two columns only once both halves stay readable.
            "lg:grid lg:grid-cols-[54%_46%]",
          )}
        >
          {/* Media. Fixed share of the sheet on mobile so the CTA is always
              reachable; a full column from lg up. */}
          {/* The portrait asset is used below the sm breakpoint and the
              landscape one above it, so the box tracks whichever is in play.
              lg keeps a 16:9 column, which is what the desktop frame is. */}
          <div className="relative min-w-0 shrink-0 overflow-hidden bg-ftt-navy aspect-3/4 max-h-[48dvh] [@media(max-height:680px)]:max-h-[38dvh] sm:aspect-video sm:max-h-[42dvh] lg:aspect-video lg:max-h-none lg:h-auto lg:self-center">
            <DrapeLaunchMedia />
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-7">
            {/* Reserved space on the right keeps the heading clear of the close
                button, which is the only absolutely positioned element here. */}
            <p className="pr-12 text-[10px] font-semibold uppercase tracking-[0.3em] text-ftt-gold">
              {copy.label}
            </p>
            <h2
              id="drape-teaser-heading"
              className="mt-1.5 pr-12 font-serif sm:mt-2 text-[clamp(1.5rem,1.15rem+1.6vw,2rem)] leading-tight text-balance text-ftt-navy"
            >
              {product ? copy.heading : copy.collectionHeading}
            </h2>

            {product ? (
              <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-ftt-border bg-ftt-card p-2 sm:mt-3 sm:p-2.5">
                <Image
                  src={product.displayImageUrl}
                  alt=""
                  width={44}
                  height={56}
                  className="h-14 w-11 shrink-0 rounded-lg object-cover"
                />
                <p className="min-w-0 text-xs leading-5 text-ftt-navy/80">
                  <span className="line-clamp-2 font-medium break-words">
                    {product.productName}
                  </span>
                  <span className="text-ftt-muted">{copy.selectedBadge}</span>
                </p>
              </div>
            ) : null}

            <p
              id="drape-teaser-body"
              className="mt-2 text-[13px] leading-5 text-ftt-muted break-words sm:mt-3 sm:text-sm sm:leading-6"
            >
              {product ? copy.body : copy.collectionBody}
            </p>

            <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-ftt-navy/80 sm:mt-4 sm:gap-y-2 xl:grid-cols-4">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 font-semibold text-ftt-gold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 break-words">{step}</span>
                </li>
              ))}
            </ol>

            <p className="mt-3 flex items-start gap-2 rounded-xl bg-ftt-card px-3 py-1.5 text-[11px] leading-4 text-ftt-muted sm:mt-4 sm:py-2 sm:leading-5">
              <ShieldCheck
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0 text-ftt-gold"
              />
              <span className="min-w-0 break-words">{copy.privacy}</span>
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row-reverse sm:items-center">
              <Button
                type="button"
                onClick={onPrimary}
                className="min-h-12 w-full rounded-full bg-ftt-navy text-ftt-ivory hover:bg-ftt-midnight sm:w-auto sm:flex-1"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {product ? copy.primaryCta : copy.collectionPrimaryCta}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onDismiss}
                className="min-h-11 w-full rounded-full text-ftt-burgundy hover:bg-ftt-gold/10 sm:w-auto"
              >
                {copy.secondaryCta}
              </Button>
            </div>

            <p className="mt-2 text-[10px] leading-4 text-ftt-muted break-words sm:mt-3">
              {copy.disclaimer}
            </p>
          </div>

          <DialogPrimitive.Close
            aria-label="Close The Drape Room preview"
            className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-ftt-ivory/90 text-ftt-burgundy backdrop-blur transition hover:bg-ftt-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold lg:right-4 lg:top-4"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
