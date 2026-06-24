import {
  getCollectionBySlug,
  listCollections,
  listCollectionsWithProducts,
} from "@/db/queries/collections";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  getFeaturedProducts as getFeaturedProductsQuery,
  getProductBySlug as getProductBySlugQuery,
  getProductsByCollection as getProductsByCollectionQuery,
  getProductsByIds as getProductsByIdsQuery,
  listProducts as listProductsQuery,
  searchProducts as searchProductsQuery,
} from "@/db/queries/products";
import { getGlobal } from "@/db/queries/globals";
import {
  DEFAULT_PRODUCT_SORT,
  type ProductSortOption,
} from "@/lib/products/sort";
import { PRODUCTS_CACHE_TAG, productCacheTag } from "@/lib/cache/product-cache";
import {
  probePublicProductCache,
  probePublicProductsListCache,
  type CacheProbeStatus,
} from "@/lib/cache/product-cache-probe";
import type { TimingSink } from "@/lib/perf/server-timing";
import type { Product } from "@/types/domain";

type QueryOptions = {
  includeDrafts?: boolean;
  onlyWithProducts?: boolean;
  page?: number;
  sort?: ProductSortOption;
};

const getPublicProductBySlugPersistent = (
  slug: string,
  timingSink?: TimingSink,
) =>
  unstable_cache(
    async () =>
      getProductBySlugQuery(slug, { includeDrafts: false }, timingSink),
    ["public-product-by-slug", slug],
    {
      revalidate: 300,
      tags: [PRODUCTS_CACHE_TAG, productCacheTag(slug)],
    },
  )();

const getProductBySlugCached = cache(async (slug: string, includeDrafts: boolean) => {
  if (includeDrafts) {
    return getProductBySlugQuery(slug, { includeDrafts: true });
  }

  return getPublicProductBySlugPersistent(slug);
});

export const getTimedPublicProductBySlug = (
  slug: string,
  timingSink?: TimingSink,
) => getPublicProductBySlugPersistent(slug, timingSink);

export const probeTimedPublicProductCache = (
  slug: string,
): CacheProbeStatus => probePublicProductCache(slug);

const getPublicProductsPersistent = (
  limit: number,
  offset: number,
  sort: ProductSortOption,
) =>
  unstable_cache(
    async () =>
      listProductsQuery({
        includeDrafts: false,
        limit,
        offset,
        sort,
      }),
    ["public-products", String(limit), String(offset), sort],
    {
      revalidate: 300,
      tags: [PRODUCTS_CACHE_TAG],
    },
  )();

export const probeTimedPublicProductsListCache = ({
  limit,
  offset,
  sort,
}: {
  limit: number;
  offset: number;
  sort: ProductSortOption;
}): CacheProbeStatus =>
  probePublicProductsListCache(
    ["public-products", String(limit), String(offset), sort].join(":"),
  );

export const getGlobals = async (slug: string, options: QueryOptions = {}) => {
  void options;
  const content = await getGlobal(slug);
  return content ?? null;
};

export const getCollections = async (options: QueryOptions = {}) => {
  const docs = (await (options.onlyWithProducts
    ? listCollectionsWithProducts({ includeDrafts: options.includeDrafts })
    : listCollections()
  )).sort((a, b) => a.name.localeCompare(b.name));
  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProducts = async (limit = 200, options: QueryOptions = {}) => {
  const page = options.page ?? 1;
  const offset = (page - 1) * limit;
  const sort = options.sort ?? DEFAULT_PRODUCT_SORT;
  const { rows, totalCount } = options.includeDrafts
    ? await listProductsQuery({
        includeDrafts: true,
        limit,
        offset,
        sort,
      })
    : await getPublicProductsPersistent(limit, offset, sort);

  return {
    docs: rows,
    totalDocs: totalCount,
  };
};

export const getProductsByCollection = async (
  collectionSlug: string,
  limit = 200,
  options: QueryOptions = {}
) => {
  const collectionDoc = await getCollectionBySlug(collectionSlug);
  if (!collectionDoc) {
    return { docs: [] as Product[], totalDocs: 0 };
  }

  const page = options.page ?? 1;
  const offset = (page - 1) * limit;
  const { rows, totalCount } = await getProductsByCollectionQuery(collectionDoc.slug, {
    includeDrafts: options.includeDrafts,
    limit,
    offset,
    sort: options.sort,
  });

  return {
    docs: rows,
    totalDocs: totalCount,
  };
};

export const getFeaturedProducts = async (
  limit = 4,
  options: QueryOptions = {}
) => {
  const docs = await getFeaturedProductsQuery({
    includeDrafts: options.includeDrafts,
    limit,
  });

  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProductBySlug = async (slug: string, options: QueryOptions = {}) => {
  return getProductBySlugCached(slug, Boolean(options.includeDrafts));
};

/**
 * getProductsByIds — resolve published products by id, preserving input order.
 * P3-02a / P4-03 REPAIR: used by product-grid source="manual" (UUIDs) and the
 * collection union resolution path.
 */
export const getProductsByIds = async (
  ids: string[],
  options: Pick<QueryOptions, "includeDrafts"> = {}
): Promise<Product[]> => {
  return getProductsByIdsQuery(ids, { includeDrafts: options.includeDrafts });
};

/**
 * @deprecated P6-03: This function is a dead export. All callers have been
 * moved to the catalog-search port (`lib/ports/catalog-search.ts`), which
 * supports ILIKE free-text search over name/storyTitle/storyNarrative/attributes
 * AND structured filters (type/fabric/price/availability/tags) in a single query.
 * This export is retained to avoid a breaking change but should be removed
 * in a future cleanup pass.
 */
export const searchProducts = async (
  query: string,
  limit = 48,
  options: Pick<QueryOptions, "includeDrafts"> = {}
) => {
  const docs = await searchProductsQuery(query, limit, {
    includeDrafts: options.includeDrafts,
  });

  return {
    docs,
    totalDocs: docs.length,
  };
};
