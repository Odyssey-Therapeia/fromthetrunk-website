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
  /** The wide lead story at the top of the index. */
  lead?: boolean;
  headingLevel?: "h2" | "h3";
  priority?: boolean;
  className?: string;
};

export function JournalCard({
  article,
  lead = false,
  headingLevel: Heading = "h2",
  priority = false,
  className,
}: JournalCardProps) {
  const title = smartApostrophes(article.title);

  return (
    <article
      className={cn(
        "group/card @container relative isolate overflow-hidden rounded-[1.35rem] bg-ftt-navy text-ftt-ivory shadow-[var(--ftt-soft-shadow)]",
        "outline-offset-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ftt-gold",
        className,
      )}
    >
      <div
        className={cn(
          "relative aspect-3/4 @sm:aspect-4/5",
          lead && "@2xl:aspect-[16/10] @4xl:aspect-[2/1] @6xl:aspect-[12/5]",
        )}
      >
        {article.cover ? (
          <Image
            src={article.cover.src}
            alt=""
            fill
            priority={priority}
            quality={75}
            sizes={
              lead
                ? "(min-width: 1280px) 1216px, 100vw"
                : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            }
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
        <div
          className={cn(
            "relative flex flex-col p-5 @sm:p-6",
            lead && "@2xl:max-w-[38rem] @2xl:p-9 @4xl:p-11",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ftt-ivory">
            {article.tag}
          </p>
          <Heading
            className={cn(
              "mt-3 text-balance font-serif text-[1.55rem] leading-[1.12] text-ftt-ivory @sm:text-[1.7rem]",
              lead && "@2xl:text-[2.4rem] @4xl:text-[2.75rem]",
            )}
          >
            <Link
              href={article.path}
              className="outline-none after:absolute after:inset-0 after:z-10 after:content-['']"
            >
              {title}
            </Link>
          </Heading>
          <div className={revealRowMotion}>
            <div className="min-h-0 overflow-hidden">
              <p
                className={cn(
                  "pt-3 text-sm leading-6 text-ftt-ivory/90 line-clamp-2 can-hover:line-clamp-3",
                  lead && "@2xl:text-base @2xl:leading-7",
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
    </article>
  );
}
