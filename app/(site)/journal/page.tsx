import type { Metadata } from "next";
import { Suspense } from "react";

import { JournalIndexSearch } from "@/components/journal/journal-index-search";
import { JournalIndexView } from "@/components/journal/journal-index-view";
import { getPublishedJournalArticles } from "@/lib/journal/articles";
import { JOURNAL_LABEL } from "@/lib/journal/constants";
import { toJournalCardData } from "@/lib/journal/derive";
import { journalBreadcrumbItems, journalIndexMetadata } from "@/lib/journal/seo";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/json-ld";

export const metadata: Metadata = journalIndexMetadata();

/**
 * The index is fully static. Search runs in the browser over the published
 * stories and keeps `?q=` in the URL; reading search params opts only the
 * Suspense boundary into client rendering, and its fallback is the same list
 * with a plain GET form.
 */
export default function JournalIndexPage() {
  const articles = getPublishedJournalArticles();
  const cards = articles.map(toJournalCardData);
  const entries = articles.map(({ slug, searchText }) => ({ slug, searchText }));

  return (
    <div className="bg-ftt-ivory text-ftt-midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(journalBreadcrumbItems())) }}
      />
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:px-8 lg:pb-24 lg:pt-12">
        <header className="max-w-3xl">
          <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-ftt-burgundy">
            <span aria-hidden="true" className="h-px w-8 bg-ftt-gold" />
            {JOURNAL_LABEL}
          </p>
          <h1 className="mt-5 text-balance font-serif text-[clamp(2.5rem,7vw,4rem)] leading-[0.98] tracking-[-0.02em] text-ftt-navy">
            Stories from the trunk
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-ftt-burgundy/85 sm:text-lg sm:leading-8">
            Buying guides, craft notes and the stories a saree carries from one wardrobe to the next.
          </p>
        </header>

        <Suspense fallback={<JournalIndexView articles={cards} query="" />}>
          <JournalIndexSearch articles={cards} entries={entries} />
        </Suspense>
      </section>
    </div>
  );
}
