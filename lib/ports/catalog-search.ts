/**
 * P4-04: Catalog-search port.
 *
 * Defines the interface for filtered product search with facet counts.
 * The concrete implementation is selected by getCatalogSearch() below.
 * Embeddings/vector search are deferred — the port stays swappable.
 *
 * Facets: counts per filterable dimension returned alongside product rows.
 * Useful for driving filter-chip badge counts in the listing UI.
 */

import type { ProductWithRelations } from "@/db/queries/products";
import type { CatalogAvailability } from "@/lib/catalog/filter-taxonomy";
import type { ProductSortOption } from "@/lib/products/sort";

// ── Filter input ─────────────────────────────────────────────────────────────

export type CatalogSearchFilters = {
  /**
   * Collection slug. When present, search must be restricted to the same
   * manual + smart + legacy membership union used by collection render paths.
   */
  collectionSlug?: string;
  /**
   * P6-03: Free-text search term.
   * Matched case-insensitively (ILIKE) against:
   *   - products.name
   *   - products.story_title
   *   - products.story_narrative
   *   - (products.attributes->>'fabric')
   *
   * Upgrade point: swap the ILIKE OR-clause for a pg_trgm similarity
   * expression or a vector/embedding lookup here when the Control Centre
   * (P5-05) search-term report indicates relevance uplift is needed.
   * The port signature is unchanged — only the adapter implementation changes.
   */
  query?: string;
  /** Product type slug (legacy single-value alias; matches productTypes.slug via typeId FK). */
  type?: string;
  /** Product type slugs. OR within this group. */
  types?: string[];
  /** Fabric attribute value (legacy single-value alias). */
  fabric?: string;
  /** Fabric/material slugs. OR within this group. */
  fabrics?: string[];
  /** Colour slugs. OR within this group. */
  colors?: string[];
  /** Occasion slugs. OR within this group. */
  occasions?: string[];
  /** Work / border / craft slugs. OR within this group. */
  works?: string[];
  /** Pattern / motif slugs. OR within this group. */
  patterns?: string[];
  /** Price lower bound in paise (inclusive). */
  priceMin?: number;
  /** Price upper bound in paise (inclusive). */
  priceMax?: number;
  /** Legacy boolean alias. When true, maps to availabilityStatus = 'available'. */
  availability?: boolean;
  /** Stock status filter. */
  availabilityStatus?: CatalogAvailability;
  /** Tag slugs — products must belong to ALL provided tags (AND). */
  tags?: string[];
  /** Maximum product rows to hydrate and return. */
  limit?: number;
  /** Product offset for paged catalog views. */
  offset?: number;
  /** SQL-backed product sort for paged catalog views. */
  sort?: ProductSortOption;
  /** When true, skip product fetch/hydration and return only facet counts. */
  facetsOnly?: boolean;
  /**
   * When false, skip facet GROUP BY queries and return empty facet maps.
   * Use this when a caller fetches cached facets separately.
   */
  includeFacets?: boolean;
};

// ── Facet output ─────────────────────────────────────────────────────────────

/**
 * Facet counts per dimension.
 * Each entry maps a dimension value to the number of PUBLISHED products
 * matching that value. Counts are static for the active collection scope when
 * one is provided, not narrowed by the other active filters.
 */
export type CatalogFacets = {
  /** Fabric attribute values → count. */
  fabric: Record<string, number>;
  /** Colour values → count. */
  color: Record<string, number>;
  /** Occasion values → count. */
  occasion: Record<string, number>;
  /** Work / border / craft values → count. */
  work: Record<string, number>;
  /** Pattern / motif values → count. */
  pattern: Record<string, number>;
  /** Product type slugs → count. */
  type: Record<string, number>;
  /** Availability states → count (keys: 'available', 'reserved', 'sold'). */
  availability: Record<string, number>;
  /** Tag slugs → count. */
  tags: Record<string, number>;
  /** Tag slug → display metadata for grouping storefront filters. */
  tagDetails: Record<string, { category: string; name: string }>;
};

// ── Port interface ────────────────────────────────────────────────────────────

export interface CatalogSearchPort {
  searchProducts(
    filters: CatalogSearchFilters
  ): Promise<{
    products: ProductWithRelations[];
    facets: CatalogFacets;
    totalDocs: number;
  }>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

import { createPostgresCatalogSearch } from "@/lib/adapters/postgres-catalog-search";

let _instance: CatalogSearchPort | null = null;

/**
 * Returns the singleton catalog-search adapter.
 * Currently: always the Postgres/Drizzle adapter.
 * When a vector/Typesense adapter is added, select it here via env vars.
 */
export function getCatalogSearch(): CatalogSearchPort {
  if (_instance) return _instance;
  _instance = createPostgresCatalogSearch();
  return _instance;
}

/**
 * Reset the singleton (test helper — do NOT call in production code).
 */
export function _resetCatalogSearchInstance(): void {
  _instance = null;
}

// ── Convenience re-export ────────────────────────────────────────────────────

/**
 * searchProducts — convenience wrapper around getCatalogSearch().searchProducts().
 * Listing page and other consumers import this directly.
 */
export const searchProducts = (
  filters: CatalogSearchFilters
): Promise<{
  products: ProductWithRelations[];
  facets: CatalogFacets;
  totalDocs: number;
}> =>
  getCatalogSearch().searchProducts(filters);
