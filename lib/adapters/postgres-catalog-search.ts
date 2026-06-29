/**
 * P4-04: Postgres/Drizzle catalog-search adapter.
 *
 * Builds a Drizzle WHERE clause from CatalogSearchFilters over PUBLISHED
 * products and returns hydrated ProductWithRelations rows + facet counts.
 *
 * Filter mapping:
 *   types        → SQL subquery: WHERE typeId IN (SELECT id FROM product_types WHERE slug IN (...))
 *   fabrics      → attributes/details fabric OR fabric tags match any selected value
 *   colors       → color/colour attributes OR color tags match any selected value
 *   occasions    → occasion attributes OR occasion tags match any selected value
 *   works        → work/border/craft attributes OR craft/work/border tags match any selected value
 *   patterns     → pattern/motif/print attributes OR pattern/motif tags match any selected value
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
  type SQL,
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
import {
  normalizeColorSlug,
  normalizeFacetSlug,
  toFacetSlugs,
  type CatalogAvailability,
} from "@/lib/catalog/filter-taxonomy";
import type { CatalogFacets, CatalogSearchFilters, CatalogSearchPort } from "@/lib/ports/catalog-search";
import { DEFAULT_PRODUCT_SORT } from "@/lib/products/sort";
import type { ProductSortOption } from "@/lib/products/sort";
import { timed, timedRows } from "@/lib/perf/timed";

// ── Facet helpers ─────────────────────────────────────────────────────────────

/** Resolve static facet counts for the active published catalog scope. */
const emptyFacets = (): CatalogFacets => ({
  fabric: {},
  color: {},
  occasion: {},
  work: {},
  pattern: {},
  type: {},
  availability: {},
  tags: {},
  tagDetails: {},
});

const addFacetValue = (
  target: Record<string, number>,
  rawValue: unknown,
  countValue: unknown,
  options: { color?: boolean } = {},
) => {
  const slug = options.color
    ? normalizeColorSlug(rawValue)
    : normalizeFacetSlug(rawValue);
  const countValueNumber =
    typeof countValue === "number" ? countValue : Number(countValue);
  if (!slug || !Number.isFinite(countValueNumber) || countValueNumber <= 0) {
    return;
  }
  target[slug] = Math.max(target[slug] ?? 0, countValueNumber);
};

const normalizeInputSlugs = (
  values: Array<string | undefined> | string[] | undefined,
  options: { color?: boolean } = {},
) => {
  const slugs = values
    ?.flatMap((value) => toFacetSlugs(value))
    .map((value) => (options.color ? normalizeColorSlug(value) : value))
    .filter(Boolean);

  return Array.from(new Set(slugs ?? []));
};

const normalizedSqlValue = (expression: SQL<unknown>) =>
  sql<string>`lower(regexp_replace(coalesce(${expression}, ''), '[^a-z0-9]+', '-', 'g'))`;

const colorSqlValue = (expression: SQL<unknown>) =>
  sql<string>`case
    when ${normalizedSqlValue(expression)} in ('ivory', 'white') then 'ivory-white'
    when ${normalizedSqlValue(expression)} = 'multicolor' then 'multicolour'
    else ${normalizedSqlValue(expression)}
  end`;

const productHasTag = (slugs: string[], categories: string[]) =>
  sql`${products.id} in (
    select pt.product_id
    from ${productTags} pt
    join ${tags} t on pt.tag_id = t.id
    where lower(t.category) in (${sql.join(categories.map((category) => sql`${category}`), sql`, `)})
      and t.slug in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})
  )`;

const jsonStringMatches = (
  expression: SQL<unknown>,
  slugs: string[],
  options: { color?: boolean; contains?: boolean } = {},
) => {
  if (slugs.length === 0) return undefined;
  const normalized = options.color ? colorSqlValue(expression) : normalizedSqlValue(expression);
  const exact = sql`${normalized} in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})`;
  if (!options.contains) return exact;

  return or(
    exact,
    ...slugs.map((slug) => sql`${normalized} like ${`%${slug}%`}`),
  );
};

const multiSourceFacetFilter = ({
  attributeExpressions,
  categories,
  contains,
  color,
  slugs,
}: {
  attributeExpressions: SQL<unknown>[];
  categories: string[];
  contains?: boolean;
  color?: boolean;
  slugs: string[];
}) => {
  if (slugs.length === 0) return undefined;
  const attributeClauses = attributeExpressions
    .map((expression) => jsonStringMatches(expression, slugs, { color, contains }))
    .filter((clause): clause is SQL<unknown> => Boolean(clause));

  return or(...attributeClauses, productHasTag(slugs, categories));
};

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

  // Hide sold + actively-reserved pieces from the public catalog. A reservation
  // whose hold has expired (reservedUntil in the past) counts as available again.
  const stockVisible = sql`(${products.stockStatus} = 'available' OR (${products.stockStatus} = 'reserved' AND ${products.reservedUntil} < now()))`;
  const publishedFilter = productIds
    ? and(
        eq(products.status, "published" as const),
        inArray(products.id, productIds),
        stockVisible,
      )
    : and(eq(products.status, "published" as const), stockVisible);

  const [
    fabricRows,
    colorRows,
    occasionRows,
    workRows,
    patternRows,
    typeRows,
    availabilityRows,
    tagRows,
  ] = await Promise.all([
    // Fabric: details_fabric / attributes->>'fabric' GROUP BY value
    timedRows("catalog.facets.fabric", () => withRetry(() =>
      db
        .select({
          fabric: sql<string>`coalesce(nullif(btrim(${products.detailsFabric}), ''), nullif(btrim(${products.attributes}->>'fabric'), ''))`.as("fabric"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`coalesce(nullif(btrim(${products.detailsFabric}), ''), nullif(btrim(${products.attributes}->>'fabric'), ''))`)
    )),

    // Colour: attributes color/colour values.
    timedRows("catalog.facets.color", () => withRetry(() =>
      db
        .select({
          color: sql<string>`coalesce(nullif(btrim(${products.attributes}->>'color'), ''), nullif(btrim(${products.attributes}->>'colour'), ''), nullif(btrim(${products.attributes}->>'colors'), ''), nullif(btrim(${products.attributes}->>'colours'), ''))`.as("color"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`coalesce(nullif(btrim(${products.attributes}->>'color'), ''), nullif(btrim(${products.attributes}->>'colour'), ''), nullif(btrim(${products.attributes}->>'colors'), ''), nullif(btrim(${products.attributes}->>'colours'), ''))`)
    )),

    // Occasion: attributes occasion/occasions values.
    timedRows("catalog.facets.occasion", () => withRetry(() =>
      db
        .select({
          occasion: sql<string>`coalesce(nullif(btrim(${products.attributes}->>'occasion'), ''), nullif(btrim(${products.attributes}->>'occasions'), ''))`.as("occasion"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`coalesce(nullif(btrim(${products.attributes}->>'occasion'), ''), nullif(btrim(${products.attributes}->>'occasions'), ''))`)
    )),

    // Work / border: attributes work/border/craft/embellishment values.
    timedRows("catalog.facets.work", () => withRetry(() =>
      db
        .select({
          work: sql<string>`coalesce(nullif(btrim(${products.attributes}->>'work'), ''), nullif(btrim(${products.attributes}->>'border'), ''), nullif(btrim(${products.attributes}->>'craft'), ''), nullif(btrim(${products.attributes}->>'embellishment'), ''), nullif(btrim(${products.attributes}->>'embroidery'), ''))`.as("work"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`coalesce(nullif(btrim(${products.attributes}->>'work'), ''), nullif(btrim(${products.attributes}->>'border'), ''), nullif(btrim(${products.attributes}->>'craft'), ''), nullif(btrim(${products.attributes}->>'embellishment'), ''), nullif(btrim(${products.attributes}->>'embroidery'), ''))`)
    )),

    // Pattern / motif: attributes pattern/motif/print values.
    timedRows("catalog.facets.pattern", () => withRetry(() =>
      db
        .select({
          pattern: sql<string>`coalesce(nullif(btrim(${products.attributes}->>'pattern'), ''), nullif(btrim(${products.attributes}->>'motif'), ''), nullif(btrim(${products.attributes}->>'print'), ''))`.as("pattern"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`coalesce(nullif(btrim(${products.attributes}->>'pattern'), ''), nullif(btrim(${products.attributes}->>'motif'), ''), nullif(btrim(${products.attributes}->>'print'), ''))`)
    )),

    // Type: LEFT JOIN productTypes → slug, GROUP BY slug
    timedRows("catalog.facets.type", () => withRetry(() =>
      db
        .select({
          typeSlug: productTypes.slug,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .leftJoin(productTypes, eq(products.typeId, productTypes.id))
        .where(publishedFilter)
        .groupBy(productTypes.slug)
    )),

    // Availability: stock_status GROUP BY
    timedRows("catalog.facets.availability", () => withRetry(() =>
      db
        .select({
          stockStatus: products.stockStatus,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(products.stockStatus)
    )),

    // Tags: JOIN product_tags → tags, keeping display metadata for filter groups.
    timedRows("catalog.facets.tags", () => withRetry(() =>
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
    )),
  ]);

  const fabric: Record<string, number> = {};
  for (const row of fabricRows) {
    addFacetValue(fabric, row.fabric, row.count);
  }

  const color: Record<string, number> = {};
  for (const row of colorRows) {
    addFacetValue(color, row.color, row.count, { color: true });
  }

  const occasion: Record<string, number> = {};
  for (const row of occasionRows) {
    addFacetValue(occasion, row.occasion, row.count);
  }

  const work: Record<string, number> = {};
  for (const row of workRows) {
    addFacetValue(work, row.work, row.count);
  }

  const pattern: Record<string, number> = {};
  for (const row of patternRows) {
    addFacetValue(pattern, row.pattern, row.count);
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
      const category = normalizeFacetSlug(row.tagCategory ?? "");
      if (category === "fabric") {
        addFacetValue(fabric, row.tagSlug, row.count);
      } else if (category === "color" || category === "colour") {
        addFacetValue(color, row.tagSlug, row.count, { color: true });
      } else if (category === "occasion") {
        addFacetValue(occasion, row.tagSlug, row.count);
      } else if (["craft", "work", "border", "embellishment", "embroidery"].includes(category)) {
        addFacetValue(work, row.tagSlug, row.count);
      } else if (["pattern", "motif", "print"].includes(category)) {
        addFacetValue(pattern, row.tagSlug, row.count);
      }
    }
  }

  return { fabric, color, occasion, work, pattern, type, availability, tags: tagsMap, tagDetails };
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export function createPostgresCatalogSearch(): CatalogSearchPort {
  return {
    async searchProducts(filters: CatalogSearchFilters) {
      const {
        availability,
        availabilityStatus,
        colors,
        collectionSlug,
        fabrics,
        facetsOnly = false,
        includeFacets = true,
        occasions,
        patterns,
        query,
        type,
        types,
        fabric,
        limit,
        offset = 0,
        priceMin,
        priceMax,
        sort = DEFAULT_PRODUCT_SORT,
        tags: tagSlugs,
        works,
      } = filters;
      const activeTypes = normalizeInputSlugs([...(types ?? []), type]);
      const activeFabrics = normalizeInputSlugs([...(fabrics ?? []), fabric]);
      const activeColors = normalizeInputSlugs(colors, { color: true });
      const activeOccasions = normalizeInputSlugs(occasions);
      const activeWorks = normalizeInputSlugs(works);
      const activePatterns = normalizeInputSlugs(patterns);
      const activeAvailability: CatalogAvailability | undefined =
        availabilityStatus ?? (availability === true ? "available" : undefined);
      const collectionProductIds = await timed(
        "catalog.scope.collectionIds",
        () => buildScopedCollectionIds(collectionSlug),
      );

      if (collectionProductIds && collectionProductIds.length === 0) {
        return { products: [], facets: emptyFacets(), totalDocs: 0 };
      }

      // Build WHERE clauses — all ANDed.
      const whereClauses = [
        eq(products.status, "published" as const),
        // Public catalog hides sold + actively-reserved pieces (expired holds show).
        sql`(${products.stockStatus} = 'available' OR (${products.stockStatus} = 'reserved' AND ${products.reservedUntil} < now()))`,
      ];

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

      // Availability: stock status.
      if (activeAvailability) {
        whereClauses.push(eq(products.stockStatus, activeAvailability));
      }

      // Fabric: OR within selected fabric values; ANDed with other groups.
      const fabricClause = multiSourceFacetFilter({
        attributeExpressions: [
          sql`${products.detailsFabric}`,
          sql`${products.attributes}->>'fabric'`,
        ],
        categories: ["fabric"],
        contains: true,
        slugs: activeFabrics,
      });
      if (fabricClause) {
        whereClauses.push(fabricClause);
      }

      // Type: raw SQL subquery avoids a separate db.select() call.
      //   WHERE products.type_id IN (SELECT id FROM product_types WHERE slug IN (...))
      if (activeTypes.length > 0) {
        whereClauses.push(
          sql`${products.typeId} IN (
            SELECT id FROM ${productTypes}
            WHERE ${productTypes.slug} in (${sql.join(activeTypes.map((typeSlug) => sql`${typeSlug}`), sql`, `)})
          )`
        );
      }

      const colorClause = multiSourceFacetFilter({
        attributeExpressions: [
          sql`${products.attributes}->>'color'`,
          sql`${products.attributes}->>'colour'`,
          sql`${products.attributes}->>'colors'`,
          sql`${products.attributes}->>'colours'`,
        ],
        categories: ["color", "colour"],
        color: true,
        slugs: activeColors,
      });
      if (colorClause) whereClauses.push(colorClause);

      const occasionClause = multiSourceFacetFilter({
        attributeExpressions: [
          sql`${products.attributes}->>'occasion'`,
          sql`${products.attributes}->>'occasions'`,
        ],
        categories: ["occasion"],
        slugs: activeOccasions,
      });
      if (occasionClause) whereClauses.push(occasionClause);

      const workClause = multiSourceFacetFilter({
        attributeExpressions: [
          sql`${products.attributes}->>'work'`,
          sql`${products.attributes}->>'border'`,
          sql`${products.attributes}->>'craft'`,
          sql`${products.attributes}->>'embellishment'`,
          sql`${products.attributes}->>'embroidery'`,
        ],
        categories: ["craft", "work", "border", "embellishment", "embroidery"],
        slugs: activeWorks,
      });
      if (workClause) whereClauses.push(workClause);

      const patternClause = multiSourceFacetFilter({
        attributeExpressions: [
          sql`${products.attributes}->>'pattern'`,
          sql`${products.attributes}->>'motif'`,
          sql`${products.attributes}->>'print'`,
        ],
        categories: ["pattern", "motif", "print"],
        slugs: activePatterns,
      });
      if (patternClause) whereClauses.push(patternClause);

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
        const facets = await timed("catalog.facets", () =>
          buildFacets(collectionProductIds),
        );
        return { products: [], facets, totalDocs: 0 };
      }

      const rowsPromise = timedRows("catalog.products.rows", () => withRetry(() => {
        const query = db
          .select()
          .from(products)
          .where(whereClause)
          .offset(offset)
          .orderBy(...getProductSortOrder(sort));

        return typeof limit === "number" ? query.limit(limit) : query;
      }));

      const countPromise =
        typeof limit === "number"
          ? timedRows("catalog.products.count", () => withRetry(() =>
              db.select({ total: count() }).from(products).where(whereClause)
            ))
          : Promise.resolve([{ total: 0 }]);
      const facetsPromise = includeFacets
        ? timed("catalog.facets", () => buildFacets(collectionProductIds))
        : Promise.resolve(emptyFacets());

      const [rows, [countResult], facets] = await Promise.all([
        rowsPromise,
        countPromise,
        facetsPromise,
      ]);

      // Hydrate with relations only for the visible page, not every match.
      const hydratedProducts = await timedRows("catalog.products.hydrate", () =>
        hydrateProductsQuery(rows),
      );

      return {
        products: hydratedProducts,
        facets,
        totalDocs:
          typeof limit === "number" ? (countResult?.total ?? 0) : rows.length,
      };
    },
  };
}
