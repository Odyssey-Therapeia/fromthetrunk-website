"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type InstagramSocialCardData = {
  alt: string;
  caption: string;
  href: string;
  id: string;
  image: string;
  isCarousel?: boolean;
  isVideo?: boolean;
  label: string;
  placeholderColor?: string;
  videoUrl?: string;
};

export function InstagramSocialCard({
  card,
  className,
  featured = false,
  handle = "from.thetrunk",
  linkTabIndex,
  priority = false,
  showHandle = true,
}: {
  card: InstagramSocialCardData;
  className?: string;
  featured?: boolean;
  handle?: string;
  linkTabIndex?: number;
  priority?: boolean;
  showHandle?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoActive, setVideoActive] = useState(false);

  const canPlayVideo = Boolean(card.videoUrl);

  const playVideo = () => {
    if (!videoRef.current || !canPlayVideo) return;

    setVideoActive(true);
    videoRef.current.play().catch(() => {
      setVideoActive(false);
    });
  };

  const pauseVideo = () => {
    if (!videoRef.current || !canPlayVideo) return;

    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setVideoActive(false);
  };

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[1.25rem] bg-[#601D1C] shadow-[0_16px_40px_rgba(96,29,28,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(96,29,28,0.16)] sm:rounded-[1.75rem]",
        featured
          ? "col-span-2 min-h-[28rem] lg:row-span-2 lg:min-h-0"
          : "h-[clamp(15rem,48vw,25rem)]",
        className,
      )}
    >
      <Link
        href={card.href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-4 focus-visible:ring-offset-[#FDF7F1]"
        aria-label={`Open Instagram post: ${card.caption}`}
        tabIndex={linkTabIndex}
        onMouseEnter={playVideo}
        onMouseLeave={pauseVideo}
        onFocus={playVideo}
        onBlur={pauseVideo}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: card.placeholderColor ?? "#601D1C",
          }}
        />

        <Image
          src={card.image}
          alt={card.alt}
          fill
          priority={priority}
          sizes={
            featured
              ? "(max-width: 1024px) 100vw, 50vw"
              : "(max-width: 1024px) 50vw, 25vw"
          }
          unoptimized={card.image.startsWith("http")}
          className={cn(
            "object-cover transition duration-700 group-hover:scale-105",
            videoActive && canPlayVideo ? "opacity-0" : "opacity-100",
          )}
        />

        {card.videoUrl ? (
          <video
            ref={videoRef}
            src={videoActive ? card.videoUrl : undefined}
            poster={card.image}
            muted
            loop
            playsInline
            preload="none"
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105",
              videoActive ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}

        <div className="absolute inset-0 bg-linear-to-t from-[#0E0D0E]/88 via-[#0E0D0E]/18 to-transparent" />

        <div className="absolute left-3 top-3 z-10 rounded-full border border-[#FDF7F1]/25 bg-[#FDF7F1]/90 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#601D1C] shadow-sm backdrop-blur sm:left-5 sm:top-5 sm:text-[10px]">
          {featured ? "Latest from the trunk" : card.label}
        </div>

        {card.isVideo || card.videoUrl ? (
          <div className="absolute left-1/2 top-1/2 z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#FDF7F1]/45 bg-[#FDF7F1]/15 text-[#FDF7F1] backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:border-[#B39152] group-hover:bg-[#B39152] group-hover:text-[#0E0D0E] sm:h-14 sm:w-14">
            <PlayGlyph />
          </div>
        ) : null}

        {card.isCarousel ? (
          <div className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-[#FDF7F1]/25 bg-[#0E0D0E]/35 text-[#FDF7F1] backdrop-blur sm:right-5 sm:top-5">
            <CarouselGlyph />
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 right-3 z-10 sm:bottom-5 sm:left-5 sm:right-5">
          {showHandle ? (
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#B39152] sm:text-[11px] sm:tracking-[0.24em]">
              @{handle}
            </p>
          ) : null}

          <h3
            className={cn(
              "mt-1 font-serif leading-snug text-[#FDF7F1] sm:mt-2",
              featured
                ? "text-2xl sm:text-4xl sm:leading-tight"
                : "text-sm sm:text-xl sm:leading-tight",
            )}
          >
            {card.caption}
          </h3>
        </div>
      </Link>
    </article>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 translate-x-px sm:h-5 sm:w-5"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8.25 5.6v12.8c0 .64.7 1.02 1.24.68l9.9-6.4a.8.8 0 0 0 0-1.36l-9.9-6.4a.8.8 0 0 0-1.24.68Z" />
    </svg>
  );
}

function CarouselGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="1.8"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 14.5V6.8A1.8 1.8 0 0 1 6.8 5h7.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
