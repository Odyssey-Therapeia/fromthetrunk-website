import type { Metadata } from "next";
import { Suspense } from "react";

import { JournalIndexSearch } from "@/components/journal/journal-index-search";
import { JournalIndexView } from "@/components/journal/journal-index-view";
import { JOURNAL_EYEBROW } from "@/components/journal/journal-styles";
import { getLiveJournalArticles } from "@/lib/journal/articles";
import { JOURNAL_LABEL } from "@/lib/journal/constants";
import { toJournalCardData } from "@/lib/journal/derive";
import { journalBreadcrumbJsonLd, journalIndexJsonLd, journalIndexMetadata } from "@/lib/journal/seo";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { cn } from "@/lib/utils";

export const metadata: Metadata = journalIndexMetadata();

function JournalIntro() {
  return (
    <header className="max-w-[40rem]">
      <p className={cn(JOURNAL_EYEBROW, "flex items-center gap-3 text-journal-gold")}>
        <span aria-hidden="true" className="h-px w-8 bg-journal-gold" />
        The Trunk {JOURNAL_LABEL}
      </p>
      <h1
        id="journal-title"
        className="mt-4 text-balance font-journal-serif text-[1.875rem] font-medium leading-[2.125rem] text-journal-ivory sm:text-[2.75rem] sm:leading-[3rem]"
      >
        Stories from the trunk
      </h1>
      <p className="mt-3 text-pretty text-base leading-7 text-journal-ivory/85 sm:text-lg sm:leading-8">
        Buying guides, craft notes and the stories a saree carries from one wardrobe to the next.
      </p>
    </header>
  );
}

/**
 * The index is fully static. Search runs in the browser over the published
 * stories and keeps `?q=` in the URL; reading search params opts only the
 * Suspense boundary into client rendering, and its fallback is the same page
 * with a plain GET form.
 */
export default function JournalIndexPage() {
  const articles = getLiveJournalArticles();
  const cards = articles.map(toJournalCardData);
  const entries = articles.map(({ slug, searchText }) => ({ slug, searchText }));
  const intro = <JournalIntro />;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(journalIndexJsonLd(articles)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(journalBreadcrumbJsonLd()) }}
      />
      <Suspense fallback={<JournalIndexView articles={cards} query="" intro={intro} />}>
        <JournalIndexSearch articles={cards} entries={entries} intro={intro} />
      </Suspense>
    </>
  );
}
