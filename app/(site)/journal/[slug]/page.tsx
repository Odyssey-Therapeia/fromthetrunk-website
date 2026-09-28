import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalArticleBody } from "@/components/journal/journal-article-body";
import { JournalArticleHero, JournalBreadcrumb } from "@/components/journal/journal-article-hero";
import {
  JournalCollectionCta,
  JournalFaq,
  JournalMoreStories,
  JournalSignOff,
} from "@/components/journal/journal-article-sections";
import {
  getJournalLinkResolver,
  getPublishedJournalArticle,
  getPublishedJournalArticles,
} from "@/lib/journal/articles";
import { toJournalCardData } from "@/lib/journal/derive";
import {
  journalArticleJsonLd,
  journalArticleMetadata,
  journalBreadcrumbItems,
} from "@/lib/journal/seo";
import { toSeoImageUrl } from "@/lib/seo/image-urls";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/seo/site-url";

const MORE_STORIES_LIMIT = 3;

type JournalArticlePageProps = {
  params: Promise<{ slug: string }>;
};

// Only published articles exist; any other slug is a 404 without a lookup.
export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedJournalArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: JournalArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getPublishedJournalArticle(slug);
  if (!article) return {};
  return journalArticleMetadata(article);
}

export default async function JournalArticlePage({ params }: JournalArticlePageProps) {
  const { slug } = await params;
  const article = getPublishedJournalArticle(slug);
  if (!article) notFound();

  const resolveLink = getJournalLinkResolver();
  const moreStories = getPublishedJournalArticles()
    .filter((entry) => entry.slug !== article.slug)
    .slice(0, MORE_STORIES_LIMIT)
    .map(toJournalCardData);

  return (
    <div className="bg-ftt-ivory text-ftt-midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(journalArticleJsonLd(article)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd(journalBreadcrumbItems(article))),
        }}
      />

      <article>
        <div className="border-b border-ftt-border bg-secondary">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:pb-14">
            <JournalBreadcrumb title={article.title} />
            <div className="mt-8 lg:mt-10">
              <JournalArticleHero
                article={article}
                shareUrl={absoluteUrl(article.path)}
                shareImageUrl={toSeoImageUrl(article.socialImage)}
              />
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
          <div className="mx-auto max-w-[68ch]">
            <JournalArticleBody body={article.body} resolveLink={resolveLink} />
            {article.faq ? <JournalFaq faq={article.faq} resolveLink={resolveLink} /> : null}
            <JournalSignOff
              about={article.about}
              closingLine={article.closingLine}
              resolveLink={resolveLink}
            />
          </div>
        </div>
      </article>

      <div className="mx-auto mt-16 grid w-full max-w-7xl gap-16 px-4 pb-16 sm:mt-20 sm:gap-20 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <JournalCollectionCta />
        <JournalMoreStories articles={moreStories} />
      </div>
    </div>
  );
}
