import { unstable_cache } from "next/cache";

import {
  getCollections,
  getGlobals,
  getProducts,
  getProductsByCollection,
} from "@/lib/data/products";
import {
  DEFAULT_PRODUCT_SORT,
  type ProductSortOption,
} from "@/lib/products/sort";
import {
  searchProducts,
  type CatalogSearchFilters,
} from "@/lib/ports/catalog-search";
import { timed } from "@/lib/perf/timed";

const CATALOG_REVALIDATE_SECONDS = 60;
const FACET_REVALIDATE_SECONDS = 300;

type FacetScope = Pick<CatalogSearchFilters, "collectionSlug">;

const stableKey = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${key}:${stableKey(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
};

const normalizeSearchInput = (
  input: CatalogSearchFilters,
): CatalogSearchFilters => ({
  ...input,
  colors: input.colors ? [...input.colors].sort() : undefined,
  fabrics: input.fabrics ? [...input.fabrics].sort() : undefined,
  occasions: input.occasions ? [...input.occasions].sort() : undefined,
  patterns: input.patterns ? [...input.patterns].sort() : undefined,
  tags: input.tags ? [...input.tags].sort() : undefined,
  types: input.types ? [...input.types].sort() : undefined,
  works: input.works ? [...input.works].sort() : undefined,
});

export const getCachedCollectionPage = (requestId?: string) =>
  unstable_cache(
    async () =>
      timed(
        "catalog.collectionPage",
        () => getGlobals("collectionPage", { includeDrafts: false }),
        requestId,
      ),
    ["ftt:catalog:collection-page"],
    {
      revalidate: FACET_REVALIDATE_SECONDS,
      tags: ["global:collectionPage", "catalog"],
    },
  )();

export const getCachedVisibleCollections = (requestId?: string) =>
  unstable_cache(
    async () =>
      timed(
        "catalog.visibleCollections",
        () =>
          getCollections({ includeDrafts: false, onlyWithProducts: true }),
        requestId,
      ),
    ["ftt:catalog:visible-collections"],
    {
      revalidate: FACET_REVALIDATE_SECONDS,
      tags: ["collections", "products", "catalog"],
    },
  )();

export const getCachedSearchProducts = (
  input: CatalogSearchFilters = {},
  requestId?: string,
) => {
  const normalized = normalizeSearchInput(input);
  const key = stableKey(normalized);

  return unstable_cache(
    async () =>
      timed(
        `catalog.searchProducts:${key}`,
        () => searchProducts(normalized),
        requestId,
      ),
    ["ftt:catalog:search", key],
    {
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: ["products", "catalog"],
    },
  )();
};

export const getCachedCatalogFacets = (
  scope: FacetScope = {},
  requestId?: string,
) => {
  const key = stableKey(scope);

  return unstable_cache(
    async () => {
      const result = await timed(
        `catalog.facets:${key}`,
        () =>
          searchProducts({
            collectionSlug: scope.collectionSlug,
            facetsOnly: true,
          }),
        requestId,
      );

      return result.facets;
    },
    ["ftt:catalog:facets", key],
    {
      revalidate: FACET_REVALIDATE_SECONDS,
      tags: ["products", "catalog", "facets"],
    },
  )();
};

export const getCachedProductsPage = ({
  limit,
  page = 1,
  sort = DEFAULT_PRODUCT_SORT,
  requestId,
}: {
  limit: number;
  page?: number;
  requestId?: string;
  sort?: ProductSortOption;
}) =>
  unstable_cache(
    async () =>
      timed(
        `catalog.productsPage:${limit}:${page}:${sort}`,
        () =>
          getProducts(limit, {
            includeDrafts: false,
            page,
            sort,
          }),
        requestId,
      ),
    ["ftt:catalog:products-page", String(limit), String(page), sort],
    {
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: ["products", "catalog"],
    },
  )();

export const getCachedProductsByCollection = ({
  collectionSlug,
  limit,
  page = 1,
  requestId,
  sort = DEFAULT_PRODUCT_SORT,
}: {
  collectionSlug: string;
  limit: number;
  page?: number;
  requestId?: string;
  sort?: ProductSortOption;
}) =>
  unstable_cache(
    async () =>
      timed(
        `catalog.productsByCollection:${collectionSlug}:${limit}:${page}:${sort}`,
        () =>
          getProductsByCollection(collectionSlug, limit, {
            includeDrafts: false,
            page,
            sort,
          }),
        requestId,
      ),
    [
      "ftt:catalog:products-by-collection",
      collectionSlug,
      String(limit),
      String(page),
      sort,
    ],
    {
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: ["products", "collections", "catalog"],
    },
  )();
