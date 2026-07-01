# Handoff: Implement dynamic `top-viewed` collection filter on FTT website

## 1. Objective

Implement a dynamic website collection filter so this URL works:

```txt
/collection?tags=top-viewed
```

Expected behavior:

```txt
Show published products ordered by highest product_view event count over the last 30 days.
```

Important: `top-viewed` should behave as a **virtual tag**, not a real product tag that must be manually assigned in Admin.

The goal is to let the website UI link to `/collection?tags=top-viewed` while the backend dynamically resolves the products from analytics/event data.

---

## 2. Current behavior

The website collection page already parses `tags` from URL search params.

Relevant website file:

```txt
fromthetrunk-website/app/(site)/collection/page.tsx
```

Current route shape already supports:

```txt
/collection?tags=<tag-slug>
```

Current code behavior:

```ts
const activeTags = toArray(resolvedSearchParams?.tags);
```

When any filter is active, the collection page calls:

```ts
const result = await searchProducts({
  type: activeType,
  fabric: activeFabric,
  priceMin: activePriceMin,
  priceMax: activePriceMax,
  availability: activeAvailability || undefined,
  tags: activeTags.length > 0 ? activeTags : undefined,
});
```

That means today:

```txt
/collection?tags=top-viewed
```

is interpreted as:

```txt
Find products that have a real product tag whose slug is "top-viewed".
```

This is not what we want.

---

## 3. Current Control Centre logic for top viewed products

Admin Control Centre already calculates “Top Viewed Products” dynamically.

Relevant admin file:

```txt
fromthetrunk-admin/db/queries/control-centre.ts
```

The flow is:

```ts
getTopMovers(30)
```

calls:

```ts
getEventProductMovers("product_view", windowStart)
```

The query reads from:

```txt
events
products
```

It does the following:

1. Reads `events` where:

```sql
events.type = 'product_view'
```

2. Reads product ID from event JSON payload:

```sql
events.payload->>'productId'
```

3. Joins to products:

```sql
products.id = (events.payload->>'productId')::uuid
```

4. Requires published products only:

```sql
products.status = 'published'
```

5. Limits to a 30-day window:

```sql
events.occurred_at >= windowStart
```

6. Groups by product and orders by:

```sql
count(*) desc
```

7. Limits results to top 5 in Control Centre.

For the website, keep page-level pagination compatible with collection page, usually 12 per page.

---

## 4. Data model context

Both repos use the `events` table.

Relevant schema shape:

```ts
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  ...
);
```

For this feature, expected payload shape is:

```json
{
  "productId": "<uuid>",
  "slug": "<product-slug>",
  "productName": "<product-name>"
}
```

The only hard requirement for ranking is `productId`.

If `/collection?tags=top-viewed` returns no products, first check whether the website is actually emitting `product_view` events into this table.

---

## 5. Recommended implementation

Treat `top-viewed` as a virtual tag inside the website collection/filter layer.

### Step A: Add constant in collection page

File:

```txt
app/(site)/collection/page.tsx
```

Add:

```ts
const TOP_VIEWED_TAG = "top-viewed";
```

After parsing `activeTags`, split virtual and real tags:

```ts
const activeTags = toArray(resolvedSearchParams?.tags);
const wantsTopViewed = activeTags.includes(TOP_VIEWED_TAG);
const realTags = activeTags.filter((tag) => tag !== TOP_VIEWED_TAG);
```

Use `realTags` when calling real tag filters.

### Step B: Extend catalog search filter type

File:

```txt
lib/ports/catalog-search.ts
```

Current `CatalogSearchFilters` includes:

```ts
tags?: string[];
```

Add:

```ts
sortBy?: "top-viewed";
```

or, more flexible:

```ts
sortBy?: "latest" | "top-viewed";
```

Keep it minimal if this is only for this feature.

### Step C: Pass virtual sort into searchProducts

In:

```txt
app/(site)/collection/page.tsx
```

Change filtered call from:

```ts
const result = await searchProducts({
  type: activeType,
  fabric: activeFabric,
  priceMin: activePriceMin,
  priceMax: activePriceMax,
  availability: activeAvailability || undefined,
  tags: activeTags.length > 0 ? activeTags : undefined,
});
```

to:

```ts
const result = await searchProducts({
  type: activeType,
  fabric: activeFabric,
  priceMin: activePriceMin,
  priceMax: activePriceMax,
  availability: activeAvailability || undefined,
  tags: realTags.length > 0 ? realTags : undefined,
  sortBy: wantsTopViewed ? "top-viewed" : undefined,
});
```

### Step D: Prevent normal collection-page sort from overriding top-viewed rank

Current collection page sorts filtered products in memory:

```ts
const sorted = sortProductsInMemory(
  result.products as unknown as Product[],
  activeSort,
);
```

For top-viewed, do not re-sort by latest/price, because that will destroy the ranking.

Change to:

```ts
const products = result.products as unknown as Product[];

const sorted = wantsTopViewed
  ? products
  : sortProductsInMemory(products, activeSort);
```

Then keep current pagination:

```ts
totalDocs = sorted.length;
const offset = (currentPage - 1) * ITEMS_PER_PAGE;
items = sorted.slice(offset, offset + ITEMS_PER_PAGE);
```

This lets `/collection?tags=top-viewed&page=2` work after dynamic ranking.

### Step E: Implement top-viewed ordering in Postgres catalog search adapter

File:

```txt
lib/adapters/postgres-catalog-search.ts
```

Current adapter:

```ts
export function createPostgresCatalogSearch(): CatalogSearchPort {
  return {
    async searchProducts(filters: CatalogSearchFilters) {
      const { query, type, fabric, priceMin, priceMax, availability, tags: tagSlugs } = filters;
      ...
      const rows = await withRetry(() =>
        db
          .select()
          .from(products)
          .where(whereClause)
          .orderBy(sql`${products.createdAt} DESC`)
      );
      ...
    }
  }
}
```

Add `events` import:

```ts
import {
  events,
  products,
  productTags,
  productTypes,
  tags,
} from "@/db/schema";
```

Destructure `sortBy`:

```ts
const {
  query,
  type,
  fabric,
  priceMin,
  priceMax,
  availability,
  tags: tagSlugs,
  sortBy,
} = filters;
```

Recommended safer two-step query for `sortBy === "top-viewed"`:

```ts
if (sortBy === "top-viewed") {
  const viewCount = sql<number>`cast(count(*) as integer)`;

  const rankedRows = await withRetry(() =>
    db
      .select({
        productId: products.id,
        viewCount,
      })
      .from(products)
      .innerJoin(
        events,
        sql`${products.id} = (${events.payload}->>'productId')::uuid`
      )
      .where(
        and(
          whereClause,
          eq(events.type, "product_view"),
          sql`${events.occurredAt} >= now() - interval '30 days'`,
          sql`${events.payload}->>'productId' is not null`
        )
      )
      .groupBy(products.id)
      .orderBy(sql`${viewCount} DESC`, sql`${products.createdAt} DESC`)
  );

  const ids = rankedRows.map((row) => row.productId);

  const productRows = ids.length
    ? await withRetry(() =>
        db.select().from(products).where(inArray(products.id, ids))
      )
    : [];

  const byId = new Map(productRows.map((row) => [row.id, row]));
  const orderedRows = ids
    .map((id) => byId.get(id))
    .filter((row): row is typeof productRows[number] => Boolean(row));

  const hydratedProducts = await hydrateProductsQuery(orderedRows);
  const facets = await buildFacets();

  return { products: hydratedProducts, facets };
}
```

This requires importing `inArray` from `drizzle-orm`.

Why two-step? Selecting the full `products` object while grouping by only `products.id` may work in Postgres due to functional dependency, but Drizzle/types/tests may be easier with a ranked IDs query followed by normal hydration.

---

## 6. Important behavior decisions

### Should `top-viewed` also combine with real tags?

Recommended: yes.

These should work:

```txt
/collection?tags=top-viewed
/collection?tags=top-viewed&availability=true
/collection?tags=top-viewed&fabric=silk
/collection?tags=top-viewed&type=saree
/collection?tags=top-viewed&tags=banarasi
```

Meaning:

```txt
Apply real filters first, then order matching products by product_view count.
```

For multiple tags:

```txt
/collection?tags=top-viewed&tags=banarasi
```

`top-viewed` is virtual and should be removed before real tag filtering. `banarasi` should still filter via product tags.

### Should products with zero views appear?

Recommended for `/collection?tags=top-viewed`: no.

Reason: the URL means “top viewed”, so products without `product_view` events should not appear.

If you need a full fallback grid, add fallback separately:

```txt
If no top-viewed products exist, show latest products with empty-state copy.
```

But do not mix zero-view products into the ranked result unless UX asks for it.

### Window

Use 30 days for now to match Control Centre.

Future enhancement:

```txt
/collection?tags=top-viewed&period=7d
```

Not needed now.

---

## 7. Tests to add/update

### Unit tests for catalog-search adapter

File likely:

```txt
tests/unit/postgres-catalog-search.test.ts
```

Add tests:

1. `searchProducts({ tags: ["top-viewed"], sortBy: "top-viewed" })` does not attempt to filter real tag slug `top-viewed`.
2. `sortBy: "top-viewed"` joins/uses `events.type = "product_view"`.
3. Products are returned in view-count order.
4. Real tags still work with top-viewed:

```ts
searchProducts({
  tags: ["banarasi"],
  sortBy: "top-viewed",
})
```

### Unit tests for collection page behavior

Where relevant:

1. `/collection?tags=top-viewed` sets `wantsTopViewed = true`.
2. `realTags` excludes `"top-viewed"`.
3. Result order is not passed through `sortProductsInMemory` when `wantsTopViewed` is true.
4. URL builder preserves `tags=top-viewed`.

---

## 8. Verification commands

Run in `fromthetrunk-website`:

```bash
pnpm test
pnpm run lint
pnpm run build
```

or, if available:

```bash
pnpm run verify
```

Also test manually:

```txt
/collection?tags=top-viewed
/collection?tags=top-viewed&availability=true
/collection?tags=top-viewed&tags=<real-tag-slug>
```

---

## 9. Manual SQL for debugging

Run this against the shared FTT DB to see current top-viewed products:

```sql
select
  p.id,
  p.name,
  p.slug,
  count(*) as views
from events e
join products p
  on p.id = (e.payload->>'productId')::uuid
where e.type = 'product_view'
  and p.status = 'published'
  and e.occurred_at >= now() - interval '30 days'
  and e.payload->>'productId' is not null
group by p.id, p.name, p.slug
order by views desc
limit 10;
```

If this returns no rows, the feature may still be implemented correctly, but the website probably is not emitting `product_view` events yet.

---

## 10. Product-view event requirement

The dynamic tag depends on `product_view` events existing.

If missing, wire PDP view tracking to insert:

```ts
{
  type: "product_view",
  payload: {
    productId: product.id,
    slug: product.slug,
    productName: product.name,
  },
  occurredAt: new Date(),
}
```

Do not block page rendering on analytics. Use fire-and-forget or server-side non-fatal logging.

---

## 11. Acceptance criteria

The feature is complete when:

1. `/collection?tags=top-viewed` loads successfully.
2. Products are ordered by `product_view` count over the last 30 days.
3. `top-viewed` is not required to exist as a real tag in the `tags` table.
4. Real tag filters still work:

```txt
/collection?tags=top-viewed&tags=<real-tag>
```

5. Normal tag filtering behavior is unchanged for all real tags.
6. Existing collection filters still work:
   - type
   - fabric
   - priceMin / priceMax
   - availability
   - sort
   - pagination
7. Tests, lint, and build pass.

---

## 12. Suggested branch and commit

Branch:

```bash
git switch -c feature/top-viewed-virtual-tag
```

Commit:

```bash
git commit -m "feat: support top-viewed virtual collection filter"
```

PR base should likely be:

```txt
development
```

unless the current release workflow says otherwise.
