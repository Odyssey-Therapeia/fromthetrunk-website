import { CalendarDays, ChevronRight, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { JournalCoverPlaceholder } from "@/components/journal/journal-cover-placeholder";
import { JournalShare } from "@/components/journal/journal-share";
import { JOURNAL_LABEL, JOURNAL_PATH } from "@/lib/journal/constants";
import type { JournalArticle } from "@/lib/journal/derive";
import { formatReadingTime } from "@/lib/journal/reading-time";
import { smartApostrophes } from "@/lib/journal/text";

type JournalArticleHeroProps = {
  article: JournalArticle;
  shareUrl: string;
  shareImageUrl: string | null;
};

/** Home › Journal › title. Rendered by the page, above the article. */
export function JournalBreadcrumb({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-burgundy/80">
        <li className="shrink-0">
          <Link href="/" className="rounded-sm transition-colors hover:text-ftt-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ftt-gold">
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="shrink-0">
          <ChevronRight className="size-3 text-ftt-gold" />
        </li>
        <li className="shrink-0">
          <Link
            href={JOURNAL_PATH}
            className="rounded-sm transition-colors hover:text-ftt-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ftt-gold"
          >
            {JOURNAL_LABEL}
          </Link>
        </li>
        <li aria-hidden="true" className="shrink-0">
          <ChevronRight className="size-3 text-ftt-gold" />
        </li>
        <li className="min-w-0 truncate text-ftt-navy">
          <span aria-current="page">{smartApostrophes(title)}</span>
        </li>
      </ol>
    </nav>
  );
}

/**
 * Article hero. Mobile: text, then the cover. From a 56rem container the text
 * sits left and the cover takes the right ~55%. With no cover, the designed
 * placeholder plate takes the cover's place, so the hero keeps its shape.
 */
export function JournalArticleHero({ article, shareUrl, shareImageUrl }: JournalArticleHeroProps) {
  return (
    <header className="@container">
      <div className="grid gap-9 @4xl:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] @4xl:items-center @4xl:gap-12 @6xl:gap-16">
        <div className="min-w-0">
          <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-ftt-burgundy">
            <span aria-hidden="true" className="h-px w-8 bg-ftt-gold" />
            {article.tag}
          </p>
          <h1 className="mt-5 text-balance font-serif text-[clamp(2.25rem,8cqi,3.6rem)] leading-[1.04] tracking-[-0.015em] text-ftt-navy @4xl:text-[clamp(2.6rem,4.6cqi,4rem)]">
            {smartApostrophes(article.title)}
          </h1>
          <p className="mt-5 max-w-[36rem] text-pretty text-base leading-7 text-ftt-burgundy/85 sm:text-lg sm:leading-8">
            {smartApostrophes(article.description)}
          </p>

          <ul className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-ftt-border pt-4 text-sm text-ftt-burgundy/85">
            <li className="flex h-10 items-center gap-2">
              <CalendarDays aria-hidden="true" strokeWidth={1.5} className="size-4 text-ftt-burgundy" />
              <span className="sr-only">Published </span>
              <time dateTime={article.publishedAt}>{article.dateLabel}</time>
            </li>
            <li className="flex h-10 items-center gap-2">
              <Clock aria-hidden="true" strokeWidth={1.5} className="size-4 text-ftt-burgundy" />
              {formatReadingTime(article.readingMinutes)}
            </li>
            <li className="flex items-center">
              <JournalShare
                url={shareUrl}
                title={article.title}
                text={article.description}
                imageUrl={shareImageUrl}
              />
            </li>
          </ul>
        </div>

        <div className="relative aspect-4/3 overflow-hidden rounded-[1.35rem] bg-ftt-navy shadow-[var(--ftt-soft-shadow)] @4xl:aspect-[5/4]">
          {article.cover ? (
            <Image
              src={article.cover.src}
              alt={article.cover.alt}
              fill
              priority
              quality={75}
              sizes="(min-width: 1280px) 670px, (min-width: 1024px) 55vw, 100vw"
              className="object-cover"
            />
          ) : (
            <JournalCoverPlaceholder tag={article.tag} variant="hero" />
          )}
        </div>
      </div>
    </header>
  );
}
