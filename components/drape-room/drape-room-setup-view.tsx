"use client";

import Image from "next/image";
import { ImagePlus, LoaderCircle, Upload, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DrapeRoomStorageMode } from "@/lib/drape-room/client/storage";
import type {
  DrapeRoomConfigStatus,
  DrapeRoomPhotoView,
  PublicTryOnConfig,
} from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE } from "./drape-room-copy";
import { DrapeRoomPrivacyDisclosure } from "./drape-room-disclosure";
import { formatDrapeRoomPrice } from "./types";

export interface DrapeRoomSetupViewProps {
  product: DrapeSaree;
  config: PublicTryOnConfig | null;
  configStatus: DrapeRoomConfigStatus;
  generationAvailable: boolean;
  photoReady?: boolean;
  remainingGenerations?: 0 | 1 | 2 | 3;
  subjectPhoto: DrapeRoomPhotoView | null;
  consentAccepted: boolean;
  isGenerating: boolean;
  isPhotoBusy: boolean;
  isCacheChecking: boolean;
  storageMode: DrapeRoomStorageMode;
  uploadId: string;
  consentId: string;
  photoSelectedThisVisit: boolean;
  onPhotoSelect: (file: File) => Promise<void>;
  onAskReplace: () => void;
  onConsentChange: (accepted: boolean) => void;
  onCreate: () => void;
  onClear: () => void;
}

export function DrapeRoomSetupView({
  product,
  config,
  configStatus,
  generationAvailable,
  photoReady = true,
  remainingGenerations = 3,
  subjectPhoto,
  consentAccepted,
  isGenerating,
  isPhotoBusy,
  isCacheChecking,
  storageMode,
  uploadId,
  consentId,
  photoSelectedThisVisit,
  onPhotoSelect,
  onAskReplace,
  onConsentChange,
  onCreate,
  onClear,
}: DrapeRoomSetupViewProps) {
  const paidActionReady = Boolean(
    config && generationAvailable && photoReady && remainingGenerations > 0,
  );

  return (
    <div className="grid min-w-0 gap-4 p-4 pb-0 @sm:p-5 @sm:pb-0 @3xl:grid-cols-[minmax(15rem,0.92fr)_minmax(19rem,1.08fr)] @3xl:gap-5">
      <div className="min-w-0">
        <div className="grid grid-cols-2 gap-2 rounded-[1.3rem] border border-ftt-border bg-ftt-card p-2">
          <figure className="min-w-0">
            <div className="relative aspect-4/5 overflow-hidden rounded-[1rem] bg-ftt-burgundy/8">
              <Image
                src={product.displayImageUrl}
                alt={product.productName}
                fill
                unoptimized
                sizes="(min-width:768px) 15rem, 46vw"
                className="object-cover"
              />
            </div>
            <figcaption className="truncate px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy/65">
              Selected saree
            </figcaption>
          </figure>
          <figure className="min-w-0">
            <div className="relative grid aspect-4/5 place-items-center overflow-hidden rounded-[1rem] border border-dashed border-ftt-gold/45 bg-ftt-ivory">
              {subjectPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={subjectPhoto.previewUrl}
                  alt="Your locally stored Drape Room photo"
                  className="size-full object-cover"
                />
              ) : (
                <div className="px-3 text-center text-ftt-burgundy/60">
                  <ImagePlus className="mx-auto size-6" aria-hidden="true" />
                  <span className="mt-2 block text-[11px]">Add your photo</span>
                </div>
              )}
              {subjectPhoto ? (
                <span className="absolute left-2 top-2 rounded-full bg-ftt-navy/85 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-ftt-ivory">
                  Browser-local
                </span>
              ) : null}
            </div>
            <figcaption className="truncate px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy/65">
              Your photo
            </figcaption>
          </figure>
        </div>

        <input
          id={uploadId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="peer sr-only"
          tabIndex={subjectPhoto ? -1 : undefined}
          disabled={isPhotoBusy || isGenerating}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onPhotoSelect(file);
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {subjectPhoto ? (
            <Button
              type="button"
              variant="outline"
              onClick={onAskReplace}
              disabled={isPhotoBusy || isGenerating}
              className="min-h-11 rounded-full border-ftt-border bg-ftt-card text-ftt-burgundy"
            >
              <Upload aria-hidden="true" /> Change photo
            </Button>
          ) : (
            <label
              htmlFor={uploadId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ftt-navy px-5 text-sm font-semibold text-ftt-ivory peer-focus-visible:ring-2 peer-focus-visible:ring-ftt-gold peer-focus-visible:ring-offset-2"
            >
              <Upload aria-hidden="true" className="size-4" /> Choose photo
            </label>
          )}
          <p className="text-[11px] leading-4 text-ftt-burgundy/60">
            One clear visible face · body optional · max 15 MB
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <section className="rounded-[1.2rem] border border-ftt-border bg-ftt-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/60">
            Ready to preview
          </p>
          <h2 className="mt-1 line-clamp-2 font-serif text-2xl leading-tight">
            {product.productName}
          </h2>
          <p className="mt-1 text-xs text-ftt-burgundy/65">
            {product.fabric ?? "Fabric details on the product page"} ·{" "}
            {formatDrapeRoomPrice(product.pricePaise)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-ftt-navy/5 px-3 py-1.5 text-xs font-semibold">
              Classic Nivi
            </span>
            <span className="rounded-full bg-ftt-navy/5 px-3 py-1.5 text-xs font-semibold">
              Studio
            </span>
            {config ? (
              <span className="max-w-full truncate rounded-full border border-ftt-gold/25 bg-ftt-gold/8 px-3 py-1.5 text-xs font-semibold text-ftt-burgundy">
                {config.providerDisplayName} · {config.model}
              </span>
            ) : null}
          </div>
        </section>

        <DrapeRoomPrivacyDisclosure
          config={config}
          compact
          onClear={subjectPhoto ? onClear : undefined}
          clearDisabled={isGenerating}
        />

        {paidActionReady && config ? (
          <div className="flex items-start gap-3 rounded-2xl border border-ftt-border bg-ftt-card p-3">
            <Checkbox
              id={consentId}
              checked={consentAccepted}
              disabled={!subjectPhoto || !photoReady || isPhotoBusy || isGenerating}
              onCheckedChange={(checked) => onConsentChange(checked === true)}
              className="mt-0.5 data-[state=checked]:border-ftt-burgundy data-[state=checked]:bg-ftt-burgundy data-[state=checked]:text-ftt-ivory [&_svg]:text-ftt-ivory"
            />
            <label
              htmlFor={consentId}
              className="cursor-pointer text-xs leading-5 text-ftt-navy/75"
            >
              I have the right to use this photo and agree to send it to{" "}
              {config.providerDisplayName} for this AI preview.
            </label>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-20 col-span-full -mx-4 border-t border-ftt-border bg-ftt-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur @sm:-mx-5 @sm:px-5">
        {!generationAvailable ||
        remainingGenerations === 0 ||
        (subjectPhoto && !photoReady) ? (
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mb-2 rounded-xl border border-ftt-gold/30 bg-ftt-gold/10 px-3 py-2 text-xs leading-5 text-ftt-burgundy/80"
          >
            {remainingGenerations === 0
              ? "You have used today’s three previews for this saree. Your saved images remain available, and you can create more after midnight."
              : subjectPhoto && !photoReady
              ? isPhotoBusy
                ? "Checking your face locally. Your photo has not been sent."
                : "Choose a clear photo containing one visible face. Your body and pose are optional."
              : configStatus === "ready" && config
              ? "New AI generation is temporarily unavailable while this saree’s secure reference is completed. Your photo has not been sent."
              : DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          disabled={
            !subjectPhoto ||
            !paidActionReady ||
            !consentAccepted ||
            isGenerating ||
            isCacheChecking ||
            isPhotoBusy
          }
          onClick={onCreate}
          className="min-h-12 w-full rounded-full bg-ftt-burgundy text-ftt-ivory hover:bg-ftt-navy @3xl:mx-auto @3xl:max-w-sm"
        >
          {isGenerating || isCacheChecking ? (
            <LoaderCircle
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <WandSparkles aria-hidden="true" />
          )}
          {isGenerating
            ? "Creating your drape…"
            : isCacheChecking
              ? "Checking saved previews…"
              : photoSelectedThisVisit
                ? "Use photo and generate"
              : remainingGenerations === 0
                ? "Daily limit reached"
                : "Create my drape"}
        </Button>
        <p className="mt-1.5 text-center text-[10px] leading-4 text-ftt-burgundy/55">
          Only this button can start generation.{" "}
          {storageMode === "memory"
            ? "Browser storage is currently temporary."
            : "Exact cached results open without another request."}
        </p>
      </div>
    </div>
  );
}
