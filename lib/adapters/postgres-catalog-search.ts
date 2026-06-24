/**
 * P4-04: Postgres/Drizzle catalog-search adapter.
 *
 * Builds a Drizzle WHERE clause from CatalogSearchFilters over PUBLISHED
 * products and returns hydrated ProductWithRelations rows + facet counts.
 *
 * Filter mapping:
 *   type         → SQL subquery: WHERE typeId IN (SELECT id FROM product_types WHERE slug = ?)
 *   fabric       → WHERE (products.attributes->>'fabric') = value
 *   priceMin     → WHERE products.price_paise >= value
 *   priceMax     → WHERE products.price_paise <= value
 *   availability → WHERE products.stock_status = 'available'
 *   tags         → WHERE products.id IN (
 *                    SELECT pt.product_id FROM product_tags pt
 *                    JOIN tags t ON pt.tag_id = t.id
 *                    WHERE t.slug = ?
 *                  ) — one clause per tag slug (AND semantics)
 *
 * Facets:
 *   fabric       → GROUP BY (attributes->>'fabric'), count(*)
 *   type         → JOIN productTypes; GROUP BY productTypes.slug, count(*)
 *   availability → GROUP BY stock_status, count(*)
 *   tags         → JOIN product_tags → tags; GROUP BY tags.slug, count(*)
 *
 * All facet counts are over the UNFILTERED published catalog (static counts
 * for filter-chip badges). This can be revisited if contextual facets
 * (counts within the current filter) are needed.
 *
 * Implementation note: tag and type filtering use raw `sql` subqueries
 * (not db.select() calls) to avoid extra db.select() invocations that
 * would interfere with queue-based test mocks.
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db, withRetry } from "@/db";
import {
  getCollectionBySlug,
  getCollectionProductIds,
} from "@/db/queries/collections";
import { hydrateProducts as hydrateProductsQuery } from "@/db/queries/products";
import {
  products,
  productTags,
  productTypes,
  tags,
} from "@/db/schema";
import type { CatalogFacets, CatalogSearchFilters, CatalogSearchPort } from "@/lib/ports/catalog-search";
import { DEFAULT_PRODUCT_SORT } from "@/lib/products/sort";
import type { ProductSortOption } from "@/lib/products/sort";

// ── Facet helpers ─────────────────────────────────────────────────────────────

/** Resolve static facet counts for the active published catalog scope. */
const emptyFacets = (): CatalogFacets => ({
  fabric: {},
  type: {},
  availability: {},
  tags: {},
  tagDetails: {},
});

const getProductSortOrder = (sort: ProductSortOption) => {
  switch (sort) {
    case "price-low-to-high":
      return [asc(products.pricePaise), desc(products.createdAt)];
    case "price-high-to-low":
      return [desc(products.pricePaise), desc(products.createdAt)];
    default:
      return [desc(products.createdAt)];
  }
};

async function buildScopedCollectionIds(
  collectionSlug?: string,
): Promise<string[] | undefined> {
  if (!collectionSlug) return undefined;

  const collection = await getCollectionBySlug(collectionSlug);
  if (!collection) return [];

  return getCollectionProductIds(collection);
}

async function buildFacets(productIds?: string[]): Promise<CatalogFacets> {
  if (productIds && productIds.length === 0) {
    return emptyFacets();
  }

  const publishedFilter = productIds
    ? and(
        eq(products.status, "published" as const),
        inArray(products.id, productIds),
      )
    : eq(products.status, "published" as const);

  const [fabricRows, typeRows, availabilityRows, tagRows] = await Promise.all([
    // Fabric: (attributes->>'fabric') GROUP BY value
    withRetry(() =>
      db
        .select({
          fabric: sql<string>`(${products.attributes}->>'fabric')`.as("fabric"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`(${products.attributes}->>'fabric')`)
    ),

    // Type: LEFT JOIN productTypes → slug, GROUP BY slug
    withRetry(() =>
      db
        .select({
          typeSlug: productTypes.slug,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .leftJoin(productTypes, eq(products.typeId, productTypes.id))
        .where(publishedFilter)
        .groupBy(productTypes.slug)
    ),

    // Availability: stock_status GROUP BY
    withRetry(() =>
      db
        .select({
          stockStatus: products.stockStatus,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(products.stockStatus)
    ),

    // Tags: JOIN product_tags → tags, keeping display metadata for filter groups.
    withRetry(() =>
      db
        .select({
          tagSlug: tags.slug,
          tagName: tags.name,
          tagCategory: tags.category,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .innerJoin(productTags, eq(productTags.productId, products.id))
        .innerJoin(tags, eq(productTags.tagId, tags.id))
        .where(publishedFilter)
        .groupBy(tags.slug, tags.name, tags.category)
    ),
  ]);

  const fabric: Record<string, number> = {};
  for (const row of fabricRows) {
    if (row.fabric) fabric[row.fabric] = row.count;
  }

  const type: Record<string, number> = {};
  for (const row of typeRows) {
    if (row.typeSlug) type[row.typeSlug] = row.count;
  }

  const availability: Record<string, number> = {};
  for (const row of availabilityRows) {
    if (row.stockStatus) availability[row.stockStatus] = row.count;
  }

  const tagsMap: Record<string, number> = {};
  const tagDetails: CatalogFacets["tagDetails"] = {};
  for (const row of tagRows) {
    if (row.tagSlug) {
      tagsMap[row.tagSlug] = row.count;
      tagDetails[row.tagSlug] = {
        category: row.tagCategory ?? "",
        name: row.tagName ?? row.tagSlug,
      };
    }
  }

  return { fabric, type, availability, tags: tagsMap, tagDetails };
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export function createPostgresCatalogSearch(): CatalogSearchPort {
  return {
    async searchProducts(filters: CatalogSearchFilters) {
      const {
        collectionSlug,
        facetsOnly = false,
        query,
        type,
        fabric,
        limit,
        offset = 0,
        priceMin,
        priceMax,
        sort = DEFAULT_PRODUCT_SORT,
        availability,
        tags: tagSlugs,
      } = filters;
      const collectionProductIds = await buildScopedCollectionIds(collectionSlug);

      if (collectionProductIds && collectionProductIds.length === 0) {
        return { products: [], facets: emptyFacets(), totalDocs: 0 };
      }

      // Build WHERE clauses — all ANDed.
      const whereClauses = [eq(products.status, "published" as const)];

      if (collectionProductIds) {
        whereClauses.push(inArray(products.id, collectionProductIds));
      }

      // P6-03: Free-text search via ILIKE (case-insensitive substring match).
      //
      // Choice: ILIKE-only (no pg_trgm extension or GIN index).
      //
      // Rationale: FTT is a one-of-one boutique with a small catalog (tens to
      // hundreds of products). A sequential ILIKE scan is fast enough at this
      // scale. The status-index narrows the scan to published rows only, so the
      // number of rows examined is small.
      //
      // Performance trade-off vs trigram:
      //   ILIKE: no extension, no migration, no index maintenance overhead.
      //   Works well for small catalogs. At ~10k+ rows, pg_trgm + GIN index
      //   would give sub-millisecond lookups instead of full-scan ILIKE.
      //
      // Upgrade path (when volume warrants it):
      //   1. Add migration: CREATE EXTENSION IF NOT EXISTS pg_trgm;
      //      CREATE INDEX CONCURRENTLY products_search_gin
      //        ON products USING gin (
      //          (name || ' ' || COALESCE(story_title,'') || ' ' ||
      //           COALESCE(story_narrative,'') || ' ' ||
      //           COALESCE(attributes->>'fabric','')) gin_trgm_ops
      //        );
      //   2. Replace ilike() calls with sql`... % ${term}` similarity predicates.
      //   The port signature is unchanged — only this block changes.
      //
      // Searchable columns: name, storyTitle, storyNarrative, attributes->'fabric'.
      // (storyTitle and storyNarrative carry the curated narrative that makes each
      //  piece findable by era/provenance/designer story; attributes->>'fabric' is
      //  the canonical fabric value from P4-01.)
      if (query && query.trim().length > 0) {
        const term = `%${query.trim()}%`;
        whereClauses.push(
          or(
            ilike(products.name, term),
            ilike(products.storyTitle, term),
            ilike(products.storyNarrative, term),
            sql`(${products.attributes}->>'fabric') ILIKE ${term}`
          )!
        );
      }

      // Price bounds
      if (typeof priceMin === "number") {
        whereClauses.push(gte(products.pricePaise, priceMin));
      }
      if (typeof priceMax === "number") {
        whereClauses.push(lte(products.pricePaise, priceMax));
      }

      // Availability: stockStatus = 'available'
      if (availability === true) {
        whereClauses.push(eq(products.stockStatus, "available" as const));
      }

      // Fabric: JSONB expression — uses expression index on (attributes->>'fabric')
      if (fabric) {
        whereClauses.push(
          sql`(${products.attributes}->>'fabric') = ${fabric}`
        );
      }

      // Type: raw SQL subquery avoids a separate db.select() call.
      //   WHERE products.type_id IN (SELECT id FROM product_types WHERE slug = ?)
      if (type) {
        whereClauses.push(
          sql`${products.typeId} IN (
            SELECT id FROM ${productTypes}
            WHERE ${productTypes.slug} = ${type}
          )`
        );
      }

      // Tags: one subquery per tag slug (AND semantics).
      //   WHERE products.id IN (
      //     SELECT pt.product_id FROM product_tags pt
      //     JOIN tags t ON pt.tag_id = t.id
      //     WHERE t.slug = ?
      //   )
      if (tagSlugs && tagSlugs.length > 0) {
        for (const tagSlug of tagSlugs) {
          whereClauses.push(
            sql`${products.id} IN (
              SELECT pt.product_id
              FROM ${productTags} pt
              JOIN ${tags} t ON pt.tag_id = t.id
              WHERE t.slug = ${tagSlug}
            )`
          );
        }
      }

      const whereClause = whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

      if (facetsOnly) {
        const facets = await buildFacets(collectionProductIds);
        return { products: [], facets, totalDocs: 0 };
      }

      const rowsPromise = withRetry(() => {
        const query = db
          .select()
          .from(products)
          .where(whereClause)
          .offset(offset)
          .orderBy(...getProductSortOrder(sort));

        return typeof limit === "number" ? query.limit(limit) : query;
      });

      const countPromise =
        typeof limit === "number"
          ? withRetry(() =>
              db.select({ total: count() }).from(products).where(whereClause)
            )
          : Promise.resolve([{ total: 0 }]);
      const facetsPromise = buildFacets(collectionProductIds);

      const [rows, [countResult], facets] = await Promise.all([
        rowsPromise,
        countPromise,
        facetsPromise,
      ]);

      // Hydrate with relations only for the visible page, not every match.
      const hydratedProducts = await hydrateProductsQuery(rows);

      return {
        products: hydratedProducts,
        facets,
        totalDocs:
          typeof limit === "number" ? (countResult?.total ?? 0) : rows.length,
      };
    },
  };
}
