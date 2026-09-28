import { Search } from "lucide-react";
import type { ChangeEventHandler, FormEventHandler, RefObject } from "react";

import { JOURNAL_CARD_GRID, JournalCard } from "@/components/journal/journal-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOURNAL_PATH } from "@/lib/journal/constants";
import type { JournalCardData } from "@/lib/journal/derive";
import { formatStoryCount } from "@/lib/journal/search";
import { cn } from "@/lib/utils";

export const JOURNAL_SEARCH_PLACEHOLDER = "Search the journal";

type SearchControls = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

type JournalIndexViewProps = {
  articles: readonly JournalCardData[];
  /** Trimmed query; all result counts use the same card grid. */
  query: string;
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
      className="flex w-full max-w-xl items-stretch gap-2"
    >
      <label htmlFor="journal-search" className="sr-only">
        {JOURNAL_SEARCH_PLACEHOLDER}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          strokeWidth={1.6}
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ftt-burgundy/70"
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
          className="h-12 rounded-full border-ftt-burgundy/20 bg-ftt-card pl-11 pr-4 text-base text-ftt-midnight shadow-none placeholder:text-ftt-burgundy/65 focus-visible:border-ftt-gold focus-visible:ring-2 focus-visible:ring-ftt-gold/40 md:text-sm [&::-webkit-search-cancel-button]:cursor-pointer"
        />
      </div>
      <Button
        type="submit"
        className="h-12 shrink-0 rounded-full px-6 text-sm tracking-[0.04em] focus-visible:ring-ftt-gold"
      >
        Search
      </Button>
    </form>
  );
}

function NoResults({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-[1.35rem] border border-ftt-border bg-ftt-card px-6 py-12 text-center sm:px-10 sm:py-16">
      <svg
        viewBox="0 0 42 14"
        className="h-3.5 w-12 text-ftt-gold"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        aria-hidden="true"
      >
        <path d="M1 7h14" />
        <path d="M27 7h14" />
        <path d="M21 2.2c2.1 1.7 3.2 3.3 3.2 4.8S23.1 10.1 21 11.8c-2.1-1.7-3.2-3.3-3.2-4.8S18.9 3.9 21 2.2Z" />
      </svg>
      <h2 className="mt-5 text-balance font-serif text-2xl leading-tight text-ftt-navy sm:text-[1.75rem]">
        Nothing in the trunk for “{query}”
      </h2>
      <p className="mt-3 text-sm leading-6 text-ftt-burgundy/80 sm:text-base sm:leading-7">
        Try a different word, such as silk or zari, or clear the search to see every story.
      </p>
      {onClear ? (
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          className="mt-7 h-11 rounded-full border-ftt-burgundy/30 bg-transparent px-6 text-ftt-burgundy hover:bg-ftt-burgundy/5 hover:text-ftt-burgundy focus-visible:ring-ftt-gold"
        >
          Clear search
        </Button>
      ) : (
        <Button
          asChild
          variant="outline"
          className="mt-7 h-11 rounded-full border-ftt-burgundy/30 bg-transparent px-6 text-ftt-burgundy hover:bg-ftt-burgundy/5 hover:text-ftt-burgundy focus-visible:ring-ftt-gold"
        >
          <a href={JOURNAL_PATH}>Clear search</a>
        </Button>
      )}
    </div>
  );
}

/**
 * The journal index body: editorial header, search and the story list. Shared
 * by the static (pre-hydration) render and the client search wrapper so both
 * produce the same markup.
 */
export function JournalIndexView({ articles, query, controls }: JournalIndexViewProps) {
  const searching = query.length > 0;

  return (
    <>
      <div className="mt-8 sm:mt-10">
        <JournalSearchForm controls={controls} />
      </div>

      <div className="@container mt-10 sm:mt-12 lg:mt-14">
        {/*
          Always mounted, so screen readers announce each new count; a live
          region inserted together with its text is often read silently.
        */}
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.3em] text-ftt-burgundy/80",
            searching ? "mb-6" : "sr-only",
          )}
        >
          {searching ? (
            <>
              {formatStoryCount(articles.length)}
              <span className="sr-only"> for “{query}”</span>
            </>
          ) : null}
        </p>
        {articles.length > 0 ? (
          <ul role="list" className={JOURNAL_CARD_GRID}>
            {articles.map((article, index) => (
              <li key={article.slug} className="min-w-0">
                <JournalCard article={article} priority={index === 0} />
              </li>
            ))}
          </ul>
        ) : searching ? (
          <NoResults query={query} onClear={controls?.onClear} />
        ) : (
          <p className="text-base text-ftt-burgundy/80">The first stories are on their way.</p>
        )}
      </div>
    </>
  );
}
