import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalArticleBody } from "@/components/journal/journal-article-body";
import { JournalArticleHero, JournalBreadcrumb } from "@/components/journal/journal-article-hero";
import {
  JOURNAL_CONTENTS_MIN_HEADINGS,
  JournalContentsDetails,
  JournalContentsRail,
  JournalFaq,
  JournalNextAction,
  JournalNextReads,
  JournalSignOff,
  type JournalContentsEntry,
} from "@/components/journal/journal-article-sections";
import { JOURNAL_CONTAINER, JOURNAL_GUTTERS } from "@/components/journal/journal-styles";
import { JOURNAL_EXPANDABLE_SECTIONS, journalFaqItemIds } from "@/lib/journal/accordion";
import {
  getLiveJournalArticle,
  getLiveJournalArticles,
  getLiveJournalLinkResolver,
  getPublishedJournalArticles,
} from "@/lib/journal/articles";
import { toJournalCardData } from "@/lib/journal/derive";
import { journalNextAction, rankJournalNextReads } from "@/lib/journal/journeys";
import { journalArticleJsonLd, journalArticleMetadata, journalBreadcrumbJsonLd } from "@/lib/journal/seo";
import { toSeoImageUrl } from "@/lib/seo/image-urls";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

type JournalArticlePageProps = {
  params: Promise<{ slug: string }>;
};

// Any slug outside the build list is a 404 without a lookup.
export const dynamicParams = false;

/**
 * Every non-draft article gets a path, including scheduled ones: until its
 * `publishedAt` passes, the page calls notFound(). The route revalidates, so a
 * scheduled story goes live on the first regeneration after its date, without
 * a new build. Drafts never get a path.
 */
export function generateStaticParams() {
  return getPublishedJournalArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: JournalArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getLiveJournalArticle(slug);
  // A scheduled story 404s until its date; keep it out of the index meanwhile.
  if (!article) return { robots: { index: false, follow: true } };
  return journalArticleMetadata(article);
}

export default async function JournalArticlePage({ params }: JournalArticlePageProps) {
  const { slug } = await params;
  const article = getLiveJournalArticle(slug);
  if (!article) notFound();

  const resolveLink = getLiveJournalLinkResolver();
  const nextReads = rankJournalNextReads(article.slug, getLiveJournalArticles()).map(toJournalCardData);
  const contents: JournalContentsEntry[] = article.body.flatMap((block) =>
    block.type === "heading" && block.level === 2 ? [{ id: block.id, text: block.text }] : [],
  );
  const showContents = contents.length >= JOURNAL_CONTENTS_MIN_HEADINGS;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(journalArticleJsonLd(article)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(journalBreadcrumbJsonLd(article)) }}
      />

      <div className={JOURNAL_GUTTERS}>
        <div className={cn(JOURNAL_CONTAINER, "pb-16 pt-3 sm:pb-20 sm:pt-5 lg:pb-24")}>
          <JournalBreadcrumb slug={article.slug} />

          <article className="mt-2 sm:mt-4">
            <JournalArticleHero
              article={article}
              shareUrl={absoluteUrl(article.path)}
              shareImageUrl={toSeoImageUrl(article.socialImage)}
            />

            <div
              className={cn(
                "mt-6 border-t border-journal-gold/45 pt-6 sm:mt-8 sm:pt-8",
                showContents && "xl:grid xl:grid-cols-[14rem_minmax(0,44rem)] xl:items-start xl:gap-x-16",
              )}
            >
              {showContents ? <JournalContentsRail entries={contents} /> : null}
              <div className="@container max-w-[44rem]">
                <JournalArticleBody
                  body={article.body}
                  resolveLink={resolveLink}
                  afterLede={showContents ? <JournalContentsDetails entries={contents} /> : null}
                  expandableSectionId={JOURNAL_EXPANDABLE_SECTIONS[article.slug]}
                />
                {article.faq ? (
                  <JournalFaq faq={article.faq} itemIds={journalFaqItemIds(article)} resolveLink={resolveLink} />
                ) : null}
                <JournalSignOff
                  about={article.about}
                  closingLine={article.closingLine}
                  resolveLink={resolveLink}
                />
              </div>
            </div>
          </article>

          <div className="mt-14 grid gap-14 sm:mt-16 sm:gap-16">
            <JournalNextAction action={journalNextAction(article.slug)} />
            <JournalNextReads articles={nextReads} />
          </div>
        </div>
      </div>
    </>
  );
}
