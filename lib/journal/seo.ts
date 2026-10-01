import type { Metadata, MetadataRoute } from "next";

import {
  JOURNAL_LABEL,
  JOURNAL_OG_IMAGE_SIZE,
  JOURNAL_PATH,
  journalOgImagePath,
} from "@/lib/journal/constants";
import type { JournalArticle } from "@/lib/journal/derive";
import { journalDateTime } from "@/lib/journal/format-date";
import { journalBreadcrumbTrail } from "@/lib/journal/journeys";
import { toSeoImageUrl } from "@/lib/seo/image-urls";
import { breadcrumbJsonLd, organizationJsonLdId, websiteJsonLdId } from "@/lib/seo/json-ld";
import { DEFAULT_SOCIAL_IMAGE, publicPageMetadata, SITE_NAME } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site-url";

export const JOURNAL_INDEX_TITLE = `${JOURNAL_LABEL} | ${SITE_NAME}`;

export const JOURNAL_INDEX_DESCRIPTION =
  "Buying guides and stories from From The Trunk: what preloved really means, how to read a saree's condition, and the craft behind silk and zari.";

/** Stated outright on every Journal page rather than left to the default. */
const JOURNAL_ROBOTS = { index: true, follow: true } as const;

export function journalIndexMetadata(): Metadata {
  return {
    ...publicPageMetadata({
      title: JOURNAL_INDEX_TITLE,
      description: JOURNAL_INDEX_DESCRIPTION,
      path: JOURNAL_PATH,
    }),
    robots: JOURNAL_ROBOTS,
  };
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
      ? {
          url: article.socialImage,
          alt: article.cover?.alt,
          ...(article.socialImage === journalOgImagePath(article.slug) ? JOURNAL_OG_IMAGE_SIZE : {}),
        }
      : undefined,
  });
  const keywords = articleKeywords(article);

  return {
    ...base,
    robots: JOURNAL_ROBOTS,
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

/** `@id` of a Journal page's BreadcrumbList. */
export function journalBreadcrumbJsonLdId(path: string): string {
  return `${absoluteUrl(path)}#breadcrumb`;
}

/**
 * BlogPosting, linked by `@id` to the sitewide Organization (author and
 * publisher) and WebSite from the root layout, and to this page's
 * BreadcrumbList. The images are the JPG/PNG social image (else the site's
 * default social JPG) followed by the cover itself: never the AVIF cover alone.
 */
export function journalArticleJsonLd(article: JournalArticle): Record<string, unknown> {
  const url = absoluteUrl(article.path);
  const image = Array.from(
    new Set(
      [article.socialImage ?? DEFAULT_SOCIAL_IMAGE.url, article.cover?.src]
        .map(toSeoImageUrl)
        .filter((src): src is string => Boolean(src)),
    ),
  );
  const organization = {
    "@type": "Organization",
    "@id": organizationJsonLdId(),
    name: SITE_NAME,
    url: absoluteUrl("/"),
  };

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.description,
    ...(image.length > 0 ? { image } : {}),
    ...(article.publishedAt ? { datePublished: journalDateTime(article.publishedAt) } : {}),
    ...(article.modifiedAt ? { dateModified: journalDateTime(article.modifiedAt) } : {}),
    author: organization,
    publisher: {
      ...organization,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/Ftt_logo_navbar.avif"),
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
      url,
      isPartOf: { "@id": websiteJsonLdId() },
      breadcrumb: { "@id": journalBreadcrumbJsonLdId(article.path) },
    },
    url,
    articleSection: article.tag,
    keywords: articleKeywords(article).join(", "),
    wordCount: article.wordCount,
    inLanguage: "en-IN",
  };
}

/**
 * The visible breadcrumb, Home › Journal › Journey, as absolute URLs. The
 * journey crumb keeps its `#journey-…` anchor on the index, which
 * `absoluteUrl` would otherwise strip into a second "Journal".
 */
export function journalBreadcrumbItems(article?: Pick<JournalArticle, "slug">) {
  return journalBreadcrumbTrail(article?.slug).map((crumb) => {
    const [pathname, anchor] = crumb.href.split("#");
    return { name: crumb.label, url: `${absoluteUrl(pathname)}${anchor ? `#${anchor}` : ""}` };
  });
}

/** BreadcrumbList for the index or an article, with the `@id` BlogPosting links to. */
export function journalBreadcrumbJsonLd(
  article?: Pick<JournalArticle, "path" | "slug">,
): Record<string, unknown> {
  return {
    ...breadcrumbJsonLd(journalBreadcrumbItems(article)),
    "@id": journalBreadcrumbJsonLdId(article?.path ?? JOURNAL_PATH),
  };
}

/**
 * Blog for the index: the Journal as a whole, published by the sitewide
 * Organization, listing each live story by URL.
 */
export function journalIndexJsonLd(
  articles: readonly Pick<JournalArticle, "path" | "title">[],
): Record<string, unknown> {
  const url = absoluteUrl(JOURNAL_PATH);
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${url}#blog`,
    name: `${SITE_NAME} ${JOURNAL_LABEL}`,
    description: JOURNAL_INDEX_DESCRIPTION,
    url,
    inLanguage: "en-IN",
    isPartOf: { "@id": websiteJsonLdId() },
    publisher: { "@id": organizationJsonLdId() },
    breadcrumb: { "@id": journalBreadcrumbJsonLdId(JOURNAL_PATH) },
    blogPost: articles.map((article) => ({
      "@type": "BlogPosting",
      "@id": `${absoluteUrl(article.path)}#article`,
      headline: article.title,
      url: absoluteUrl(article.path),
    })),
  };
}

/**
 * Sitemap entries: the index, then each published article with its cover as
 * an image entry. An article's lastModified is updatedAt ?? publishedAt,
 * written exactly as BlogPosting's dateModified (IST midnight for a bare
 * date); the index takes the newest of those, since it changes whenever a
 * story is added or revised.
 */
export function journalSitemapEntries(
  articles: readonly (Pick<JournalArticle, "modifiedAt" | "path"> & Partial<Pick<JournalArticle, "cover">>)[],
): MetadataRoute.Sitemap {
  const articleEntries = articles.map((article) => {
    const cover = toSeoImageUrl(article.cover?.src);
    return {
      url: absoluteUrl(article.path),
      ...(article.modifiedAt ? { lastModified: journalDateTime(article.modifiedAt) } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.7,
      ...(cover ? { images: [cover] } : {}),
    };
  });
  const newest = articleEntries.reduce<string | undefined>(
    (latest, entry) =>
      entry.lastModified && (!latest || Date.parse(entry.lastModified) > Date.parse(latest))
        ? entry.lastModified
        : latest,
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
