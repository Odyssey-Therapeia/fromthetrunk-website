"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export type FabricMotionCategory = {
  bestFor: string;
  description: string;
  href: string;
  imageSrc: string;
  name: string;
};

type FabricCardVariant = "feature" | "wide" | "regular" | "carousel";

type FabricCategoryMotionGridProps = {
  categories: FabricMotionCategory[];
};

const ROTATION_INTERVAL_MS = 4200;

export function FabricCategoryMotionGrid({
  categories,
}: FabricCategoryMotionGridProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (categories.length < 2) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) return;

    const timer = window.setInterval(() => {
      setOffset((current) => (current + 1) % categories.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [categories.length]);

  const rotatedCategories = useMemo(
    () =>
      categories.map(
        (_, index) => categories[(index + offset) % categories.length],
      ),
    [categories, offset],
  );
  const primaryCategories = rotatedCategories.slice(0, 5);
  const secondaryCategories = rotatedCategories.slice(5);

  return (
    <>
      <div className="lg:hidden">
        <Carousel
          opts={{
            align: "start",
            dragFree: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3">
            {rotatedCategories.map((fabric, index) => (
              <CarouselItem
                key={`${fabric.href}-${index}`}
                className="basis-[82%] pl-3 min-[520px]:basis-[52%] md:basis-[38%]"
              >
                <FabricCard
                  fabric={fabric}
                  index={index}
                  variant="carousel"
                />
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="mt-5 flex justify-end gap-2">
            <CarouselPrevious className="static h-10 w-10 translate-y-0 border-[#601D1C]/20 bg-[#FFFCF8] text-[#601D1C] hover:border-[#B39152] hover:bg-[#B39152]/10" />
            <CarouselNext className="static h-10 w-10 translate-y-0 border-[#601D1C]/20 bg-[#FFFCF8] text-[#601D1C] hover:border-[#B39152] hover:bg-[#B39152]/10" />
          </div>
        </Carousel>
      </div>

      <div className="hidden space-y-4 lg:block">
        <div className="grid auto-rows-[18rem] grid-cols-12 gap-4">
          {primaryCategories.map((fabric, index) => (
            <FabricCard
              key={`desktop-primary-${index}`}
              fabric={fabric}
              index={index}
              variant={index === 0 ? "feature" : "wide"}
            />
          ))}
        </div>

        {secondaryCategories.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {secondaryCategories.map((fabric, index) => (
              <FabricCard
                key={`desktop-secondary-${index}`}
                fabric={fabric}
                index={index + primaryCategories.length}
                variant="regular"
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function FabricCard({
  fabric,
  index,
  variant,
}: {
  fabric: FabricMotionCategory;
  index: number;
  variant: FabricCardVariant;
}) {
  const isFeature = variant === "feature";
  const isWide = variant === "wide";
  const isCarousel = variant === "carousel";

  return (
    <Link
      href={fabric.href}
      className={[
        "ftt-fabric-card group relative flex overflow-hidden bg-[#601D1C] text-white shadow-[0_16px_44px_rgba(96,29,28,0.13)] transition duration-500 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1]",
        isFeature
          ? "rounded-[1.65rem] lg:col-span-4 lg:row-span-2"
          : isWide
            ? "rounded-[1.35rem] lg:col-span-4"
            : "rounded-[1.35rem]",
        isCarousel
          ? "min-h-[28rem] rounded-[1.35rem]"
          : isFeature
            ? "min-h-[37rem]"
            : isWide
              ? "min-h-[18rem]"
              : "min-h-[23rem]",
      ].join(" ")}
    >
      <Image
        key={`${fabric.href}-image`}
        src={fabric.imageSrc}
        alt=""
        fill
        sizes={
          isFeature
            ? "(max-width: 1024px) 82vw, 34vw"
            : isWide
              ? "(max-width: 1024px) 82vw, 34vw"
              : "(max-width: 1024px) 82vw, 24vw"
        }
        className="ftt-fabric-card-media scale-105 object-cover transition duration-700 group-hover:scale-[1.12]"
      />

      <span
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,13,14,0.02)_0%,rgba(14,13,14,0.12)_42%,rgba(96,29,28,0.82)_100%)]"
        aria-hidden="true"
      />

      <span
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,29,70,0.18)_0%,rgba(96,29,28,0.76)_55%,rgba(14,13,14,0.95)_100%)] opacity-0 transition duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      />

      <span
        className="absolute inset-x-0 bottom-0 h-1 bg-[#B39152]/85 transition duration-500 group-hover:h-1.5"
        aria-hidden="true"
      />

      <span
        key={`${fabric.href}-copy`}
        className="ftt-fabric-card-copy relative z-10 flex h-full w-full flex-col justify-between p-4 sm:p-5"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/20 bg-[#FDF7F1]/90 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#601D1C] shadow-sm backdrop-blur">
            Fabric {String(index + 1).padStart(2, "0")}
          </span>

          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/25 bg-white/12 text-[#FDF7F1] backdrop-blur transition group-hover:border-[#B39152] group-hover:bg-[#B39152] group-hover:text-[#0E0D0E]">
            <ArrowIcon />
          </span>
        </span>

        <span>
          <span
            className={[
              "block max-w-[12ch] font-serif leading-[0.9] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.35)]",
              isFeature
                ? "text-[clamp(2.6rem,5vw,4.75rem)]"
                : "text-[clamp(2rem,2.7vw,3.25rem)]",
            ].join(" ")}
          >
            {fabric.name}
          </span>

          <span className="mt-3 block text-xs font-semibold leading-5 text-[#B39152]">
            {fabric.bestFor}
          </span>

          <span
            className={[
              "mt-2 block text-xs leading-5 text-white/82",
              isWide ? "line-clamp-2" : "line-clamp-3",
            ].join(" ")}
          >
            {fabric.description}
          </span>

          <span className="mt-4 inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#B39152]">
            Explore fabric
            <ArrowIcon />
          </span>
        </span>
      </span>
    </Link>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
