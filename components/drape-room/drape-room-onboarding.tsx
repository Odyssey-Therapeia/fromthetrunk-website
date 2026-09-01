"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  LoaderCircle,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { DrapeRoomPhotoView } from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { cn } from "@/lib/utils";
import { DrapeRoomOnboardingStepLayout } from "./drape-room-onboarding-step-layout";
import { formatDrapeRoomPrice } from "./types";

export const DRAPE_ROOM_ONBOARDING_SLIDES = [
  { title: "Upload your photo" },
  { title: "Confirm your saree" },
  { title: "Set up your drape" },
] as const;

export type DrapeRoomOnboardingAction =
  | "completed"
  | "skipped"
  | "dismissed";

export interface DrapeRoomOnboardingProps {
  product: DrapeSaree;
  subjectPhoto: DrapeRoomPhotoView | null;
  isPhotoBusy?: boolean;
  photoMessage?: string | null;
  onPhotoSelect: (file: File) => Promise<void>;
  onComplete: (action: DrapeRoomOnboardingAction) => void;
}

export function DrapeRoomOnboardingProgress({
  currentStep,
}: {
  currentStep: 1 | 2 | 3;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/65">
        Step {currentStep} of 3
      </p>
      <ol
        aria-label="Drape Room introduction progress"
        className="mt-2 flex gap-2"
      >
        {DRAPE_ROOM_ONBOARDING_SLIDES.map((slide, index) => {
          const step = index + 1;
          return (
            <li key={slide.title}>
              <span
                aria-current={step === currentStep ? "step" : undefined}
                className={cn(
                  "block h-1.5 rounded-full motion-reduce:transition-none",
                  step === currentStep
                    ? "w-8 bg-ftt-burgundy"
                    : step < currentStep
                      ? "w-4 bg-ftt-gold"
                      : "w-4 bg-ftt-gold/30",
                )}
              >
                <span className="sr-only">Step {step} of 3</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DrapeRoomOnboarding({
  product,
  subjectPhoto,
  isPhotoBusy = false,
  photoMessage,
  onPhotoSelect,
  onComplete,
}: DrapeRoomOnboardingProps) {
  const inputId = React.useId();
  const [api, setApi] = React.useState<CarouselApi>();
  const [slideIndex, setSlideIndex] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    const update = () => setSlideIndex(api.selectedScrollSnap());
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  const jumpForReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const next = () => {
    if (slideIndex === 1) onComplete("completed");
    else api?.scrollNext(jumpForReducedMotion());
  };

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void onPhotoSelect(file);
  };

  return (
    <section
      aria-labelledby="drape-room-onboarding-title"
      className="flex min-h-0 flex-1 flex-col bg-ftt-ivory text-ftt-navy"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ftt-border bg-ftt-card/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-14 backdrop-blur @sm:px-6 @sm:pr-16">
        <DrapeRoomOnboardingProgress
          currentStep={(slideIndex + 1) as 1 | 2}
        />
        <button
          type="button"
          onClick={() => onComplete("skipped")}
          className="min-h-11 rounded-full px-3 text-sm font-semibold text-ftt-burgundy underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold"
        >
          Skip
        </button>
      </header>

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="peer sr-only"
        disabled={isPhotoBusy}
        onChange={choosePhoto}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Carousel
          setApi={setApi}
          opts={{ align: "start", containScroll: "trimSnaps" }}
          aria-label="Drape Room introduction"
          onKeyDownCapture={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              api?.scrollPrev(jumpForReducedMotion());
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              api?.scrollNext(jumpForReducedMotion());
            }
          }}
        >
          <CarouselContent className="items-start">
            <CarouselItem
              aria-label="Upload your photo, slide 1 of 3"
              aria-hidden={slideIndex !== 0}
              inert={slideIndex !== 0}
            >
              <DrapeRoomOnboardingStepLayout
                eyebrow="Private browser preparation"
                title="Upload your photo"
                titleId={
                  slideIndex === 0 ? "drape-room-onboarding-title" : undefined
                }
                media={
                  <div className="relative h-64 overflow-hidden rounded-[1.35rem] border border-dashed border-ftt-gold/45 bg-ftt-card @sm:h-72 @3xl:h-[22rem]">
                    {subjectPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={subjectPhoto.previewUrl}
                        alt="Your locally stored Drape Room photo"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center px-6 text-center text-ftt-burgundy/65">
                        <div>
                          <ImagePlus
                            className="mx-auto size-8"
                            aria-hidden="true"
                          />
                          <p className="mt-3 text-sm font-semibold">
                            Add one clear photo of your face
                          </p>
                        </div>
                      </div>
                    )}
                    {subjectPhoto ? (
                      <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-ftt-navy/85 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ftt-ivory backdrop-blur">
                        Stored in this browser
                      </span>
                    ) : null}
                    <label
                      htmlFor={inputId}
                      className="pointer-events-auto absolute bottom-3 right-3 z-30 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ftt-navy px-4 text-sm font-semibold text-ftt-ivory shadow-lg peer-focus-visible:ring-2 peer-focus-visible:ring-ftt-gold peer-focus-visible:ring-offset-2"
                    >
                      {isPhotoBusy ? (
                        <LoaderCircle
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : (
                        <Upload className="size-4" aria-hidden="true" />
                      )}
                      {subjectPhoto ? "Replace" : "Choose photo"}
                    </label>
                  </div>
                }
              >
                <p>
                  Use a well-lit photo with one clear visible face. Your body,
                  pose, framing, and background are optional.
                </p>
                <p className="mt-2">
                  Your browser resizes the image and removes EXIF/GPS data.
                  Nothing is sent while you are on this screen.
                </p>
                {photoMessage ? (
                  <p
                    aria-live="polite"
                    className="mt-3 rounded-xl bg-ftt-gold/10 px-3 py-2 text-xs font-medium text-ftt-burgundy"
                  >
                    {photoMessage}
                  </p>
                ) : null}
              </DrapeRoomOnboardingStepLayout>
            </CarouselItem>

            <CarouselItem
              aria-label="Confirm your saree, slide 2 of 3"
              aria-hidden={slideIndex !== 1}
              inert={slideIndex !== 1}
            >
              <DrapeRoomOnboardingStepLayout
                eyebrow="Selected for this preview"
                title="Confirm your saree"
                titleId={
                  slideIndex === 1 ? "drape-room-onboarding-title" : undefined
                }
                mobileMediaFirst
                media={
                  <div className="relative h-64 overflow-hidden rounded-[1.35rem] bg-ftt-navy/5 @sm:h-72 @3xl:h-[22rem]">
                    <Image
                      src={product.displayImageUrl}
                      alt={product.productName}
                      fill
                      unoptimized
                      sizes="(min-width: 768px) 22rem, calc(100vw - 3rem)"
                      className="object-cover"
                    />
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-ftt-navy/85 px-3 py-2 text-xs font-semibold text-ftt-ivory backdrop-blur">
                      <Check className="size-4" aria-hidden="true" /> Selected
                    </span>
                  </div>
                }
              >
                <div className="rounded-2xl border border-ftt-border bg-ftt-card p-4">
                  <p className="font-serif text-2xl leading-tight">
                    {product.productName}
                  </p>
                  <p className="mt-2 text-xs text-ftt-burgundy/70">
                    {product.fabric ?? "Fabric details on the product page"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ftt-burgundy">
                    {formatDrapeRoomPrice(product.pricePaise)}
                  </p>
                </div>
                <p className="mt-3">
                  This exact saree is already selected. Next opens the real
                  Classic Nivi setup—no image is generated automatically.
                </p>
              </DrapeRoomOnboardingStepLayout>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-ftt-border bg-ftt-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 @sm:px-6">
        <Button
          type="button"
          variant="ghost"
          disabled={slideIndex === 0}
          onClick={() => api?.scrollPrev(jumpForReducedMotion())}
          className="min-h-11 rounded-full text-ftt-burgundy"
        >
          <ArrowLeft aria-hidden="true" /> Back
        </Button>
        <Button
          type="button"
          onClick={next}
          className="min-h-11 rounded-full bg-ftt-navy px-6 text-ftt-ivory hover:bg-ftt-burgundy"
        >
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}
