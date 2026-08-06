"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type CollectionHeroCarouselImage = {
  alt: string;
  src: string;
};

type CollectionHeroCarouselProps = {
  images: readonly CollectionHeroCarouselImage[];
  prioritizeFirst?: boolean;
};

export function CollectionHeroCarousel({
  images,
  prioritizeFirst = true,
}: CollectionHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );

  if (images.length === 0) return null;

  return (
    <div className="absolute inset-x-0 top-0 bottom-8 overflow-hidden sm:bottom-10 lg:bottom-12">
      {images.map((image, index) => {
        const isActive = activeIndex === index;
        const shouldMountImage = mountedIndices.has(index);

        return (
          <div
            key={image.src}
            aria-hidden={!isActive}
            data-active={isActive ? "true" : "false"}
            data-collection-hero-slide={index}
            className={cn(
              "absolute inset-0",
              isActive
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-6 opacity-0 transition duration-1000 ease-out",
            )}
          >
            {shouldMountImage ? (
              <Image
                src={image.src}
                alt={isActive ? image.alt : ""}
                fill
                priority={prioritizeFirst && index === 0}
                loading={index === 0 ? undefined : "lazy"}
                fetchPriority={prioritizeFirst && index === 0 ? "high" : "auto"}
                sizes="(max-width: 1024px) 100vw, 52vw"
                className="object-contain object-top"
              />
            ) : null}
          </div>
        );
      })}

      {images.length > 1 ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {images.map((image, index) => (
            <button
              key={image.src}
              type="button"
              aria-label={`Show collection banner ${index + 1}`}
              onClick={() => {
                setMountedIndices((current) => {
                  const next = new Set(current);
                  next.add(index);
                  return next;
                });
                setActiveIndex(index);
              }}
              className={cn(
                "h-2 rounded-full border border-[#FDF7F1]/60 transition-all",
                activeIndex === index
                  ? "w-6 bg-[#FDF7F1]"
                  : "w-2 bg-[#FDF7F1]/30 hover:bg-[#FDF7F1]/70",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
