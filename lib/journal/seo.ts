import type { Metadata, MetadataRoute } from "next";

import { JOURNAL_LABEL, JOURNAL_PATH } from "@/lib/journal/constants";
import type { JournalArticle } from "@/lib/journal/derive";
import { journalDateTime } from "@/lib/journal/format-date";
import { toSeoImageUrl } from "@/lib/seo/image-urls";
import { publicPageMetadata, SITE_NAME } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site-url";

export const JOURNAL_INDEX_TITLE = `${JOURNAL_LABEL} | ${SITE_NAME}`;

export const JOURNAL_INDEX_DESCRIPTION =
  "Buying guides and stories from From The Trunk: what preloved really means, how to read a saree's condition, and the craft behind silk and zari.";

export function journalIndexMetadata(): Metadata {
  return publicPageMetadata({
    title: JOURNAL_INDEX_TITLE,
    description: JOURNAL_INDEX_DESCRIPTION,
    path: JOURNAL_PATH,
  });
}

function articleKeywords(article: JournalArticle): string[] {
  const keywords = [article.seo.primaryKeyword, ...article.seo.keywords].filter(
    (keyword): keyword is string => Boolean(keyword),
  );
  return Array.from(new Set(keywords));
}

export function journalArticleMetadata(article: JournalArticle): Metadata {
  const base = publicPageMetadata({
    title: article.seo.title,
    description: article.seo.description,
    path: article.path,
    // Never the AVIF cover itself: social previews need a JPG or PNG, so
    // without one the site's default social image stands in.
    image: article.socialImage
      ? { url: article.socialImage, alt: article.cover?.alt }
      : undefined,
  });
  const keywords = articleKeywords(article);

  return {
    ...base,
    keywords,
    openGraph: {
      ...base.openGraph,
      type: "article",
      ...(article.publishedAt ? { publishedTime: journalDateTime(article.publishedAt) } : {}),
      ...(article.modifiedAt ? { modifiedTime: journalDateTime(article.modifiedAt) } : {}),
      section: article.tag,
      tags: keywords,
    },
  };
}

const FTT_ORGANIZATION = {
  "@type": "Organization",
  name: SITE_NAME,
  url: absoluteUrl("/"),
} as const;

export function journalArticleJsonLd(article: JournalArticle): Record<string, unknown> {
  const url = absoluteUrl(article.path);
  const image = toSeoImageUrl(article.socialImage ?? article.cover?.src);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    ...(image ? { image: [image] } : {}),
    ...(article.publishedAt ? { datePublished: journalDateTime(article.publishedAt) } : {}),
    ...(article.modifiedAt ? { dateModified: journalDateTime(article.modifiedAt) } : {}),
    author: { ...FTT_ORGANIZATION },
    publisher: {
      ...FTT_ORGANIZATION,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/Ftt_logo_navbar.avif"),
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    articleSection: article.tag,
    keywords: articleKeywords(article).join(", "),
    wordCount: article.wordCount,
    inLanguage: "en-IN",
  };
}

export function journalBreadcrumbItems(article?: Pick<JournalArticle, "path" | "title">) {
  return [
    { name: "Home", url: absoluteUrl("/") },
    { name: JOURNAL_LABEL, url: absoluteUrl(JOURNAL_PATH) },
    ...(article ? [{ name: article.title, url: absoluteUrl(article.path) }] : []),
  ];
}

/**
 * Sitemap entries: the index, then each published article. An article's
 * lastModified is updatedAt ?? publishedAt; the index takes the newest of
 * those, since it changes whenever a story is added or revised.
 */
export function journalSitemapEntries(
  articles: readonly Pick<JournalArticle, "modifiedAt" | "path">[],
): MetadataRoute.Sitemap {
  const articleEntries = articles.map((article) => ({
    url: absoluteUrl(article.path),
    ...(article.modifiedAt ? { lastModified: new Date(article.modifiedAt) } : {}),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  const newest = articleEntries.reduce<Date | undefined>(
    (latest, entry) => entry.lastModified && (!latest || entry.lastModified > latest) ? entry.lastModified : latest,
    undefined,
  );

  return [
    {
      url: absoluteUrl(JOURNAL_PATH),
      ...(newest ? { lastModified: newest } : {}),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...articleEntries,
  ];
}
