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

export const revalidate = 300;

/**
 * Static marketing routes have no per-page modification timestamp anywhere in
 * the codebase or the database. Rather than stamping them all with a build date
 * or a frozen constant — both of which tell crawlers something untrue —
 * `lastModified` is omitted for those URLs. Products use their real
 * `updatedAt`; policies use the `lastUpdated` printed on the page itself.
 */
const parsePolicyLastUpdated = (value: string): Date | undefined => {
  const parsed = new Date(`${value} UTC`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getKeywordProductCount = (
  filters: NonNullable<(typeof keywordLandingPages)[number]["searchFilters"]>,
) =>
  searchProducts({
    ...filters,
    includeFacets: false,
    limit: 1,
  }).then((result) => result.totalDocs);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { rows: products } = await listProducts({
    includeDrafts: false,
    limit: 1000,
    offset: 0,
  });

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/collection"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/top-viewed"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/our-story"),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: absoluteUrl("/our-team"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/faqs"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/contact"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/how-it-works"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/authentication"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/policies"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/why"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/sell-your-saree"),
      changeFrequency: "monthly",
      priority: 0.65,
    },
    {
      url: absoluteUrl("/packing"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const policyPages: MetadataRoute.Sitemap = policies.map((policy) => {
    const lastModified = parsePolicyLastUpdated(policy.lastUpdated);

    return {
      url: absoluteUrl(`/policies/${policy.slug}`),
      // Truthful: the same date rendered as "Last updated" on the page.
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "yearly" as const,
      priority: 0.35,
    };
  });

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
  const candidates = keywordLandingPages.filter((page) => page.sitemap);
  const counts = await Promise.all(
    candidates.map(async (page) =>
      page.searchFilters
        ? (
            await getKeywordProductCount(page.searchFilters)
          )
        : 0,
    ),
  );

  return candidates.flatMap((page, index): MetadataRoute.Sitemap => {
    if (!isKeywordLandingIndexable(page, counts[index] ?? 0)) return [];
    return [{
      url: absoluteUrl(page.canonicalPath),
      // No trustworthy per-page timestamp exists for keyword landing pages.
      changeFrequency: page.type === "guide" ? "monthly" : "weekly",
      priority:
        page.type === "supply" ? 0.75 : page.type === "guide" ? 0.65 : 0.7,
    }];
  });
}
