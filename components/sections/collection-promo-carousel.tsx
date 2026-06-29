"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const PROMO_INTERVAL_MS = 3000;

const promoSlides = [
  {
    eyebrow: "THE PROVENANCE PROMISE",
    title: "Every saree, fully vouched for.",
    body: "Authenticated, condition-graded, and story-logged before it joins the trunk.",
  },
  {
    eyebrow: "A CONSCIOUS CHOICE",
    title: "Style that costs the planet less.",
    body: "Choosing pre-loved means less waste and more life for sarees worth keeping.",
  },
  {
    eyebrow: "HERITAGE, CARRIED FORWARD",
    title: "Wear a piece of history.",
    body: "Vintage sarees rich with memory and craft, ready for a new chapter.",
  },
  {
    eyebrow: "VINTAGE, REDISCOVERED",
    title: "Heirloom luxury, within reach.",
    body: "Unique vintage sarees of heirloom quality, thoughtfully priced.",
  },
] as const;

export function CollectionPromoCarousel({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % promoSlides.length);
    }, PROMO_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const activeSlide = promoSlides[activeIndex];

  return (
    <div
      className={cn(
        "col-span-full overflow-hidden rounded-[1.35rem] border border-[#B39152]/20 bg-[linear-gradient(105deg,#601D1C_0%,#141D46_58%,#0E0D0E_100%)] px-5 py-4 text-[#FDF7F1] shadow-[0_14px_38px_rgba(20,29,70,0.16)] sm:px-6 md:flex md:items-center md:justify-between md:gap-8",
        className,
      )}
    >
      <div className="min-h-24 md:min-h-20">
        <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[#B39152]">
          {activeSlide.eyebrow}
        </p>
        <div
          key={activeSlide.title}
          data-collection-promo-slide={activeIndex}
          className="mt-2 transition duration-500 ease-out"
        >
              <h3 className="max-w-2xl font-serif text-2xl leading-tight text-[#FDF7F1] sm:text-3xl md:text-[1.7rem]">
                {activeSlide.title}
              </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#FDF7F1]/76">
            {activeSlide.body}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 md:mt-0 md:shrink-0 md:flex-col md:items-end">
        <Link
          href="/collection#collection-grid"
          className="inline-flex rounded-full bg-[#B39152] px-5 py-2.5 text-sm font-semibold text-[#0E0D0E] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDF7F1]/80"
        >
          Shop now
        </Link>

        <div className="flex gap-2" aria-label="Collection promo slides">
          {promoSlides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Show promo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-2 rounded-full border border-[#FDF7F1]/55 transition-all",
                activeIndex === index
                  ? "w-6 bg-[#FDF7F1]"
                  : "w-2 bg-[#FDF7F1]/25 hover:bg-[#FDF7F1]/70",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
