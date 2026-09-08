"use client";

import { useCallback, useEffect, useId, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowRight,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";

const SLIDE_DURATION_MS = 6000;

const DRAPE_STEP_ICONS = {
  upload: Upload,
  consent: ShieldCheck,
  preview: Sparkles,
  delete: Trash2,
} as const;

type DrapeStepIcon = keyof typeof DRAPE_STEP_ICONS;

type HeroVisual = {
  desktopSrc: string;
  mobileSrc?: string;
  alt: string;
  className?: string;
};

type HeroLink = {
  label: string;
  href: string;
};

type BaseHeroSlide = {
  id: string;
  navigationLabel: string;
  eyebrow: string;
  visual?: HeroVisual;
};

export type CollectionHeroSlide = BaseHeroSlide & {
  type: "collection";
  title: readonly string[];
  description: string;
  livePieces: string | number;
  promise: string;
};

export type DrapeRoomHeroSlide = BaseHeroSlide & {
  type: "drape-room";
  titlePrefix: string;
  titleAccent: string;
  description: string;
  steps: readonly {
    label: string;
    icon: DrapeStepIcon;
  }[];
  primaryAction: HeroLink;
  secondaryAction?: HeroLink;
};

export type HomeHeroSlide = CollectionHeroSlide | DrapeRoomHeroSlide;

type HomeHeroCarouselProps = {
  slides: readonly HomeHeroSlide[];
  intervalMs?: number;
  prioritizeFirst?: boolean;
  className?: string;
};

export function HomeHeroCarousel({
  slides,
  intervalMs = SLIDE_DURATION_MS,
  prioritizeFirst = true,
  className,
}: HomeHeroCarouselProps) {
  const carouselId = useId();
  const slideCount = slides.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  /*
   * Clamped during render rather than corrected in an effect, so a slide
   * removed at runtime never paints a blank frame first.
   */
  const activeSlideIndex = activeIndex < slideCount ? activeIndex : 0;

  /*
   * Only the first banner is part of the initial paint. Later ones mount as
   * the carousel reaches them, which keeps them off the LCP path.
   */
  const mountSlide = useCallback((index: number) => {
    setMountedIndices((current) => {
      if (current.has(index)) return current;

      const next = new Set(current);
      next.add(index);
      return next;
    });
  }, []);

  const showSlide = useCallback(
    (index: number) => {
      mountSlide(index);
      setActiveIndex(index);
    },
    [mountSlide],
  );

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  /*
   * Timeouts rather than setInterval, so selecting a banner by hand restarts
   * the full dwell. The upcoming banner is mounted partway through that dwell
   * — late enough to stay off the critical path, early enough that the
   * transition never fades into an empty frame.
   */
  useEffect(() => {
    if (slideCount <= 1 || prefersReducedMotion || isPaused) return;

    const nextIndex = (activeSlideIndex + 1) % slideCount;
    const warmTimer = window.setTimeout(() => {
      mountSlide(nextIndex);
    }, intervalMs / 2);
    const advanceTimer = window.setTimeout(() => {
      showSlide(nextIndex);
    }, intervalMs);

    return () => {
      window.clearTimeout(warmTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [
    activeSlideIndex,
    intervalMs,
    isPaused,
    mountSlide,
    prefersReducedMotion,
    showSlide,
    slideCount,
  ]);

  if (slideCount === 0) {
    return null;
  }

  return (
    <section
      aria-label="From The Trunk highlights"
      aria-roledescription="carousel"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      className={cn(
        "relative isolate overflow-hidden",
        "rounded-[28px]",
        "bg-[#141D46] text-[#FDF7F1]",
        "shadow-[0_24px_70px_rgba(14,13,14,0.18)]",
        className,
      )}
    >
      {/* Soft brand-colour glow. This is not a border. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(circle_at_77%_36%,rgba(179,145,82,0.14),transparent_34%)]",
        )}
      />

      {/*
       * CSS grid lets every slide occupy the same cell.
       * The tallest slide determines the carousel height,
       * preventing layout jumps when the banner changes.
       */}
      <div className="relative grid">
        {slides.map((slide, index) => {
          const isActive = index === activeSlideIndex;
          const slideId = `${carouselId}-${slide.id}`;

          return (
            <article
              key={slide.id}
              id={slideId}
              aria-hidden={!isActive}
              data-active={isActive ? "true" : "false"}
              data-home-hero-slide={slide.id}
              className={cn(
                "col-start-1 row-start-1",
                "transition-[opacity,transform] duration-700 ease-out",
                "motion-reduce:transition-none",
                isActive
                  ? "z-10 translate-x-0 opacity-100"
                  : "pointer-events-none z-0 translate-x-4 opacity-0",
              )}
            >
              <div
                className={cn(
                  "grid min-h-[600px] grid-cols-1",
                  "sm:min-h-[640px]",
                  // Floor for the card itself, independent of the content. The
                  // tallest slide still wins, so this only trims dead navy.
                  "lg:min-h-[360px]",
                  "lg:grid-cols-[1.12fr_0.88fr]",
                )}
              >
                {slide.type === "collection" ? (
                  <CollectionSlideContent slide={slide} />
                ) : (
                  <DrapeRoomSlideContent slide={slide} isActive={isActive} />
                )}

                <HeroSlideVisual
                  visual={slide.visual}
                  isActive={isActive}
                  isMounted={mountedIndices.has(index)}
                  priority={prioritizeFirst && index === 0}
                  type={slide.type}
                />
              </div>
            </article>
          );
        })}
      </div>

      {slideCount > 1 ? (
        <CarouselControls
          carouselId={carouselId}
          slides={slides}
          activeIndex={activeSlideIndex}
          isPaused={isPaused}
          showPauseControl={!prefersReducedMotion}
          onSelect={showSlide}
          onTogglePause={() => {
            setIsPaused((currentValue) => !currentValue);
          }}
        />
      ) : null}
    </section>
  );
}

function CollectionSlideContent({ slide }: { slide: CollectionHeroSlide }) {
  return (
    <div
      className={cn(
        "order-2 flex flex-col justify-center",
        "px-6 pb-16 pt-6",
        "sm:px-9 sm:pb-16 sm:pt-8",
        "lg:order-1 lg:px-10 lg:py-7",
        "xl:px-12",
      )}
    >
      <HeroEyebrow>{slide.eyebrow}</HeroEyebrow>

      <h1
        className={cn(
          "mt-4 max-w-[620px]",
          "font-serif text-[36px] font-normal leading-[0.98]",
          "tracking-[-0.025em]",
          "text-[#FDF7F1]",
          "sm:text-[44px]",
          "lg:text-[48px]",
          "xl:text-[54px]",
        )}
      >
        {/*
         * Each line is its own block, so the explicit space is what keeps the
         * accessible name reading "Pre-Loved & Vintage Luxury Sarees" instead
         * of running the lines together.
         */}
        {slide.title.map((line, index) => (
          <span key={line} className="block">
            {index > 0 ? " " : null}
            {line}
          </span>
        ))}
      </h1>

      <p
        className={cn(
          "mt-4 max-w-[590px]",
          "text-[14px] leading-6 text-[#FDF7F1]/78",
          "sm:text-[15px]",
          "lg:max-w-[520px]",
        )}
      >
        {slide.description}
      </p>

      <div
        className={cn(
          "mt-7 grid max-w-[660px]",
          "grid-cols-[0.9fr_1.1fr] gap-3",
          "sm:gap-4",
        )}
      >
        <div
          className={cn(
            "rounded-[20px]",
            "bg-[#FDF7F1]/10",
            "px-4 py-4",
            "sm:px-5 sm:py-5",
          )}
        >
          <p className="text-[9px] uppercase tracking-[0.34em] text-[#FDF7F1]/60">
            Live pieces
          </p>

          <p className="mt-2 font-serif text-[36px] leading-none text-[#FDF7F1]">
            {slide.livePieces}
          </p>
        </div>

        <div
          className={cn(
            "rounded-[20px]",
            "bg-[#FDF7F1]/10",
            "px-4 py-4",
            "sm:px-5 sm:py-5",
          )}
        >
          <p className="text-[9px] uppercase tracking-[0.34em] text-[#FDF7F1]/60">
            Promise
          </p>

          <p className="mt-2 max-w-[230px] text-sm leading-5 text-[#FDF7F1]">
            {slide.promise}
          </p>
        </div>
      </div>
    </div>
  );
}

function DrapeRoomSlideContent({
  slide,
  isActive,
}: {
  slide: DrapeRoomHeroSlide;
  isActive: boolean;
}) {
  return (
    <div
      className={cn(
        "order-2 flex flex-col justify-center",
        "px-5 pb-8 pt-6",
        "sm:px-8 sm:pb-10 sm:pt-7",
        "lg:order-1 lg:px-10 lg:py-8 lg:pb-8 lg:pt-8",
        "xl:px-12",
      )}
    >
      <HeroEyebrow>{slide.eyebrow}</HeroEyebrow>

      <h2
        className={cn(
          "mt-4 max-w-[880px]",
          "font-serif font-normal leading-[0.95]",
          "tracking-[-0.035em]",
          "text-[clamp(2.1rem,3.5vw,3.9rem)]",
          "text-[#FDF7F1]",
        )}
      >
        {slide.titlePrefix}{" "}
        <em className="font-normal text-[#B39152]">{slide.titleAccent}</em>
      </h2>

      <p
        className={cn(
          "mt-3 max-w-[700px]",
          "font-serif text-[17px] leading-7",
          "text-[#FDF7F1]/90",
          "sm:text-[19px]",
        )}
      >
        {slide.description}
      </p>

      <div
        className={cn(
          "mt-6 grid grid-cols-2",
          "gap-x-4 gap-y-4",
          "xl:grid-cols-4 xl:gap-0",
        )}
      >
        {slide.steps.map((step, index) => {
          const Icon = DRAPE_STEP_ICONS[step.icon];

          if (!Icon) {
            throw new Error(
              `Invalid Drape Room icon "${step.icon}" for step "${step.label}".`,
            );
          }

          return (
            <div
              key={step.label}
              className={cn(
                "flex min-w-0 items-center gap-3",
                "xl:flex-col xl:justify-center xl:gap-3",
                "xl:px-4 xl:text-center",
                index > 0 && "xl:border-l xl:border-[#FDF7F1]/14",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center",
                  "rounded-full bg-[#FDF7F1]/7",
                  "text-[#B39152]",
                  "sm:size-11",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="size-[18px] sm:size-5"
                  strokeWidth={1.6}
                />
              </span>

              <span className="text-[13px] leading-5 text-[#FDF7F1] sm:text-sm">
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-6 flex flex-col gap-3",
          "sm:flex-row sm:items-center sm:gap-6",
        )}
      >
        <Link
          href={slide.primaryAction.href}
          tabIndex={isActive ? 0 : -1}
          className={cn(
            "group inline-flex min-h-12 items-center justify-center",
            "gap-3 rounded-full",
            "bg-[#601D1C] px-7",
            "font-serif text-[18px] text-[#FDF7F1]",
            "transition duration-300",
            "hover:bg-[#722523]",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#B39152]",
            "focus-visible:ring-offset-2",
            "focus-visible:ring-offset-[#141D46]",
            "sm:min-w-[280px] sm:text-[20px]",
          )}
        >
          <span>{slide.primaryAction.label}</span>

          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            strokeWidth={1.6}
          />
        </Link>

        {slide.secondaryAction ? (
          <Link
            href={slide.secondaryAction.href}
            tabIndex={isActive ? 0 : -1}
            className={cn(
              "group inline-flex items-center justify-center gap-3",
              "self-center pb-1",
              "font-serif text-[17px] text-[#B39152]",
              "transition-colors hover:text-[#D0B173]",
              "focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#B39152]",
              "sm:self-auto",
            )}
          >
            <span className="border-b border-current">
              {slide.secondaryAction.label}
            </span>

            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              strokeWidth={1.6}
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function HeroSlideVisual({
  visual,
  isActive,
  isMounted,
  priority,
  type,
}: {
  visual?: HeroVisual;
  isActive: boolean;
  isMounted: boolean;
  priority: boolean;
  type: HomeHeroSlide["type"];
}) {
  return (
    <div
      className={cn(
        "relative order-1 overflow-hidden",
        // The Drape Room banner is a 3:2 asset with no mobile crop, so a fixed
        // box letterboxed it and left a gap under the image. Matching its own
        // ratio removes the gap entirely; desktop is unaffected.
        type === "drape-room"
          ? "aspect-3/2 lg:aspect-auto"
          : "h-[230px] sm:h-[280px]",
        "lg:order-2",
        // The Drape Room visual opts out of the grid stretch and takes a fixed
        // height, so it renders smaller and stops padding out the row. The
        // collection collage still stretches, just to a shorter minimum.
        type === "drape-room"
          ? "lg:h-auto lg:overflow-visible"
          : "lg:h-auto lg:min-h-[380px]",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0",
          "bg-[radial-gradient(circle_at_54%_48%,rgba(179,145,82,0.12),transparent_48%)]",
        )}
      />

      {visual && isMounted ? (
        <>
          {visual.mobileSrc ? (
            <Image
              src={visual.mobileSrc}
              alt={isActive ? visual.alt : ""}
              fill
              priority={priority}
              loading={priority ? undefined : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              sizes="100vw"
              className={cn(
                "object-contain object-center",
                "lg:hidden",
                visual.className,
              )}
            />
          ) : null}

          <Image
            src={visual.desktopSrc}
            alt={isActive ? visual.alt : ""}
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            sizes="(max-width: 1023px) 100vw, 44vw"
            className={cn(
              type === "drape-room"
                ? "object-cover object-top lg:object-contain lg:object-bottom"
                : "object-contain object-center lg:object-top",
              visual.mobileSrc && "hidden lg:block",
              visual.className,
            )}
          />
        </>
      ) : (
        /*
         * Also the state a slide sits in before it is first shown, so an
         * unused banner never competes with the one on screen.
         */
        <div
          aria-hidden="true"
          data-hero-visual-placeholder
          className="absolute inset-0"
        />
      )}
    </div>
  );
}

function HeroEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <p
        className={cn(
          "text-[10px] font-medium uppercase",
          "tracking-[0.4em] text-[#B39152]",
          "sm:text-[11px]",
        )}
      >
        {children}
      </p>

      <span
        aria-hidden="true"
        className="h-px w-16 bg-[#B39152]/75 sm:w-20"
      />
    </div>
  );
}

function CarouselControls({
  carouselId,
  slides,
  activeIndex,
  isPaused,
  showPauseControl,
  onSelect,
  onTogglePause,
}: {
  carouselId: string;
  slides: readonly HomeHeroSlide[];
  activeIndex: number;
  isPaused: boolean;
  showPauseControl: boolean;
  onSelect: (index: number) => void;
  onTogglePause: () => void;
}) {
  return (
    <div
      className={cn(
        // Hidden on phones: the pill sat over the secondary link and there is
        // no room for it beside the CTA. Autoplay still runs; from lg up the
        // dots and the pause control are both available.
        "absolute bottom-4 left-1/2 z-30 hidden",
        "-translate-x-1/2 items-center gap-2",
        "rounded-full bg-[#0E0D0E]/35",
        "px-3 py-2 backdrop-blur-md",
        "lg:left-[78%] lg:flex",
      )}
    >
      {slides.map((slide, index) => {
        const isActive = activeIndex === index;

        return (
          <button
            key={slide.id}
            type="button"
            aria-label={`Show ${slide.navigationLabel}`}
            aria-current={isActive ? "true" : undefined}
            aria-controls={`${carouselId}-${slide.id}`}
            onClick={() => {
              onSelect(index);
            }}
            className={cn(
              "h-2 rounded-full",
              "transition-[width,background-color] duration-300",
              "focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#B39152]",
              "focus-visible:ring-offset-2",
              "focus-visible:ring-offset-[#141D46]",
              isActive
                ? "w-6 bg-[#B39152]"
                : "w-2 bg-[#FDF7F1]/40 hover:bg-[#FDF7F1]/70",
            )}
          />
        );
      })}

      {showPauseControl ? (
        <>
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-[#FDF7F1]/25"
          />

          <button
            type="button"
            aria-label={
              isPaused
                ? "Resume automatic banner rotation"
                : "Pause automatic banner rotation"
            }
            onClick={onTogglePause}
            className={cn(
              "flex size-6 items-center justify-center",
              "rounded-full text-[#FDF7F1]/80",
              "transition hover:bg-[#FDF7F1]/10",
              "hover:text-[#FDF7F1]",
              "focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#B39152]",
            )}
          >
            {isPaused ? (
              <Play aria-hidden="true" className="size-3.5" fill="currentColor" />
            ) : (
              <Pause aria-hidden="true" className="size-3.5" fill="currentColor" />
            )}
          </button>
        </>
      ) : null}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}
