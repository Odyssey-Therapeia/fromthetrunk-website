"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import {
  InstagramSocialCard,
  type InstagramSocialCardData,
} from "@/components/landing/instagram-social-card";
import { cn } from "@/lib/utils";

type SocialReelCarouselProps = {
  cards: InstagramSocialCardData[];
  username: string;
};

const REEL_INTERVAL_MS = 3800;
const VISIBLE_POSITIONS = [-2, -1, 0, 1, 2] as const;
type ReelPosition = (typeof VISIBLE_POSITIONS)[number] | "hidden";

export function SocialReelCarousel({
  cards,
  username,
}: SocialReelCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (cards.length < 2) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, REEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [cards.length]);

  if (!cards.length) return null;

  const goPrevious = () => {
    setActiveIndex((current) => (current - 1 + cards.length) % cards.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % cards.length);
  };

  return (
    <div className="relative min-w-0">
      <div className="absolute -left-10 top-1/2 hidden h-px w-[calc(100%+5rem)] -translate-y-1/2 bg-linear-to-r from-[#601D1C]/0 via-[#141D46]/20 to-[#B39152]/0 lg:block" />
      <div className="absolute right-6 top-4 hidden h-24 w-24 rounded-full border border-[#B39152]/25 lg:block" />

      <div className="relative mx-auto min-h-[35rem] max-w-[58rem] overflow-hidden sm:min-h-[42rem] lg:min-h-[40rem]">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-linear-to-r from-transparent via-[#B39152]/18 to-transparent" />

        {cards.map((card, index) => {
          const position = getRelativePosition(index, activeIndex, cards.length);

          return (
            <div
              key={card.id}
              className={getReelSlotClass(position)}
              aria-hidden={position !== 0 ? true : undefined}
            >
              <InstagramSocialCard
                card={card}
                handle={username}
                linkTabIndex={position === 0 ? 0 : -1}
                showHandle={position === 0 || position === -1}
                className={cn(
                  "h-full w-full rounded-[1.65rem] border border-[#FDF7F1]/30 shadow-[0_28px_75px_rgba(96,29,28,0.16)] sm:rounded-[1.9rem]",
                  position === 0 ? "ring-1 ring-[#B39152]/25" : "",
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevious}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#601D1C]/18 bg-[#FFFCF8] text-[#601D1C] shadow-[0_10px_28px_rgba(96,29,28,0.06)] transition hover:border-[#B39152] hover:bg-[#B39152]/10"
            aria-label="Previous social reel"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={goNext}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#601D1C]/18 bg-[#FFFCF8] text-[#601D1C] shadow-[0_10px_28px_rgba(96,29,28,0.06)] transition hover:border-[#B39152] hover:bg-[#B39152]/10"
            aria-label="Next social reel"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-2 rounded-full transition",
                activeIndex === index
                  ? "w-7 bg-[#141D46]"
                  : "w-2 bg-[#601D1C]/20 hover:bg-[#B39152]/65",
              )}
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={`Show social reel ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function getRelativePosition(
  index: number,
  activeIndex: number,
  length: number,
): ReelPosition {
  const forward = (index - activeIndex + length) % length;
  const backward = forward - length;
  const distance =
    Math.abs(forward) <= Math.abs(backward) ? forward : backward;

  if (distance >= -2 && distance <= 2) return distance as ReelPosition;

  return "hidden";
}

function getReelSlotClass(position: ReelPosition) {
  const base =
    "ftt-social-reel-slot absolute top-1/2 aspect-[9/16] overflow-hidden rounded-[1.85rem]";

  switch (position) {
    case -2:
      return cn(
        base,
        "hidden h-[25rem] -translate-y-1/2 -rotate-[12deg] scale-90 opacity-45 blur-[0.2px] xl:left-[2%] xl:z-10 xl:block",
      );
    case -1:
      return cn(
        base,
        "left-0 z-20 h-[25rem] -translate-x-[55%] -translate-y-1/2 -rotate-[8deg] scale-90 opacity-65 sm:left-[6%] sm:h-[31rem] sm:-translate-x-0 lg:h-[32rem]",
      );
    case 0:
      return cn(
        base,
        "left-1/2 z-30 h-[31rem] -translate-x-1/2 -translate-y-1/2 scale-100 opacity-100 sm:h-[37rem] lg:h-[37.5rem]",
      );
    case 1:
      return cn(
        base,
        "right-0 z-20 h-[25rem] translate-x-[55%] -translate-y-1/2 rotate-[8deg] scale-90 opacity-65 sm:right-[6%] sm:h-[31rem] sm:translate-x-0 lg:h-[32rem]",
      );
    case 2:
      return cn(
        base,
        "hidden h-[25rem] -translate-y-1/2 rotate-[12deg] scale-90 opacity-45 blur-[0.2px] xl:right-[2%] xl:z-10 xl:block",
      );
    case "hidden":
      return cn(
        base,
        "pointer-events-none left-1/2 z-0 h-[24rem] -translate-x-1/2 -translate-y-1/2 scale-75 opacity-0",
      );
  }
}
