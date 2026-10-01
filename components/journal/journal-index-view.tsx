import { ArrowRight, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ChangeEventHandler, FormEventHandler, ReactNode, RefObject } from "react";

import { JournalStoryList, JournalStoryMeta } from "@/components/journal/journal-story-list";
import {
  JOURNAL_CONTAINER,
  JOURNAL_EYEBROW,
  JOURNAL_FOCUS,
  JOURNAL_FOCUS_ON_NAVY,
  JOURNAL_GUTTERS,
  JOURNAL_PILL,
  journalCoverPosition,
} from "@/components/journal/journal-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOURNAL_PATH } from "@/lib/journal/constants";
import type { JournalCardData } from "@/lib/journal/derive";
import { groupJournalJourneys, journalJourneyAnchor } from "@/lib/journal/journeys";
import { formatStoryCount } from "@/lib/journal/search";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

export const JOURNAL_SEARCH_PLACEHOLDER = "Search the journal";

/** Featured image: half the 1200px container on desktop, full width in the band below. */
export const JOURNAL_FEATURED_SIZES = "(min-width:1280px) 600px, (min-width:1024px) 50vw, calc(100vw - 40px)";

type SearchControls = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

type JournalIndexViewProps = {
  articles: readonly JournalCardData[];
  /** Trimmed query. Any query collapses the page into one flat results grid. */
  query: string;
  /** Title and intro, rendered by the page at the top of the navy section. */
  intro: ReactNode;
  /**
   * Interactive controls from the client wrapper. Without them the form is a
   * plain GET form, which is what the static HTML ships before hydration.
   */
  controls?: SearchControls;
};

function JournalSearchForm({ controls }: { controls?: SearchControls }) {
  return (
    <form
      action={JOURNAL_PATH}
      method="get"
      role="search"
      aria-label="Journal"
      onSubmit={controls?.onSubmit}
      className="flex w-full max-w-xl items-center gap-1.5 rounded-full bg-journal-ivory p-1.5 outline-offset-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-journal-ivory"
    >
      <label htmlFor="journal-search" className="sr-only">
        {JOURNAL_SEARCH_PLACEHOLDER}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-journal-muted"
        />
        <Input
          ref={controls?.inputRef}
          id="journal-search"
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={JOURNAL_SEARCH_PLACEHOLDER}
          {...(controls
            ? { value: controls.value, onChange: controls.onChange }
            : { defaultValue: "" })}
          className="h-11 rounded-full border-0 bg-transparent pl-10 pr-2 text-base text-journal-navy shadow-none placeholder:text-journal-muted focus-visible:border-0 focus-visible:ring-0 [&::-webkit-search-cancel-button]:cursor-pointer"
        />
      </div>
      <Button
        type="submit"
        className={cn(
          "h-11 shrink-0 rounded-full bg-journal-navy px-5 text-sm font-medium tracking-[0.02em] text-journal-ivory hover:bg-journal-navy-raised focus-visible:ring-0",
          JOURNAL_FOCUS,
        )}
      >
        Search
      </Button>
    </form>
  );
}

/** The newest story (preferring one with a photograph), as a band inside the navy section. */
function JournalFeatured({ article }: { article: JournalCardData }) {
  const title = smartApostrophes(article.title);

  return (
    <section
      aria-labelledby="journal-featured"
      className="@container mt-8 overflow-hidden rounded-[1.5rem] border border-journal-gold/35 bg-journal-navy-raised sm:mt-10"
    >
      <div className={cn("grid", article.cover && "@3xl:grid-cols-2")}>
        {article.cover ? (
          <div className="relative aspect-[3/2] @3xl:aspect-auto @3xl:min-h-full">
            <Image
              src={article.cover.src}
              alt={article.cover.alt}
              fill
              priority
              fetchPriority="high"
              quality={75}
              sizes={JOURNAL_FEATURED_SIZES}
              className={cn("object-cover", journalCoverPosition(article.cover.src))}
            />
          </div>
        ) : null}
        <div className="flex flex-col justify-center p-5 min-[390px]:p-6 @3xl:p-10 @5xl:p-12">
          <p className={cn(JOURNAL_EYEBROW, "text-journal-gold")}>
            Featured guide <span aria-hidden="true">·</span> {article.tag}
          </p>
          <h2
            id="journal-featured"
            className="mt-3 text-balance font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-ivory @3xl:text-[2rem] @3xl:leading-9"
          >
            {title}
          </h2>
          <p className="mt-3 text-pretty text-base leading-7 text-journal-ivory/85">
            {smartApostrophes(article.description)}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={article.path}
              aria-label={`Read the guide: ${title}`}
              className={cn(
                JOURNAL_PILL,
                "bg-journal-ivory text-journal-navy hover:bg-white",
                JOURNAL_FOCUS_ON_NAVY,
              )}
            >
              Read the guide
              <ArrowRight aria-hidden="true" strokeWidth={1.6} className="size-4" />
            </Link>
            <JournalStoryMeta
              article={article}
              className="text-journal-ivory/80 [&_button]:text-journal-ivory [&_button]:hover:bg-journal-ivory/10 [&_button]:focus-visible:outline-journal-ivory"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function NoResults({ query, onClear }: { query: string; onClear?: () => void }) {
  const clearClass = cn(
    JOURNAL_PILL,
    "mt-7 border border-journal-navy/30 bg-transparent px-6 text-journal-navy hover:bg-journal-navy/5",
    JOURNAL_FOCUS,
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-[1.25rem] border border-journal-navy/15 bg-journal-paper px-6 py-12 text-center sm:px-10 sm:py-16">
      <svg
        viewBox="0 0 42 14"
        className="h-3.5 w-12 text-journal-gold"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        aria-hidden="true"
      >
        <path d="M1 7h14" />
        <path d="M27 7h14" />
        <path d="M21 2.2c2.1 1.7 3.2 3.3 3.2 4.8S23.1 10.1 21 11.8c-2.1-1.7-3.2-3.3-3.2-4.8S18.9 3.9 21 2.2Z" />
      </svg>
      <h2 className="mt-5 text-balance font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-navy">
        Nothing in the trunk for “{query}”
      </h2>
      <p className="mt-3 text-base leading-7 text-journal-muted">
        Try a different word, such as silk or zari, or clear the search to see every story.
      </p>
      {onClear ? (
        <button type="button" onClick={onClear} className={clearClass}>
          Clear search
        </button>
      ) : (
        <a href={JOURNAL_PATH} className={clearClass}>
          Clear search
        </a>
      )}
    </div>
  );
}

const RELATED_LINKS = [
  {
    href: "/authentication",
    title: "How we check a saree",
    description: "What every saree goes through before we list it.",
  },
  {
    href: "/sell-your-saree",
    title: "Sell or consign a saree",
    description: "Pass a saree you no longer wear on to its next wardrobe.",
  },
  {
    href: "#footer-email",
    title: "New stories by email",
    description: "Sign up at the foot of this page for new guides and rare finds.",
  },
] as const;

function JournalRelatedLinks() {
  return (
    <section aria-labelledby="journal-related" className="border-t border-journal-gold/45 pt-8 sm:pt-10">
      <h2
        id="journal-related"
        className="font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-navy @2xl:text-[2rem] @2xl:leading-9"
      >
        Beyond the Journal
      </h2>
      <ul role="list" className="mt-6 grid gap-3 @2xl:grid-cols-3 @2xl:gap-6">
        {RELATED_LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className={cn(
                "group/link flex h-full min-h-11 flex-col rounded-[1.25rem] border border-journal-navy/15 bg-journal-paper p-5 transition-colors hover:border-journal-navy/40",
                JOURNAL_FOCUS,
              )}
            >
              <span className="flex items-center justify-between gap-3 font-journal-serif text-[1.375rem] font-semibold leading-7 text-journal-navy">
                {link.title}
                <ArrowRight
                  aria-hidden="true"
                  strokeWidth={1.6}
                  className="size-4 shrink-0 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none"
                />
              </span>
              <span className="mt-1.5 text-[0.9375rem] leading-6 text-journal-muted">{link.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JournalJourneySections({ articles }: { articles: readonly JournalCardData[] }) {
  const { groups, unassigned } = groupJournalJourneys(articles);

  return (
    <>
      {groups.length > 1 ? (
        <nav aria-label="Journeys" className="pt-8 sm:pt-10">
          <p className={cn(JOURNAL_EYEBROW, "text-journal-muted")}>Start with a question</p>
          <ul role="list" className="mt-3 flex flex-wrap gap-2">
            {groups.map(({ journey, articles: stories }) => (
              <li key={journey.id}>
                <a
                  href={`#${journalJourneyAnchor(journey.id)}`}
                  className={cn(
                    JOURNAL_PILL,
                    "border border-journal-navy/25 bg-journal-paper px-4 text-journal-navy hover:border-journal-navy hover:bg-journal-navy hover:text-journal-ivory",
                    JOURNAL_FOCUS,
                  )}
                >
                  {journey.label}
                  <span className="text-journal-muted group-hover:text-inherit" aria-hidden="true">
                    {stories.length}
                  </span>
                  <span className="sr-only">, {formatStoryCount(stories.length)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {groups.map(({ journey, articles: stories }) => (
        <section
          key={journey.id}
          id={journalJourneyAnchor(journey.id)}
          aria-labelledby={`${journalJourneyAnchor(journey.id)}-title`}
          className="mt-10 scroll-mt-32 border-t border-journal-gold/45 pt-8 sm:mt-12 sm:pt-10"
        >
          <h2
            id={`${journalJourneyAnchor(journey.id)}-title`}
            className="font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-navy @2xl:text-[2rem] @2xl:leading-9"
          >
            {journey.label}
          </h2>
          <p className="mt-2 max-w-[40rem] text-base leading-7 text-journal-muted">{journey.description}</p>
          <JournalStoryList articles={stories} className="mt-6" />
        </section>
      ))}

      {unassigned.length > 0 ? (
        <section
          aria-labelledby="journal-more-stories"
          className="mt-10 border-t border-journal-gold/45 pt-8 sm:mt-12 sm:pt-10"
        >
          <h2
            id="journal-more-stories"
            className="font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-navy @2xl:text-[2rem] @2xl:leading-9"
          >
            More stories
          </h2>
          <JournalStoryList articles={unassigned} className="mt-6" />
        </section>
      ) : null}
    </>
  );
}

/**
 * The Journal index below the page title: search and the featured guide in the
 * navy first section, then journey chips, one section per journey and related
 * links. A query collapses everything into one flat results grid. Shared by the
 * static (pre-hydration) render and the client search wrapper, so both produce
 * the same markup.
 */
export function JournalIndexView({ articles, query, intro, controls }: JournalIndexViewProps) {
  const searching = query.length > 0;
  const featured = articles.find((article) => article.cover) ?? articles[0];

  return (
    <>
      <section aria-labelledby="journal-title" className="bg-journal-navy text-journal-ivory">
        <div className={JOURNAL_GUTTERS}>
          <div className={cn(JOURNAL_CONTAINER, "pb-8 pt-8 sm:pb-12 sm:pt-12 lg:pb-14")}>
            {intro}
            <div className="mt-6 sm:mt-8">
              <JournalSearchForm controls={controls} />
            </div>
            {!searching && featured ? <JournalFeatured article={featured} /> : null}
          </div>
        </div>
      </section>

      <div className={JOURNAL_GUTTERS}>
        <div
          className={cn(
            "@container pb-16 sm:pb-20 lg:pb-24",
            JOURNAL_CONTAINER,
            // Results get more columns on very wide screens rather than wider cards.
            searching && "max-w-[95rem]",
          )}
        >
          {/*
            Always mounted, so screen readers announce each new count; a live
            region inserted together with its text is often read silently.
          */}
          <p
            role="status"
            aria-live="polite"
            className={cn(JOURNAL_EYEBROW, "text-journal-muted", searching ? "pb-6 pt-8 sm:pt-10" : "sr-only")}
          >
            {searching ? (
              <>
                {formatStoryCount(articles.length)}
                <span className="sr-only"> for “{query}”</span>
              </>
            ) : null}
          </p>

          {searching ? (
            articles.length > 0 ? (
              <JournalStoryList articles={articles} headingLevel="h2" />
            ) : (
              <NoResults query={query} onClear={controls?.onClear} />
            )
          ) : articles.length > 0 ? (
            <>
              <JournalJourneySections articles={articles} />
              <div className="mt-12 sm:mt-16">
                <JournalRelatedLinks />
              </div>
            </>
          ) : (
            <p className="pt-10 text-base text-journal-muted">The first stories are on their way.</p>
          )}
        </div>
      </div>
    </>
  );
}
