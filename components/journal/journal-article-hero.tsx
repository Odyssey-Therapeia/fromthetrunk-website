import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { JournalCoverPlaceholder } from "@/components/journal/journal-cover-placeholder";
import { JournalShare } from "@/components/journal/journal-share";
import {
  JOURNAL_EYEBROW,
  JOURNAL_FOCUS,
  JOURNAL_META,
  journalHeroCoverPosition,
} from "@/components/journal/journal-styles";
import type { JournalArticle } from "@/lib/journal/derive";
import { journalBreadcrumbTrail } from "@/lib/journal/journeys";
import { formatReadingTime } from "@/lib/journal/reading-time";
import { smartApostrophes } from "@/lib/journal/text";
import { cn } from "@/lib/utils";

/**
 * The faded cover takes the right 55% of the 1200px container from 944px up
 * (where the header container reaches 56rem), full width below it.
 */
export const JOURNAL_HERO_SIZES = "(min-width: 1280px) 660px, (min-width: 944px) 55vw, calc(100vw - 32px)";

type JournalArticleHeroProps = {
  article: JournalArticle;
  shareUrl: string;
  shareImageUrl: string | null;
};

const crumbLinkClass = cn(
  "inline-flex min-h-11 items-center rounded-sm text-journal-muted transition-colors hover:text-journal-navy",
  JOURNAL_FOCUS,
);

/**
 * Home › Journal › Journey. The article title is the H1 right below, so it is
 * not repeated here; an article outside every journey stops at Journal.
 */
export function JournalBreadcrumb({ slug }: { slug: string }) {
  const crumbs = journalBreadcrumbTrail(slug);

  return (
    <nav aria-label="Breadcrumb">
      <ol className={cn(JOURNAL_META, "flex flex-wrap items-center gap-x-1.5")}>
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight aria-hidden="true" strokeWidth={1.6} className="size-3.5 text-journal-gold" /> : null}
            <Link href={crumb.href} className={crumbLinkClass}>
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Compressed article hero: tag, H1, description and one meta line, then the
 * cover. Below a 56rem container the cover follows the meta line at full
 * width. From 56rem it sits behind the right of the band, top to just above
 * the separator, and its left edge fades into the ivory; the fade stays fully
 * transparent across the text column (see `.journal-hero-media`). Without a
 * photo the slot shows the Journal placeholder art, so every article has one.
 */
export function JournalArticleHero({ article, shareUrl, shareImageUrl }: JournalArticleHeroProps) {
  const cover = article.cover;

  return (
    <header className="@container relative isolate">
      <div className="grid gap-y-3">
        <div className="min-w-0">
          <p className={cn(JOURNAL_EYEBROW, "text-journal-muted")}>{article.tag}</p>
          <h1 className="mt-3 max-w-[44rem] text-balance font-journal-serif text-[1.875rem] font-medium leading-[2.125rem] text-journal-navy @xl:text-[2.75rem] @xl:leading-[3rem]">
            {smartApostrophes(article.title)}
          </h1>
        </div>

        <div className="min-w-0">
          <p className="max-w-[40rem] text-pretty text-base leading-7 text-journal-muted @xl:text-lg @xl:leading-7">
            {smartApostrophes(article.description)}
          </p>
          <ul
            className={cn(
              JOURNAL_META,
              "mt-2 flex flex-wrap items-center gap-x-4 text-journal-muted [&>li]:flex [&>li]:items-center",
            )}
          >
            {article.publishedAt ? (
              <li>
                <span className="sr-only">Published </span>
                <time dateTime={article.publishedAt}>{article.dateLabel}</time>
              </li>
            ) : null}
            <li>{formatReadingTime(article.readingMinutes)}</li>
            <li className="text-journal-navy">
              <JournalShare
                url={shareUrl}
                title={article.title}
                text={article.description}
                imageUrl={shareImageUrl}
              />
            </li>
          </ul>
        </div>

        <div className="journal-hero-media">
          {cover ? (
            <Image
              src={cover.src}
              alt={cover.alt}
              fill
              priority
              fetchPriority="high"
              quality={75}
              sizes={JOURNAL_HERO_SIZES}
              className={cn("object-cover", journalHeroCoverPosition(cover.src))}
            />
          ) : (
            <JournalCoverPlaceholder variant="hero" />
          )}
        </div>
      </div>
    </header>
  );
}
