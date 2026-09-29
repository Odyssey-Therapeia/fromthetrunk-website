import Image from "next/image";
import Link from "next/link";

import { JournalCoverPlaceholder } from "@/components/journal/journal-cover-placeholder";
import type { JournalCardData } from "@/lib/journal/derive";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

/*
 * Motion
 * ------
 * On devices that hover with a fine pointer (`can-hover-motion`), the card
 * rests on image, scrim, tag and title. Hover or keyboard focus raises a 70%
 * ink layer from the bottom (transform, 560ms, soft ease-out), the title rides
 * up as the description row opens, the description and "Read more" fade in
 * one after the other, and the image eases to 1.04.
 *
 * Touch devices never match the variant, so everything is visible from the
 * start. With reduced motion on a hover device, text also stays visible and
 * hover only crossfades the ink layer in; nothing moves.
 */
// Capped tracks keep even a single story at the same size as a full grid.
export const JOURNAL_CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),22rem))] gap-4 @3xl:gap-6";

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
  priority?: boolean;
  className?: string;
  sizes?: string;
};

export function JournalCard({
  article,
  headingLevel: Heading = "h2",
  priority = false,
  className,
  sizes = "(max-width: 383px) calc(100vw - 32px), 352px",
}: JournalCardProps) {
  const title = smartApostrophes(article.title);

  return (
    <article
      className={cn(
        "group/card @container relative isolate h-[26.25rem] w-full max-w-[22rem] overflow-hidden rounded-[1.35rem] bg-ftt-navy text-ftt-ivory shadow-[var(--ftt-soft-shadow)]",
        "outline-offset-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ftt-gold",
        className,
      )}
    >
      <Link
        href={article.path}
        aria-label={title}
        title={title}
        className="block h-full outline-none"
      >
        <div className="relative h-full">
          {article.cover ? (
            <Image
              src={article.cover.src}
              alt=""
              fill
              priority={priority}
              quality={75}
              sizes={sizes}
              className={cn("object-cover", imageMotion)}
            />
          ) : (
            <JournalCoverPlaceholder
              tag={article.tag}
              variant="card"
              className={imageMotion}
            />
          )}
        </div>

        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-ftt-midnight/70",
            inkLayerMotion,
          )}
        />

        {/*
          The scrim is drawn by this wrapper's ::before, so it grows with the text
          block (touch shows the description; a long title wraps). Every line sits
          on at least 65% ink, which keeps ivory text above 4.5:1 even over a
          white photo; it fades out 7rem above the block. The placeholder plate is
          dark navy already (ivory on it is well above 4.5:1), so it goes without,
          keeping its line art visible.
        */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0",
            article.cover &&
              "before:pointer-events-none before:absolute before:inset-x-0 before:-top-28 before:bottom-0 before:bg-[linear-gradient(to_top,rgb(14_13_14/0.9),rgb(14_13_14/0.65)_calc(100%-7rem),transparent)] before:content-['']",
          )}
        >
          <div className="relative flex flex-col p-5 @xs:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ftt-ivory">
              {article.tag}
            </p>
            <Heading
              className="mt-3 font-serif text-[1.55rem] leading-[1.16] text-ftt-ivory"
            >
              <span className="line-clamp-4 break-words">{title}</span>
            </Heading>
            <div className={revealRowMotion}>
              <div className="min-h-0 overflow-hidden">
                <p
                  className={cn(
                    "pt-3 text-sm leading-6 text-ftt-ivory/90 line-clamp-2 can-hover:line-clamp-3",
                    fadeInMotion,
                    "can-hover-motion:group-hover/card:delay-100 can-hover-motion:group-has-[:focus-visible]/card:delay-100",
                  )}
                >
                  {smartApostrophes(article.description)}
                </p>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-ftt-ivory",
                    fadeInMotion,
                    "can-hover-motion:group-hover/card:delay-200 can-hover-motion:group-has-[:focus-visible]/card:delay-200",
                  )}
                >
                  Read more
                  <span className="text-ftt-gold">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
