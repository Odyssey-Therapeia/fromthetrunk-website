import Image from "next/image";
import Link from "next/link";

import { JOURNAL_CARD_GRID, JournalCard } from "@/components/journal/journal-card";
import { JournalCoverPlaceholder } from "@/components/journal/journal-cover-placeholder";
import { JournalShare } from "@/components/journal/journal-share";
import {
  JOURNAL_EYEBROW,
  JOURNAL_FOCUS,
  JOURNAL_META,
  journalCoverPosition,
} from "@/components/journal/journal-styles";
import type { JournalCardData } from "@/lib/journal/derive";
import { formatReadingTime } from "@/lib/journal/reading-time";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

type HeadingLevel = "h2" | "h3";

/** Date (when known), reading time and Share, on one 14/20 line. */
export function JournalStoryMeta({
  article,
  className,
}: {
  article: Pick<JournalCardData, "dateLabel" | "description" | "publishedAt" | "readingMinutes" | "shareUrl" | "title">;
  className?: string;
}) {
  return (
    <ul className={cn(JOURNAL_META, "flex flex-wrap items-center gap-x-4 text-journal-muted", className)}>
      {article.publishedAt ? (
        <li>
          <span className="sr-only">Published </span>
          <time dateTime={article.publishedAt}>{article.dateLabel}</time>
        </li>
      ) : null}
      <li>{formatReadingTime(article.readingMinutes)}</li>
      <li className="relative z-10 text-journal-navy">
        <JournalShare
          url={article.shareUrl}
          title={article.title}
          text={article.description}
          className="-my-1.5"
        />
      </li>
    </ul>
  );
}

/**
 * Compact row for narrow columns: 88:105 thumbnail, tag, title, a short
 * description, then date, reading time and Share. The title link stretches
 * over the whole row; Share sits above it.
 */
function JournalStoryRow({ article, headingLevel: Heading }: { article: JournalCardData; headingLevel: HeadingLevel }) {
  return (
    <article className="relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 py-5">
      <div className="relative aspect-[88/105] w-[5.5rem] overflow-hidden rounded-xl bg-journal-navy">
        {article.cover ? (
          <Image
            src={article.cover.src}
            alt=""
            fill
            quality={70}
            sizes="88px"
            className={cn("object-cover", journalCoverPosition(article.cover.src))}
          />
        ) : (
          <JournalCoverPlaceholder variant="thumb" />
        )}
      </div>
      <div className="min-w-0">
        <p className={cn(JOURNAL_EYEBROW, "text-journal-muted")}>{article.tag}</p>
        <Heading className="mt-1.5 font-journal-serif text-[1.375rem] font-semibold leading-[1.625rem] text-journal-navy">
          <Link
            href={article.path}
            className={cn(
              "rounded-sm after:absolute after:inset-0 after:content-[''] hover:underline hover:decoration-journal-gold hover:decoration-1 hover:underline-offset-4",
              JOURNAL_FOCUS,
            )}
          >
            {smartApostrophes(article.title)}
          </Link>
        </Heading>
        <p className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-[1.375rem] text-journal-navy/85">
          {smartApostrophes(article.description)}
        </p>
        <JournalStoryMeta article={article} className="mt-2" />
      </div>
    </article>
  );
}

/**
 * A list of stories: gold-hairline rows in narrow columns, fixed 22rem cards
 * once the column fits two (45rem). Exactly one of the two renders (the other
 * is display:none, so it is out of the accessibility tree).
 */
export function JournalStoryList({
  articles,
  headingLevel = "h3",
  className,
}: {
  articles: readonly JournalCardData[];
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  return (
    <div className={cn("@container", className)}>
      <ul role="list" className="divide-y divide-journal-gold/45 border-y border-journal-gold/45 @[45rem]:hidden">
        {articles.map((article) => (
          <li key={article.slug}>
            <JournalStoryRow article={article} headingLevel={headingLevel} />
          </li>
        ))}
      </ul>
      <ul role="list" className={cn(JOURNAL_CARD_GRID, "hidden @[45rem]:grid")}>
        {articles.map((article) => (
          <li key={article.slug} className="min-w-0">
            <JournalCard article={article} headingLevel={headingLevel} />
          </li>
        ))}
      </ul>
    </div>
  );
}
