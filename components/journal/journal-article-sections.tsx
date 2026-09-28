import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { JournalCard } from "@/components/journal/journal-card";
import { JournalInline } from "@/components/journal/journal-inline";
import { Button } from "@/components/ui/button";
import { JOURNAL_LABEL } from "@/lib/journal/constants";
import type { JournalArticle, JournalCardData } from "@/lib/journal/derive";
import type { JournalLinkResolver } from "@/lib/journal/links";
import { smartApostrophes } from "@/lib/journal/text";

/** "Questions people ask": every answer visible, no accordion. */
export function JournalFaq({
  faq,
  resolveLink,
}: {
  faq: NonNullable<JournalArticle["faq"]>;
  resolveLink: JournalLinkResolver;
}) {
  return (
    <section aria-labelledby="journal-faq" className="mt-16 sm:mt-20">
      <h2
        id="journal-faq"
        className="scroll-mt-28 font-serif text-[1.65rem] leading-[1.15] text-ftt-navy before:mb-5 before:block before:h-px before:w-10 before:bg-ftt-gold before:content-[''] sm:text-[2rem]"
      >
        {faq.heading}
      </h2>
      <div className="mt-6 divide-y divide-ftt-border border-y border-ftt-border">
        {faq.items.map((item) => (
          <div key={item.question} className="py-6">
            <h3 className="text-pretty font-serif text-[1.2rem] leading-snug text-ftt-navy sm:text-[1.3rem]">
              {smartApostrophes(item.question)}
            </h3>
            <p className="mt-2.5 text-[1.0625rem] leading-[1.8] text-foreground">
              <JournalInline text={item.answer} resolveLink={resolveLink} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** About block, then the closing line in italic serif. */
export function JournalSignOff({
  about,
  closingLine,
  resolveLink,
}: {
  about?: string;
  closingLine?: string;
  resolveLink: JournalLinkResolver;
}) {
  if (!about && !closingLine) return null;

  return (
    <div className="mt-14 sm:mt-16">
      {about ? (
        <p className="rounded-[1.35rem] border border-ftt-border bg-ftt-card px-6 py-5 text-[0.9375rem] leading-7 text-foreground sm:px-7 sm:py-6">
          <JournalInline text={about} resolveLink={resolveLink} />
        </p>
      ) : null}
      {closingLine ? (
        <p className="mt-10 flex flex-col items-center gap-4 text-balance text-center font-serif text-[1.45rem] italic leading-snug text-ftt-burgundy sm:text-[1.7rem]">
          <span aria-hidden="true" className="h-px w-12 bg-ftt-gold" />
          {smartApostrophes(closingLine)}
        </p>
      ) : null}
    </div>
  );
}

/** Closing call to action, on the navy ink panel. */
export function JournalCollectionCta() {
  return (
    <section
      aria-labelledby="journal-collection-cta"
      className="@container relative isolate overflow-hidden rounded-[1.75rem] bg-ftt-navy px-6 py-10 text-ftt-ivory shadow-[var(--ftt-soft-shadow)] sm:px-10 sm:py-12 lg:px-14 lg:py-14"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(90%_120%_at_100%_0%,color-mix(in_srgb,var(--ftt-burgundy)_55%,transparent)_0%,transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-3 -z-10 rounded-[1.25rem] border border-ftt-gold/25 sm:inset-4"
      />
      <div className="flex flex-col gap-7 @3xl:flex-row @3xl:items-end @3xl:justify-between @3xl:gap-12">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-ftt-gold">From The Trunk</p>
          <h2
            id="journal-collection-cta"
            className="mt-4 text-balance font-serif text-[2rem] leading-[1.08] text-ftt-ivory sm:text-[2.5rem]"
          >
            Explore the collection
          </h2>
          <p className="mt-3 text-base leading-7 text-ftt-ivory/80">
            Authenticated preloved and vintage sarees, each one of one.
          </p>
        </div>
        <Button
          asChild
          className="h-12 w-full shrink-0 rounded-full bg-ftt-ivory px-7 text-sm tracking-[0.04em] text-ftt-navy hover:bg-white focus-visible:ring-ftt-gold focus-visible:ring-offset-ftt-navy @md:w-auto"
        >
          <Link href="/collection">
            Browse sarees
            <ArrowRight aria-hidden="true" strokeWidth={1.6} />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Other published stories. Renders nothing until there is at least one. */
export function JournalMoreStories({ articles }: { articles: readonly JournalCardData[] }) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="journal-more" className="@container">
      <h2
        id="journal-more"
        className="font-serif text-[1.75rem] leading-tight text-ftt-navy sm:text-[2.1rem]"
      >
        More from the {JOURNAL_LABEL}
      </h2>
      <ul role="list" className="mt-7 grid gap-5 @xl:grid-cols-2 @xl:gap-6 @4xl:grid-cols-3">
        {articles.map((article) => (
          <li key={article.slug}>
            <JournalCard article={article} headingLevel="h3" />
          </li>
        ))}
      </ul>
    </section>
  );
}
