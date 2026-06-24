"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const PROMO_INTERVAL_MS = 3000;

const promoSlides = [
  {
    eyebrow: "The provenance promise",
    title: "Not pre-owned. Re-storied.",
    body: "Every saree is authenticated, condition graded, and story logged before it enters the trunk.",
  },
  {
    eyebrow: "Chosen by you",
    title: "How lucky these pieces are.",
    body: "A saree waits for the right next wardrobe. Yours could be the chapter it was meant to find.",
  },
  {
    eyebrow: "Why shop here",
    title: "Rare pieces, ready for another life.",
    body: "Find handpicked drapes with texture, craft, and history you will not see twice.",
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
