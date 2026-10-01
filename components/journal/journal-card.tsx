import Image from "next/image";
import Link from "next/link";

import { JournalCoverPlaceholder } from "@/components/journal/journal-cover-placeholder";
import { JOURNAL_EYEBROW, journalCoverPosition } from "@/components/journal/journal-styles";
import type { JournalCardData } from "@/lib/journal/derive";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

/*
 * Motion
 * ------
 * On devices that hover with a fine pointer (`can-hover-motion`), the card
 * rests on image, scrim, tag and title. Hover or keyboard focus raises an 80%
 * navy layer from the bottom (transform, 560ms, soft ease-out), the title rides
 * up as the description row opens, the description and "Read more" fade in
 * one after the other, and the image eases to 1.04.
 *
 * Touch devices never match the variant, so everything is visible from the
 * start. With reduced motion on a hover device, text also stays visible and
 * hover only crossfades the ink layer in; nothing moves.
 */
// Fixed 22rem tracks: wider screens get more columns, never stretched cards.
// The gap is 1rem until 46rem so two cards fit the 45rem column at 768px.
export const JOURNAL_CARD_GRID = "grid grid-cols-[repeat(auto-fill,22rem)] gap-4 @[46rem]:gap-6";

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

const imageMotion = cn(
  "transform-gpu transition-transform duration-[900ms]",
  EASE,
  "can-hover-motion:group-hover/card:scale-[1.04] can-hover-motion:group-has-[:focus-visible]/card:scale-[1.04]",
);

const inkLayerMotion = cn(
  "transform-gpu opacity-0 transition-opacity duration-300 ease-out",
  "can-hover:group-hover/card:opacity-100 can-hover:group-has-[:focus-visible]/card:opacity-100",
  "can-hover-motion:translate-y-full can-hover-motion:opacity-100 can-hover-motion:transition-transform can-hover-motion:duration-[560ms] can-hover-motion:ease-[cubic-bezier(0.22,1,0.36,1)]",
  "can-hover-motion:group-hover/card:translate-y-0 can-hover-motion:group-has-[:focus-visible]/card:translate-y-0",
);

const revealRowMotion = cn(
  "grid grid-rows-[1fr] transition-[grid-template-rows] duration-[560ms]",
  EASE,
  "can-hover-motion:grid-rows-[0fr] can-hover-motion:group-hover/card:grid-rows-[1fr] can-hover-motion:group-has-[:focus-visible]/card:grid-rows-[1fr]",
);

const fadeInMotion = cn(
  "transform-gpu transition-[opacity,transform] duration-500",
  EASE,
  "can-hover-motion:translate-y-2 can-hover-motion:opacity-0",
  "can-hover-motion:group-hover/card:translate-y-0 can-hover-motion:group-hover/card:opacity-100",
  "can-hover-motion:group-has-[:focus-visible]/card:translate-y-0 can-hover-motion:group-has-[:focus-visible]/card:opacity-100",
);

type JournalCardProps = {
  article: JournalCardData;
  headingLevel?: "h2" | "h3";
  className?: string;
};

/**
 * Fixed 22rem x 26.25rem card (88:105), for grids from tablet width up. The
 * image is decorative (alt=""): the title and description are real text.
 */
export function JournalCard({ article, headingLevel: Heading = "h3", className }: JournalCardProps) {
  const title = smartApostrophes(article.title);

  return (
    <article
      className={cn(
        "group/card @container relative isolate h-[26.25rem] w-full max-w-[22rem] overflow-hidden rounded-[1.25rem] bg-journal-navy text-journal-ivory shadow-[0_18px_40px_-24px_rgb(11_29_75/0.45)]",
        "outline-offset-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-journal-navy",
        className,
      )}
    >
      <Link href={article.path} aria-label={title} title={title} className="block h-full outline-none">
        <div className="relative h-full">
          {article.cover ? (
            <Image
              src={article.cover.src}
              alt=""
              fill
              quality={75}
              sizes="352px"
              className={cn("object-cover", journalCoverPosition(article.cover.src), imageMotion)}
            />
          ) : (
            <JournalCoverPlaceholder variant="card" className={imageMotion} />
          )}
        </div>

        <div
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-0 bg-journal-navy/80", inkLayerMotion)}
        />

        {/*
          The scrim is drawn by this wrapper's ::before, so it grows with the text
          block (touch shows the description; a long title wraps). Every line sits
          on at least 70% navy, which keeps ivory text above 4.5:1 even over a
          white photo; it fades out 7rem above the block. The placeholder plate is
          navy already, so it goes without, keeping its line art visible.
        */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0",
            article.cover &&
              "before:pointer-events-none before:absolute before:inset-x-0 before:-top-28 before:bottom-0 before:bg-[linear-gradient(to_top,color-mix(in_srgb,var(--journal-navy)_92%,transparent),color-mix(in_srgb,var(--journal-navy)_70%,transparent)_calc(100%-7rem),transparent)] before:content-['']",
          )}
        >
          <div className="relative flex flex-col p-6">
            <p className={cn(JOURNAL_EYEBROW, "text-journal-gold")}>{article.tag}</p>
            <Heading className="mt-3 font-journal-serif text-2xl font-semibold leading-7 text-journal-ivory">
              <span className="line-clamp-4 break-words">{title}</span>
            </Heading>
            <div className={revealRowMotion}>
              <div className="min-h-0 overflow-hidden">
                <p
                  className={cn(
                    "pt-3 text-[0.9375rem] leading-[1.375rem] text-journal-ivory/90 line-clamp-2 can-hover:line-clamp-3",
                    fadeInMotion,
                    "can-hover-motion:group-hover/card:delay-100 can-hover-motion:group-has-[:focus-visible]/card:delay-100",
                  )}
                >
                  {smartApostrophes(article.description)}
                </p>
                <span
                  aria-hidden="true"
                  className={cn(
                    JOURNAL_EYEBROW,
                    "mt-4 inline-flex items-center gap-2 text-journal-ivory",
                    fadeInMotion,
                    "can-hover-motion:group-hover/card:delay-200 can-hover-motion:group-has-[:focus-visible]/card:delay-200",
                  )}
                >
                  Read more
                  <span className="text-journal-gold">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
