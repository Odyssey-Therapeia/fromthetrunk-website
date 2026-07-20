"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { useHomeIntroReady } from "@/components/sections/home-intro-gate";

// Slower cadence: each slide holds longer and the crossfade is gentler.
const SLIDE_DURATION_MS = 6000;
const SLIDE_TRANSITION_MS = 1400;
const HERO_GOLD = "#B39152";

// TEMP (debugging): flip back to true to restore auto-advance.
const AUTOPLAY_ENABLED = true;

type HeadlinePart = {
  text: string;
  accent?: boolean;
};

type Slide = {
  image: string;
  mobileImage: string;
  fallbackBackground: string;
  imagePosition?: string;
  tabletImagePosition?: string;
  mobileImagePosition?: string;
  hideMobileDescription?: boolean;
  eyebrow: string;
  description: string;
  headline: HeadlinePart[];
  mobileHeadline?: HeadlinePart[][];
  headlineClassName?: string;
  mobileCopyClassName?: string;
  mobileHeadlineClassName?: string;
};

const slides: Slide[] = [
  {
    image: "/hero/3-lcp.webp",
    mobileImage: "/hero/mobile_1-lcp.webp",
    fallbackBackground:
      "radial-gradient(circle at 24% 44%, rgba(179,145,82,0.30), transparent 32%), linear-gradient(135deg, #601D1C 0%, #141D46 100%)",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center 80%",
    eyebrow: "FROM THE TRUNK",
    headline: [
      { text: "Crafted for the " },
      { text: "FEARLESS", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "Crafted for the" }],
      [{ text: "FEARLESS", accent: true }, { text: "." }],
    ],
    description: "Handcrafted pieces for women who lead with confidence.",
    mobileCopyClassName:
      "justify-end pb-[clamp(3rem,8vh,5rem)] md:justify-start md:pb-0",
  },
  {
    image: "/hero/4-lcp.webp",
    mobileImage: "/hero/mobile_2-lcp.webp",
    fallbackBackground:
      "radial-gradient(circle at 24% 44%, rgba(179,145,82,0.28), transparent 34%), linear-gradient(135deg, #141D46 0%, #050816 100%)",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center 80%",
    eyebrow: "FROM THE TRUNK",
    headline: [{ text: "TIMELESS", accent: true }, { text: " by design." }],
    mobileHeadline: [
      [{ text: "TIMELESS", accent: true }],
      [{ text: "by design." }],
    ],
    description:
      "Created to be cherished today, tomorrow, and for generations.",
    mobileCopyClassName:
      "justify-end pb-[clamp(3rem,8vh,5rem)] md:justify-start md:pb-0 md:pt-16",
  },
  {
    image: "/hero/5-lcp.webp",
    mobileImage: "/hero/mobile_3-lcp.webp",
    fallbackBackground:
      "radial-gradient(circle at 25% 42%, rgba(179,145,82,0.24), transparent 34%), linear-gradient(135deg, #2F1A2B 0%, #601D1C 48%, #141D46 100%)",
    imagePosition: "center center",
    tabletImagePosition: "56% center",
    mobileImagePosition: "center 80%",
    eyebrow: "FROM THE TRUNK",
    headline: [
      { text: "Beautiful " },
      { text: "YOU", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "Beautiful" }],
      [{ text: "YOU", accent: true }, { text: "." }],
    ],
    description: "Every weave becomes a story when you wear it.",
    mobileCopyClassName:
      "justify-end pb-[clamp(3rem,8vh,5rem)] md:justify-start md:pb-0 md:pt-16",
  },
  {
    image: "/hero/6-lcp.webp",
    mobileImage: "/hero/mobile_4-lcp.webp",
    fallbackBackground:
      "radial-gradient(circle at 25% 42%, rgba(179,145,82,0.24), transparent 34%), linear-gradient(135deg, #141D46 0%, #30151D 100%)",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center 80%",
    eyebrow: "THE FINAL STATEMENT",
    headline: [
      { text: "FROM THE " },
      { text: "TRUNK", accent: true },
      { text: ", TO YOUR " },
      { text: "WARDROBE", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "FROM THE" }],
      [{ text: "TRUNK", accent: true }, { text: ", TO" }],
      [{ text: "YOUR" }],
      [{ text: "WARDROBE", accent: true }, { text: "." }],
    ],
    description:
      "Treasured sarees, thoughtfully restored for the Fearless, Timeless You, ready to continue their legacy through a new story.",
    hideMobileDescription: true,
    headlineClassName:
      "md:!text-[clamp(2.45rem,4.7vw,4.35rem)] lg:!text-[clamp(3.2rem,5.15vw,6.35rem)]",
    mobileCopyClassName:
      "justify-end pb-[clamp(3rem,8vh,5rem)] md:justify-start md:pb-0 md:pt-16",
    mobileHeadlineClassName: "!text-[clamp(2.65rem,11vw,4rem)] !leading-[0.92]",
  },
];

type HeroViewport = "mobile" | "tablet" | "desktop";

function getHeroViewport(): HeroViewport {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function useHeroViewport() {
  const [viewport, setViewport] = useState<HeroViewport>("desktop");

  useEffect(() => {
    const updateViewport = () => setViewport(getHeroViewport());

    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });

    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  return viewport;
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

function HeroSlideImage({
  index,
  slide,
  viewport,
  onFirstImageReady,
}: {
  index: number;
  slide: Slide;
  viewport: HeroViewport;
  onFirstImageReady: () => void;
}) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const isFirstSlide = index === 0;
  const isMobile = viewport === "mobile";
  const imageSrc = isMobile ? slide.mobileImage : slide.image;
  const objectPosition = isMobile
    ? (slide.mobileImagePosition ?? "center center")
    : viewport === "tablet"
      ? (slide.tabletImagePosition ?? slide.imagePosition ?? "center center")
      : (slide.imagePosition ?? "center center");

  if (failedImageSrc === imageSrc) return null;

  return (
    <Image
      src={imageSrc}
      alt=""
      fill
      priority={isFirstSlide}
      loading={isFirstSlide ? undefined : "lazy"}
      fetchPriority={isFirstSlide ? "high" : "auto"}
      sizes="100vw"
      className="object-cover"
      style={{ objectPosition }}
      onLoad={isFirstSlide ? onFirstImageReady : undefined}
      onError={() => {
        setFailedImageSrc(imageSrc);
        if (isFirstSlide) {
          onFirstImageReady();
        }
      }}
    />
  );
}

interface HeroSectionProps {
  content?: unknown;
}

function renderHeadline(parts: HeadlinePart[]) {
  return (
    <>
      {parts.map((part, index) =>
        part.accent ? (
          <span
            key={`${part.text}-${index}`}
            className="inline-block text-[1.18em] font-semibold md:font-bold"
            style={{ color: HERO_GOLD }}
          >
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function renderMobileHeadline(slide: Slide) {
  if (!slide.mobileHeadline) {
    return renderHeadline(slide.headline);
  }

  return (
    <>
      {slide.mobileHeadline.map((line, index) => (
        <span key={index} className="block whitespace-nowrap">
          {renderHeadline(line)}
        </span>
      ))}
    </>
  );
}

function HeroCopy({ slide }: { slide: Slide }) {
  return (
    <div className="w-full max-w-[min(88vw,28rem)] drop-shadow-[0_5px_22px_rgba(0,0,0,0.48)] transition-transform duration-500 md:w-[clamp(20rem,38vw,32rem)] md:max-w-none md:-translate-y-4 md:drop-shadow-[0_5px_24px_rgba(0,0,0,0.5)] lg:w-[clamp(24rem,40vw,44rem)] lg:-translate-y-8">
      <p
        className="font-sans text-[clamp(0.72rem,2.8vw,0.9rem)] font-semibold uppercase tracking-[0.32em] text-white/82 md:font-serif md:text-[clamp(0.68rem,0.75vw,0.95rem)] md:tracking-[0.44em] md:text-white/88 lg:tracking-[0.5em]"
      >
        {slide.eyebrow}
      </p>
      <span
        className="mb-4 mt-3 block h-px w-[clamp(5.5rem,24vw,8rem)] bg-linear-to-r from-[#B39152] via-[#B39152]/70 to-transparent md:mb-6 md:mt-4 md:w-32"
        aria-hidden="true"
      />
      {/* Rotating hero tagline. This is a styled sub-line, NOT the page heading —
          the single page <h1> lives once in HeroSection (sr-only). */}
      <p
        className="max-w-full font-serif text-[clamp(3.15rem,13vw,5rem)] font-medium leading-[0.9] text-white md:max-w-none md:text-[clamp(2.8rem,6vw,4.8rem)] md:font-semibold md:leading-[0.96] lg:text-[clamp(4rem,6vw,7.6rem)]"
      >
        <span className={["md:hidden", slide.mobileHeadlineClassName ?? ""].join(" ")}>
          {renderMobileHeadline(slide)}
        </span>
        <span className={["hidden md:inline", slide.headlineClassName ?? ""].join(" ")}>
          {renderHeadline(slide.headline)}
        </span>
      </p>
      {slide.hideMobileDescription ? (
        <p className="mt-6 hidden w-auto max-w-[clamp(18rem,34vw,32rem)] text-[clamp(1.15rem,1.35vw,1.6rem)] leading-[1.6] text-white/85 md:block lg:max-w-[clamp(24rem,38vw,40rem)]">
          {slide.description}
        </p>
      ) : (
        <p
          className="mt-5 w-full max-w-[min(86vw,26rem)] font-sans text-[clamp(1.08rem,4.2vw,1.4rem)] leading-[1.5] text-white/88 md:mt-6 md:w-auto md:max-w-[clamp(18rem,34vw,32rem)] md:text-[clamp(1.15rem,1.35vw,1.6rem)] md:leading-[1.6] md:text-white/85 lg:max-w-[clamp(24rem,38vw,40rem)]"
        >
          {slide.description}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3 md:mt-8 md:gap-4">
        <Link
          href="/collection"
          className="inline-flex items-center justify-center rounded-full border border-[#B39152] bg-linear-to-r from-[#601D1C] to-[#141D46] px-6 py-3 text-[clamp(0.72rem,0.9vw,0.9rem)] font-semibold uppercase tracking-[0.16em] text-[#FDF7F1] shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition hover:brightness-110"
        >
          Explore Collection
        </Link>
        <Link
          href="/our-story"
          className="inline-flex items-center justify-center rounded-full border border-[#B39152] bg-[#FDF7F1] px-6 py-3 text-[clamp(0.72rem,0.9vw,0.9rem)] font-semibold uppercase tracking-[0.16em] text-[#141D46] shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition hover:bg-white"
        >
          Our Story
        </Link>
      </div>
    </div>
  );
}

export function HeroSection(props: HeroSectionProps) {
  void props;

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [initialHeroImageReady, setInitialHeroImageReady] = useState(false);
  const viewport = useHeroViewport();
  const lockedRef = useRef(false);
  const unlockTimeoutRef = useRef<number | null>(null);
  const { nudge } = useUiHaptics();
  const isIntroReady = useHomeIntroReady();
  const prefersReducedMotion = usePrefersReducedMotion();
  const activeSlide = slides[activeImageIndex] ?? slides[0]!;

  const changeSlide = useCallback(
    (nextIndex: number) => {
      const safeNextIndex = (nextIndex + slides.length) % slides.length;

      if (safeNextIndex === activeImageIndex || lockedRef.current) {
        return;
      }

      lockedRef.current = true;
      setActiveImageIndex(safeNextIndex);

      unlockTimeoutRef.current = window.setTimeout(() => {
        lockedRef.current = false;
      }, prefersReducedMotion ? 0 : SLIDE_TRANSITION_MS);
    },
    [activeImageIndex, prefersReducedMotion],
  );

  const nextSlide = useCallback(() => {
    changeSlide(activeImageIndex + 1);
  }, [activeImageIndex, changeSlide]);

  const previousSlide = useCallback(() => {
    changeSlide(activeImageIndex - 1);
  }, [activeImageIndex, changeSlide]);

  useEffect(() => {
    if (
      prefersReducedMotion ||
      !AUTOPLAY_ENABLED ||
      !isIntroReady ||
      !initialHeroImageReady
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      nextSlide();
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [
    activeImageIndex,
    initialHeroImageReady,
    isIntroReady,
    nextSlide,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    if (isIntroReady) {
      return;
    }

    lockedRef.current = false;

    if (unlockTimeoutRef.current) {
      window.clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }
  }, [isIntroReady]);

  useEffect(() => {
    return () => {
      if (unlockTimeoutRef.current) {
        window.clearTimeout(unlockTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section
      id="home-hero"
      className="relative h-[calc(100svh-9.125rem)] min-h-120 overflow-hidden text-white md:h-[min(calc(100svh-6.625rem),60vw)] md:min-h-144 lg:h-[min(calc(100svh-6.625rem),56.25vw)] lg:min-h-152 xl:min-h-160 2xl:min-h-168"
    >
      {/* The homepage's single, canonical H1 (visually hidden — the visible hero
          headline is the rotating tagline above). */}
      <h1 className="sr-only">Authenticated Pre-Loved Luxury Sarees</h1>
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            aria-hidden={activeImageIndex !== index}
            className={[
              "absolute inset-0 opacity-0 transition-opacity ease-in-out",
              activeImageIndex === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{
              background: slide.fallbackBackground,
              transitionDuration: prefersReducedMotion
                ? "0ms"
                : `${SLIDE_TRANSITION_MS}ms`,
            }}
          >
            {activeImageIndex === index ? (
              <HeroSlideImage
                index={index}
                slide={slide}
                viewport={viewport}
                onFirstImageReady={() => setInitialHeroImageReady(true)}
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,6,20,0.72),rgba(3,6,20,0.24)_48%,rgba(3,6,20,0.46))] md:bg-[linear-gradient(90deg,rgba(3,6,20,0.64),rgba(3,6,20,0.18)_48%,rgba(3,6,20,0.36))]" />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          nudge();
          previousSlide();
        }}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-30 flex h-[clamp(2rem,1.6rem+1.7vw,3.25rem)] w-[clamp(2rem,1.6rem+1.7vw,3.25rem)] -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md transition duration-300 hover:border-[#B39152] hover:bg-[#601D1C]/80 hover:text-[#B39152] md:left-8 md:top-auto md:bottom-10 md:translate-y-0"
      >
        <ChevronLeft
          className="h-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)] w-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)]"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={() => {
          nudge();
          nextSlide();
        }}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-30 flex h-[clamp(2rem,1.6rem+1.7vw,3.25rem)] w-[clamp(2rem,1.6rem+1.7vw,3.25rem)] -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md transition duration-300 hover:border-[#B39152] hover:bg-[#601D1C]/80 hover:text-[#B39152] md:right-8 md:top-auto md:bottom-10 md:translate-y-0"
      >
        <ChevronRight
          className="h-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)] w-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)]"
          aria-hidden="true"
        />
      </button>

      <div className="relative z-20 h-full w-full">
        <div
          key={`${activeSlide.image}-content`}
          className={[
            "flex h-full flex-col px-[clamp(2rem,7.5vw,3.25rem)] transition-opacity ease-in-out md:flex-row md:items-center md:px-0 md:py-0 md:pl-[clamp(2rem,6vw,5rem)] md:pr-[clamp(1.5rem,4vw,3rem)] lg:pl-[clamp(5rem,8vw,13rem)] lg:pr-[clamp(3rem,5vw,6rem)]",
            activeSlide.mobileCopyClassName ??
              "justify-start pt-32 md:justify-start md:pt-0",
          ].join(" ")}
          style={{
            transitionDuration: prefersReducedMotion
              ? "0ms"
              : `${SLIDE_TRANSITION_MS}ms`,
          }}
          aria-live="polite"
        >
          <HeroCopy slide={activeSlide} />
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 gap-3 md:bottom-10">
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              nudge();
              changeSlide(index);
            }}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={activeImageIndex === index ? "true" : undefined}
            className={[
              "h-0.75 rounded-full transition-all duration-500",
              activeImageIndex === index
                ? "w-12 bg-[#B39152]"
                : "w-7 bg-white/35 hover:bg-white/60",
            ].join(" ")}
          />
        ))}
      </div>
    </section>
  );
}
