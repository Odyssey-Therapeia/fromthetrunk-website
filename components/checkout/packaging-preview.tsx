"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon, TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PackagingPreviewProps = {
  title: string;
  subtitle: string;
  description: string;
  price: string;
  images: string[];
  /** Shows an "AI-generated lookalike" disclaimer over the preview. */
  aiPreview?: boolean;
};

/**
 * "Preview packaging" button → dialog with an image carousel (arrows, dots, and
 * a counter) so the customer can see every photo of the bag/box. Gracefully
 * shows a "coming soon" state when no photos are supplied for that tier.
 */
export function PackagingPreview({
  title,
  subtitle,
  description,
  price,
  images,
  aiPreview = false,
}: PackagingPreviewProps) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setIndex(0);
      }}
    >
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-full border border-ftt-border bg-ftt-card px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy transition hover:border-ftt-gold hover:text-ftt-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold/40">
        <ImageIcon className="size-4" />
        Preview packaging
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-ftt-navy">{title}</DialogTitle>
          <DialogDescription className="text-ftt-burgundy/65">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-ftt-border bg-ftt-ivory">
          {count > 0 ? (
            <>
              <Image
                key={images[safeIndex]}
                src={images[safeIndex]}
                alt={`${title}, photo ${safeIndex + 1} of ${count}`}
                fill
                sizes="(max-width: 640px) 100vw, 32rem"
                className="object-cover"
              />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIndex((i) => i - 1)}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndex((i) => i + 1)}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="absolute bottom-2 right-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                    {safeIndex + 1} / {count}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-ftt-burgundy/60">
              Packaging photos coming soon.
            </div>
          )}
        </div>

        {count > 1 ? (
          <div className="flex items-center justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === safeIndex}
                className={cn(
                  "h-1.5 rounded-full transition",
                  i === safeIndex ? "w-5 bg-ftt-gold" : "w-1.5 bg-ftt-border",
                )}
              />
            ))}
          </div>
        ) : null}

        {aiPreview && count > 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-ftt-gold/35 bg-ftt-gold/12 px-3 py-2 text-xs leading-5 text-ftt-burgundy/80">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ftt-gold" />
            <span>
              The image shown is an{" "}
              <strong className="font-semibold text-ftt-navy">
                AI-generated lookalike
              </strong>{" "}
              of the packaging. The final packaging may vary.
            </span>
          </p>
        ) : null}

        <p className="text-sm leading-6 text-ftt-burgundy/70">{description}</p>
        <p className="text-sm font-semibold text-ftt-navy">{price}</p>
      </DialogContent>
    </Dialog>
  );
}
