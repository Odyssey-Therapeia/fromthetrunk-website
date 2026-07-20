import type { MetadataRoute } from "next";

import { listProducts } from "@/db/queries/products";
import { policies } from "@/lib/legal/policies";
import { searchProducts } from "@/lib/ports/catalog-search";
import {
  isKeywordLandingIndexable,
  keywordLandingPages,
} from "@/lib/seo/keyword-landing-pages";
import { productSeoImageUrls } from "@/lib/seo/image-urls";
import { shouldIncludeProductInSeo } from "@/lib/seo/product-indexing";
import { absoluteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

const STATIC_PAGE_LAST_MODIFIED = new Date("2026-04-27T00:00:00.000Z");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { rows: products } = await listProducts({
    includeDrafts: false,
    limit: 1000,
    offset: 0,
  });

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/collection"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/top-viewed"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/our-story"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: absoluteUrl("/our-team"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/faqs"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/contact"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/how-it-works"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/authentication"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/policies"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/why"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/sell-your-saree"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.65,
    },
    {
      url: absoluteUrl("/packing"),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const policyPages: MetadataRoute.Sitemap = policies.map((policy) => ({
    url: absoluteUrl(`/policies/${policy.slug}`),
    lastModified: STATIC_PAGE_LAST_MODIFIED,
    changeFrequency: "yearly" as const,
    priority: 0.35,
  }));

  const productPages: MetadataRoute.Sitemap = products
    .filter(shouldIncludeProductInSeo)
    .map((product) => {
      const images = productSeoImageUrls(product);

      return {
        url: absoluteUrl(`/collection/${product.slug}`),
        lastModified: new Date(product.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.8,
        ...(images.length > 0 ? { images } : {}),
      };
    });

  const keywordPages = await getKeywordSitemapPages();

  return dedupeSitemapEntries([
    ...staticPages,
    ...policyPages,
    ...keywordPages,
    ...productPages,
  ]);
}

function dedupeSitemapEntries(
  entries: MetadataRoute.Sitemap,
): MetadataRoute.Sitemap {
  return Array.from(new Map(entries.map((entry) => [entry.url, entry])).values());
}

async function getKeywordSitemapPages(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [];

  for (const page of keywordLandingPages) {
    if (!page.sitemap) continue;

    const productCount = page.searchFilters
      ? (
          await searchProducts({
            ...page.searchFilters,
            includeFacets: false,
            limit: 1,
          })
        ).totalDocs
      : 0;

    if (!isKeywordLandingIndexable(page, productCount)) continue;

    pages.push({
      url: absoluteUrl(page.canonicalPath),
      lastModified: STATIC_PAGE_LAST_MODIFIED,
      changeFrequency: page.type === "guide" ? "monthly" : "weekly",
      priority:
        page.type === "supply" ? 0.75 : page.type === "guide" ? 0.65 : 0.7,
    });
  }

  return pages;
}
