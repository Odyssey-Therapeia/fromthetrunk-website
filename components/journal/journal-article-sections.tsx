import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";

import { JournalAccordion } from "@/components/journal/journal-accordion";
import { JournalInline } from "@/components/journal/journal-inline";
import { JournalStoryList } from "@/components/journal/journal-story-list";
import {
  JOURNAL_EYEBROW,
  JOURNAL_FOCUS,
  JOURNAL_FOCUS_ON_NAVY,
  JOURNAL_PILL,
} from "@/components/journal/journal-styles";
import type { JournalArticle, JournalCardData } from "@/lib/journal/derive";
import type { JournalNextAction as JournalNextActionData } from "@/lib/journal/journeys";
import type { JournalLinkResolver } from "@/lib/journal/links";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

/** Articles with at least this many H2s get a table of contents. */
export const JOURNAL_CONTENTS_MIN_HEADINGS = 4;

export type JournalContentsEntry = { id: string; text: string };

const sectionHeadingClass =
  "font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-navy @xl:text-[2rem] @xl:leading-9";

function ContentsList({ entries }: { entries: readonly JournalContentsEntry[] }) {
  return (
    <ol role="list" className="grid">
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            className={cn(
              "flex min-h-11 items-center rounded-sm py-1.5 text-[0.9375rem] leading-[1.375rem] text-journal-navy transition-colors hover:text-journal-navy hover:underline hover:decoration-journal-gold hover:underline-offset-4",
              JOURNAL_FOCUS,
            )}
          >
            {/* Heading text may carry inline markup; any link inside it renders as plain words. */}
            <JournalInline text={entry.text} resolveLink={(href) => ({ kind: "unavailable", href })} />
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Contents, in two forms: a collapsed `<details>` in the reading column below
 * 1280px (placed after the opening paragraph, so the story starts first) and a
 * sticky 14rem rail beside the column from 1280px. Exactly one is displayed.
 */
export function JournalContentsDetails({
  entries,
}: {
  entries: readonly JournalContentsEntry[];
}) {
  return (
    <details className="group/contents border-y border-journal-gold/45 xl:hidden">
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-2 [&::-webkit-details-marker]:hidden",
          JOURNAL_FOCUS,
        )}
      >
        <span className={cn(JOURNAL_EYEBROW, "text-journal-navy")}>In this guide</span>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.6}
          className="size-4 text-journal-navy transition-transform group-open/contents:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <nav aria-label="In this guide" className="pb-3">
        <ContentsList entries={entries} />
      </nav>
    </details>
  );
}

export function JournalContentsRail({
  entries,
}: {
  entries: readonly JournalContentsEntry[];
}) {
  return (
    <nav aria-labelledby="journal-contents-rail" className="sticky top-[8.25rem] hidden xl:block">
      <p id="journal-contents-rail" className={cn(JOURNAL_EYEBROW, "border-b border-journal-gold/45 pb-3 text-journal-muted")}>
        In this guide
      </p>
      <div className="mt-2">
        <ContentsList entries={entries} />
      </div>
    </nav>
  );
}

/**
 * "Questions people ask": one closed row per question (H3 under this H2), so
 * readers scan the questions and open theirs. `itemIds` anchor each row.
 */
export function JournalFaq({
  faq,
  itemIds,
  resolveLink,
}: {
  faq: NonNullable<JournalArticle["faq"]>;
  itemIds: readonly string[];
  resolveLink: JournalLinkResolver;
}) {
  return (
    <section aria-labelledby="journal-faq" className="@container mt-14 @xl:mt-16">
      <h2
        id="journal-faq"
        className={cn(
          sectionHeadingClass,
          "scroll-mt-32 before:mb-4 before:block before:h-px before:w-10 before:bg-journal-gold before:content-['']",
        )}
      >
        {faq.heading}
      </h2>
      <JournalAccordion
        className="mt-3 max-w-[40rem]"
        items={faq.items.map((item, index) => ({
          id: itemIds[index],
          label: smartApostrophes(item.question),
          content: (
            <p className="max-w-[65ch] text-[1.0625rem] leading-[1.875rem] text-journal-muted @xl:text-lg @xl:leading-8">
              <JournalInline text={item.answer} resolveLink={resolveLink} />
            </p>
          ),
        }))}
      />
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
    <div className="mt-12 max-w-[40rem]">
      {about ? (
        <p className="rounded-[1.25rem] border border-journal-navy/15 bg-journal-paper px-5 py-5 text-[0.9375rem] leading-7 text-journal-navy min-[390px]:px-6">
          <JournalInline text={about} resolveLink={resolveLink} />
        </p>
      ) : null}
      {closingLine ? (
        <p className="mt-10 flex flex-col items-center gap-4 text-balance text-center font-journal-serif-italic text-[1.625rem] italic leading-8 text-journal-navy">
          <span aria-hidden="true" className="h-px w-12 bg-journal-gold" />
          {smartApostrophes(closingLine)}
        </p>
      ) : null}
    </div>
  );
}

/** The article's one next action, as a navy band. */
export function JournalNextAction({ action }: { action: JournalNextActionData }) {
  const buttonClass = cn(JOURNAL_PILL, "bg-journal-ivory text-journal-navy hover:bg-white", JOURNAL_FOCUS_ON_NAVY);

  return (
    <section
      aria-labelledby="journal-next-action"
      className="@container rounded-[1.5rem] bg-journal-navy px-5 py-8 text-journal-ivory min-[390px]:px-6 sm:px-10 sm:py-10 lg:px-12"
    >
      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-end @3xl:justify-between @3xl:gap-12">
        <div className="max-w-xl">
          <p className={cn(JOURNAL_EYEBROW, "text-journal-gold")}>Next from the trunk</p>
          <h2
            id="journal-next-action"
            className="mt-3 text-balance font-journal-serif text-[1.625rem] font-medium leading-8 text-journal-ivory @xl:text-[2rem] @xl:leading-9"
          >
            {action.heading}
          </h2>
          <p className="mt-2 text-base leading-7 text-journal-ivory/85">{action.description}</p>
        </div>
        {action.options ? (
          <div className="shrink-0">
            <p className={cn(JOURNAL_EYEBROW, "text-journal-ivory/80")}>{action.label}</p>
            <ul role="list" className="mt-3 flex flex-wrap gap-2">
              {action.options.map((option) => (
                <li key={option.href}>
                  <Link href={option.href} className={buttonClass}>
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Link href={action.href} className={cn(buttonClass, "shrink-0 px-6")}>
            {action.label}
            <ArrowRight aria-hidden="true" strokeWidth={1.6} className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

/** Up to three next reads. Renders nothing until there is at least one. */
export function JournalNextReads({ articles }: { articles: readonly JournalCardData[] }) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="journal-next-reads" className="@container">
      <h2 id="journal-next-reads" className={sectionHeadingClass}>
        Read next
      </h2>
      <JournalStoryList articles={articles} className="mt-6" />
    </section>
  );
}
