"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import {
  Building2,
  CakeSlice,
  Check,
  HeartHandshake,
  LoaderCircle,
  PartyPopper,
  Info,
  Sparkles,
} from "lucide-react";

import type { DrapeRoomBackground } from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { cn } from "@/lib/utils";
import {
  DRAPE_ROOM_AI_DISCLAIMER,
  DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE,
} from "./drape-room-copy";
import { DrapeRoomResultActions } from "./drape-room-result-actions";
import { DRAPE_ROOM_BACKGROUNDS, type DrapeRoomResult } from "./types";

const BACKGROUND_ICONS = {
  studio: Building2,
  festival: Sparkles,
  wedding: HeartHandshake,
  party: PartyPopper,
  birthday: CakeSlice,
} satisfies Record<
  DrapeRoomBackground,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
>;

export interface DrapeRoomResultViewProps {
  product: DrapeSaree;
  result: DrapeRoomResult;
  activeBackground: DrapeRoomBackground;
  cachedBackgrounds: ReadonlySet<DrapeRoomBackground>;
  generationAvailable: boolean;
  remainingGenerations?: 0 | 1 | 2 | 3;
  generationBlockedReason?: string | null;
  isGenerating: boolean;
  isCacheChecking: boolean;
  wishlistControl?: ReactNode;
  addToCartControl?: ReactNode;
  onBackgroundSelect: (background: DrapeRoomBackground) => void;
  onSave: () => void;
  onVisit: () => void;
  onRegenerate: () => void;
}

export function DrapeRoomResultView({
  product,
  result,
  activeBackground,
  cachedBackgrounds,
  generationAvailable,
  remainingGenerations = 3,
  generationBlockedReason,
  isGenerating,
  isCacheChecking,
  wishlistControl,
  addToCartControl,
  onBackgroundSelect,
  onSave,
  onVisit,
  onRegenerate,
}: DrapeRoomResultViewProps) {
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[54rem] gap-4 overflow-x-clip p-4 pb-0 @sm:p-5 @sm:pb-0 @3xl:grid-cols-[minmax(16rem,0.94fr)_minmax(19rem,1.06fr)] @3xl:gap-5">
      <div className="min-w-0">
        <div className="relative mx-auto aspect-3/4 w-full max-w-sm overflow-hidden rounded-[1.3rem] border border-ftt-border bg-ftt-navy/5 shadow-[0_18px_48px_rgba(20,29,70,0.11)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.previewUrl}
            alt={`AI preview of ${product.productName} in a Classic Nivi drape`}
            className="size-full object-contain"
          />
          <div className="absolute left-3 top-3 rounded-full border border-white/25 bg-ftt-navy/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-ivory backdrop-blur">
            AI preview · {backgroundLabel(activeBackground)}
          </div>
          <div className="absolute bottom-3 left-3 rounded-full border border-white/20 bg-ftt-navy/80 px-3 py-1.5 text-[10px] font-semibold text-ftt-ivory backdrop-blur">
            Saved in this browser
          </div>
          {isGenerating ? (
            <div
              role="status"
              className="absolute inset-0 grid place-items-center bg-ftt-navy/55 text-center text-ftt-ivory backdrop-blur-sm"
            >
              <div>
                <LoaderCircle
                  className="mx-auto size-7 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  Creating a new preview…
                </p>
                <p className="mt-1 text-xs text-ftt-ivory/75">
                  Your current image stays safe until this succeeds.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-ftt-navy/5">
            <Image
              src={product.displayImageUrl}
              alt={product.productName}
              fill
              unoptimized
              sizes="64px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/60">
              Classic Nivi · {backgroundLabel(activeBackground)}
            </p>
            <h2 className="mt-1 text-balance font-serif text-2xl leading-tight">
              {product.productName}
            </h2>
          </div>
        </div>

        <DrapeRoomBackgroundPicker
          selected={activeBackground}
          cachedBackgrounds={cachedBackgrounds}
          generationAvailable={generationAvailable}
          disabled={isGenerating || isCacheChecking}
          onSelect={onBackgroundSelect}
        />

        {!generationAvailable || generationBlockedReason ? (
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="rounded-2xl border border-ftt-gold/30 bg-ftt-gold/10 p-3 text-xs leading-5 text-ftt-burgundy/80"
          >
            {generationBlockedReason ?? DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        <details className="group rounded-2xl border border-ftt-gold/25 bg-ftt-gold/8 p-3 text-ftt-burgundy/80">
          <summary className="flex cursor-pointer list-none items-start gap-2 text-[11px] leading-5 marker:content-none">
            <Info className="mt-0.5 size-4 shrink-0 text-ftt-gold" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-ftt-burgundy">AI preview</strong> — colour, pleats, border, pallu, blouse and fit may vary. Original product photos remain the source of truth.
            </span>
          </summary>
          <p className="mt-2 border-t border-ftt-gold/20 pt-2 text-[10px] leading-5">
            {DRAPE_ROOM_AI_DISCLAIMER}
          </p>
        </details>

        <DrapeRoomResultActions
          isBusy={isGenerating}
          generationDisabled={isCacheChecking || !generationAvailable}
          remainingGenerations={remainingGenerations}
          wishlistControl={wishlistControl}
          addToCartControl={addToCartControl}
          onSave={onSave}
          onVisitProduct={onVisit}
          onRegenerate={onRegenerate}
        />
      </div>
    </div>
  );
}

function DrapeRoomBackgroundPicker({
  selected,
  cachedBackgrounds,
  generationAvailable,
  disabled,
  onSelect,
}: {
  selected: DrapeRoomBackground;
  cachedBackgrounds: ReadonlySet<DrapeRoomBackground>;
  generationAvailable: boolean;
  disabled: boolean;
  onSelect: (background: DrapeRoomBackground) => void;
}) {
  return (
    <div className="min-w-0 max-w-full">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/60">
        Change background
      </p>
      <div
        role="group"
        aria-label="Choose a Drape Room background"
        className="-mx-1 mt-3 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 @3xl:grid @3xl:grid-cols-5 @3xl:overflow-visible"
      >
        {DRAPE_ROOM_BACKGROUNDS.map((background) => {
          const Icon = BACKGROUND_ICONS[background.id];
          const cached = cachedBackgrounds.has(background.id);
          return (
            <button
              key={background.id}
              type="button"
              data-drape-background={background.id}
              aria-pressed={selected === background.id}
              disabled={disabled || (!cached && !generationAvailable)}
              onClick={() => onSelect(background.id)}
              className={cn(
                "relative min-h-14 min-w-28 shrink-0 rounded-xl border px-3 py-2 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold disabled:opacity-50 @3xl:min-w-0",
                selected === background.id
                  ? "border-ftt-navy bg-ftt-navy text-ftt-ivory"
                  : "border-ftt-border bg-ftt-card text-ftt-navy",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {selected === background.id ? (
                  <Check className="size-3" aria-label="Selected" />
                ) : cached ? (
                  <Check
                    className="size-3"
                    aria-label="Saved in this browser"
                  />
                ) : null}
              </span>
              <span className="mt-2 block">{background.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function backgroundLabel(background: DrapeRoomBackground): string {
  return (
    DRAPE_ROOM_BACKGROUNDS.find((option) => option.id === background)?.label ??
    background
  );
}
