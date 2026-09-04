"use client";

import { Download, ExternalLink, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoredDrapeRender } from "@/lib/drape-room/client/storage";
import { DRAPE_ROOM_AI_DISCLAIMER } from "./drape-room-copy";
import { DRAPE_ROOM_BACKGROUNDS } from "./types";

export interface DrapeRoomCachedPreview {
  render: StoredDrapeRender;
  previewUrl: string;
}

export function DrapeRoomCachedGallery({
  open,
  previews,
  currentPhotoDigest,
  onClose,
  onSave,
  onVisit,
}: {
  open: boolean;
  previews: readonly DrapeRoomCachedPreview[];
  currentPhotoDigest: string;
  onClose: () => void;
  onSave: (preview: DrapeRoomCachedPreview) => void;
  onVisit: (productSlug: string) => void;
}) {
  const currentPreviews = previews.filter(
    ({ render }) => render.userPhotoDigest === currentPhotoDigest,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="@container bottom-0 left-[50%] top-auto z-[100] flex h-[96dvh] max-h-[96%] w-full max-w-none translate-x-[-50%] translate-y-0 flex-col gap-0 overflow-hidden rounded-t-[1.75rem] border-ftt-border bg-ftt-ivory p-0 text-ftt-navy shadow-[0_-24px_70px_rgba(14,13,14,0.24)] motion-reduce:animate-none motion-reduce:transition-none max-sm:pl-[env(safe-area-inset-left)] max-sm:pr-[env(safe-area-inset-right)] sm:bottom-[4dvh] sm:top-auto sm:h-[92dvh] sm:max-h-[92%] sm:max-w-[min(64rem,calc(100vw-2rem))] sm:translate-y-0 sm:rounded-[1.75rem]"
        aria-describedby="drape-room-cached-description"
      >
        <header className="shrink-0 border-b border-ftt-border bg-ftt-card/95 px-4 py-4 pr-16 backdrop-blur @sm:px-6 @sm:pr-16">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ftt-navy text-ftt-gold">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/65">
                Browser-local · Read only
              </p>
              <DialogTitle className="mt-1 font-serif text-2xl leading-tight">
                Saved Drape Room previews
              </DialogTitle>
              <DialogDescription
                id="drape-room-cached-description"
                className="mt-1 text-xs leading-5 text-ftt-burgundy/70"
              >
                This saved-preview view is read-only. Existing previews stay
                available only in this browser. To create another, choose Drape
                Room on an eligible saree when generation is available.
              </DialogDescription>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] @sm:p-6">
          <p className="rounded-2xl border border-ftt-gold/25 bg-ftt-gold/8 p-3 text-[11px] leading-5 text-ftt-burgundy/80">
            {DRAPE_ROOM_AI_DISCLAIMER}
          </p>

          <div className="mt-4 grid gap-5 @3xl:grid-cols-2">
            {currentPreviews.map((preview) => (
              <article
                key={preview.render.cacheKey}
                className="overflow-hidden rounded-[1.4rem] border border-ftt-border bg-ftt-card shadow-[0_16px_44px_rgba(20,29,70,0.1)]"
              >
                <div className="relative aspect-3/4 bg-ftt-navy/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.previewUrl}
                    alt={`Saved AI preview of ${preview.render.productName} in a Classic Nivi drape`}
                    className="size-full object-contain"
                  />
                  <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-ftt-navy/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ftt-ivory backdrop-blur">
                    AI preview · {backgroundLabel(preview.render.background)}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60">
                    Classic Nivi · Saved in this browser
                  </p>
                  <h2 className="mt-1 text-balance font-serif text-xl leading-tight">
                    {preview.render.productName}
                  </h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onSave(preview)}
                      className="min-h-11 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy"
                    >
                      <Download aria-hidden="true" /> Save image
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onVisit(preview.render.productSlug)}
                      className="min-h-11 rounded-xl bg-ftt-burgundy text-ftt-ivory hover:bg-ftt-navy"
                    >
                      <ExternalLink aria-hidden="true" /> Visit product
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function backgroundLabel(background: StoredDrapeRender["background"]): string {
  return (
    DRAPE_ROOM_BACKGROUNDS.find((option) => option.id === background)?.label ??
    background
  );
}
