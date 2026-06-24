"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  alt: string;
}

export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const galleryImages = useMemo(() => images.filter(Boolean), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex =
    selectedIndex >= 0 && selectedIndex < galleryImages.length
      ? selectedIndex
      : 0;
  const activeImage = galleryImages[activeIndex] ?? "";
  const hasMultipleImages = galleryImages.length > 1;

  const showPrevious = () => {
    setSelectedIndex((current) =>
      current <= 0 ? galleryImages.length - 1 : current - 1,
    );
  };

  const showNext = () => {
    setSelectedIndex((current) =>
      current >= galleryImages.length - 1 ? 0 : current + 1,
    );
  };

  if (galleryImages.length === 0) {
    return (
      <div className="grid h-full min-h-[28rem] place-items-center rounded-[1.15rem] border border-dashed border-[#B39152]/35 bg-[#FFFCF8] text-xs uppercase tracking-[0.24em] text-[#601D1C]/55 md:min-h-[var(--pdp-panel-height)]">
        No image available
      </div>
    );
  }

  return (
    <section aria-label={`${alt} product images`} className="h-full">
      <div className="h-full min-h-[30rem] rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8] p-2 shadow-[0_18px_46px_rgba(20,29,70,0.07)] md:min-h-[var(--pdp-panel-height)]">
        <div
          className={cn(
            "grid h-full gap-2",
            hasMultipleImages && "md:grid-cols-[4.75rem_minmax(0,1fr)]",
          )}
        >
          {hasMultipleImages ? (
            <div className="order-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:order-1 md:h-full md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pb-0 [&::-webkit-scrollbar]:hidden">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    "relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border bg-[#FFFCF8] p-0.5 transition sm:h-20 sm:w-16 md:h-22 md:w-full",
                    activeIndex === index
                      ? "border-[#B39152] shadow-[0_10px_24px_rgba(179,145,82,0.16)]"
                      : "border-[#E7DDD4] hover:border-[#B39152]/55",
                  )}
                  aria-label={`View image ${index + 1} of ${galleryImages.length}`}
                  aria-pressed={activeIndex === index}
                >
                  <span className="relative block h-full w-full overflow-hidden rounded-[0.65rem]">
                    <Image
                      src={image}
                      alt={`${alt} thumbnail ${index + 1}`}
                      fill
                      sizes="88px"
                      className="object-cover"
                    />
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="order-1 relative h-[min(68vh,620px)] min-h-[27rem] overflow-hidden rounded-[1.05rem] bg-[#FDF7F1] md:order-2 md:h-full md:min-h-0">
            <Image
              src={activeImage}
              alt={alt}
              fill
              priority
              sizes="(max-width: 767px) 100vw, (max-width: 1024px) 58vw, 54vw"
              className="object-contain"
            />

            <div className="pointer-events-none absolute inset-0 rounded-[1.05rem] ring-1 ring-inset ring-[#601D1C]/8" />

            <div className="absolute left-3 top-3 rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141D46] shadow-sm backdrop-blur">
              {activeIndex + 1} / {galleryImages.length}
            </div>

            {hasMultipleImages ? (
              <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center justify-between md:hidden">
                <button
                  type="button"
                  onClick={showPrevious}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#FDF7F1]/60 bg-[#0E0D0E]/35 text-[#FDF7F1] backdrop-blur transition hover:bg-[#141D46]"
                  aria-label="Show previous product image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#FDF7F1]/60 bg-[#0E0D0E]/35 text-[#FDF7F1] backdrop-blur transition hover:bg-[#141D46]"
                  aria-label="Show next product image"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
