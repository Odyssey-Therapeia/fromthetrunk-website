# PERF_DB_SCALE_4_4E_AUDIT.md

Date: 2026-06-27

Scope: read-only diagnosis for Phase 4.4E database, query, cache, index, and scale hardening. No source code was edited before this audit was created.

Source documents used: `PERF_AUDIT.md`, `PERF_LCP_4_4B_DIAGNOSIS.md`, `PERF_REBASELINE_REQUEST.md`, `SECURITY_FIX_PHASE_4_4C_REPORT.md`, `SECURITY_FIX_PHASE_4_3_REPORT.md`, `SECURITY_FIX_PHASE_4_2_REPORT.md`, `SECURITY_FIX_PHASE_4_1_REPORT.md`, and `SECURITY.md`.

Searches run:

- `rg "select\\(\\)|select\\(\\{\\}|db\\.select|db\\.query|findMany|with:|offset|limit|count\\(|groupBy|Promise\\.all|map\\(.*await|for .*await|for await" app api lib db components`
- `rg "getProducts|getProductBySlug|getProductsByCollection|searchProducts|getCollections|getGlobals|getCollectionBySlug|getActiveReservations|listOrders|listWishlist|addresses|reservations" app api lib db`
- `rg "rawSql|sql`|db\\.execute|\\$queryRaw|where\\(" db api lib`
- `rg "passwordHash|metadata|select\\(\\)" app api lib db`

Files inspected:

- `db/schema.ts`
- `db/index.ts`
- `lib/adapters/postgres-catalog-search.ts`
- `lib/ports/catalog-search.ts`
- `lib/data/products.ts`
- `lib/data/catalog-cache.ts`
- `app/(site)/collection/page.tsx`
- `app/(site)/collection/[slug]/page.tsx`
- `api/hono/routes/products.ts`
- `api/hono/routes/payments.ts`
- `api/hono/routes/orders.ts`
- `api/hono/routes/wishlist.ts`
- `api/hono/routes/addresses.ts`
- `api/hono/routes/cart.ts`
- `api/hono/routes/auth-otp.ts`
- `db/queries/products.ts`
- `db/queries/orders.ts`
- `db/queries/wishlist.ts`
- `db/queries/reservations.ts`
- `db/queries/users.ts`
- `db/queries/auth-otp.ts`
- `db/queries/collections.ts`
- `db/queries/globals.ts`
- `components/product/product-card.tsx`
- `components/product/wishlist-button.tsx`
- `components/cart/*`
- `components/checkout/*`

Note: `db/queries/addresses.ts` does not exist. Address queries are implemented directly in `api/hono/routes/addresses.ts`.

## 1. Route Query Budget

Current call counts are source-derived best estimates for a cold cache unless noted. Some routes already use `unstable_cache`, route cache headers, or React cache, so warm-cache calls are lower.

| Route/API | Current DB calls | Expected DB calls | Cache status | Risk | Fix |
|---|---:|---:|---|---|---|
| `/` | Route-specific query count not re-inspected in this pass; prior 4.4C report made it ISR. | 0-2 warm public calls. | ISR public route. | Remaining LCP issue is more render/runtime than DB, per 4.4C. | Keep DB work out of first paint; add timing if homepage data path is changed later. |
| `/collection` | Cold: collection global 1, visible collections 2-3, catalog search 2 + hydration 3, facets 4 = about 12-13. Warm: cached wrappers can eliminate repeated work. | Warm same-filter request should be 0 DB calls; cold should stay under 8. | `lib/data/catalog-cache.ts` caches globals, visible collections, search, facets. | Huge `page` multiplies `visibleLimit = page * perPage`; collection fallback lookup adds an extra query for inactive slug. | Cap page/visibleLimit, keep facets separate, add indexes for catalog sort/filter paths, add PERF_DEBUG logs around cached calls. |
| `/collection?tags=...` | Cold: same as `/collection`; tag filter adds a tag EXISTS subquery per tag. | Warm same-filter request 0 DB calls; cold under 8. | Search cache key includes normalized filters. | Multiple tag filters create multiple EXISTS subqueries; count remains exact and can be expensive. | Add bounded page; consider one joined tag filter query later if tags become hot. |
| `/collection/[slug]` | Metadata and page product lookup share cache for public path; cold product hydration about 4 DB calls, related products about 4 more. | Warm public PDP 0-1 DB calls; cold under 8. | Product slug and product list use `unstable_cache`; stock is separate. | `getProductBySlug` tries slug and `slugify(slug)` in sequence, at most 2 product-row queries on misses. | Use a single `inArray` lookup for slug candidates if this shows in timing; keep PDP cache. |
| `/cart` | Server page is static after 4.4C; client cart open can call stock route once per cart item. | 0 on page shell; bounded stock checks on lifecycle only. | Cart store is local; no global cache. | Cart open loop calls `/api/v2/products/[slug]/stock` per item. Cart size is capped by product uniqueness but still linear. | Add a batched stock status endpoint only if cart size grows; keep lifecycle-only checks and no 5-second polling. |
| `/checkout` | Server page static; client authenticated flow loads addresses 1 call; checkout entry can call stock route per cart item; create-order is separate. | 0 on page shell; 1 address query after auth; bounded stock lifecycle checks. | User-specific, not globally cached. | Checkout entry stock check is linear in cart items; acceptable with max 20 order items. | Keep max items, consider batched stock endpoint if needed, do not cache payment/auth. |
| `/account/profile` | `/api/v2/users/me` likely 1 user query through user route. | 1. | User-specific, React Query only. | Full internal user rows must remain serialized safely. | Keep safe user serializer; no global cache. |
| `/account/addresses` | `/api/v2/addresses` 1 address query. | 1. | User-specific, React Query only. | Direct route uses bare `select()` and returns all address columns. | Partial select public address fields; add `addresses(user_id, created_at)` and `addresses(user_id, is_default)` indexes. |
| `/account/orders` | `/api/v2/orders` uses `listOrders`: 1 order query + 1 order-items batch + 1 order-events batch. | 2-3, or 1 summary-only list query. | User-specific, React Query only. | Order list returns full hydrated order detail; admin/user list does more than a summary page needs. | Add list summary select and defer line items/events to order detail, or keep hydration only for small capped lists. |
| `/account/wishlist` | Current client does `/api/v2/wishlist` 1 query, then `/api/v2/products?includeDrafts=true&limit=500` list query + hydration, then client filters. | 1 wishlist ID query + 1 targeted product-by-ids query. | User-specific, React Query only. | Over-fetches up to 500 products to render a small wishlist. | Add/consume an endpoint that fetches only wishlist product IDs via `getProductsByIds`, preserving order. |
| `/api/v2/products/[slug]` | Cold public: product cache miss about 4 DB calls. Warm: 0. | 0 warm, under 4 cold. | Route headers and product cache present. | Serialized public product is safe, but query hydration still loads full product/internal columns before serialization. | Partial select for public product detail later; add timing around cache hit/miss. |
| `/api/v2/products/[slug]/stock` | 1 partial stock query, possibly 2 due slug/slugified candidate loop. | 1. | Cache-Control `public, max-age=5, stale-while-revalidate=30`; route rate-limited. | Good for display, but grid must not call it per card. | Product grid already has live stock disabled. Keep fresh server checks in create-order. |
| `/api/v2/wishlist` | GET: 1 product-id query. POST: 1 product existence query + insert. DELETE: 1 delete. Merge: 1 existing IDs query + insert batch. | Same. | User-specific; no global cache. | Good query shape; merge max should stay capped. | No DB scale fix needed beyond test coverage and preserving max cap. |
| `/api/v2/addresses` | GET: 1 full-row address query. POST/PATCH/DELETE: 1-3 queries depending default handling. | GET 1 partial query. Mutations unchanged. | User-specific. | Missing composite indexes and over-fetch. | Partial select fields; add composite indexes. |
| `/api/v2/orders` | GET list: 3 queries with full hydrated orders. Detail: 3 queries for one order. | List should be 1 summary query unless detail needed. | User-specific/admin-specific. | Over-fetches items/events on list and returns internal fields unless route serialization is tightened. | Add summary select or route-level serialization; add order composite indexes. |
| `/api/v2/cart/reserve` | 1 atomic product update; on failure 1 partial product query. | 1-2. | Mutation, not cached. | Good server-authoritative path; depends on product stock indexes. | Keep unchanged logic; add product `stock_status/reserved_until` index if EXPLAIN shows need. |
| `/api/v2/payments/create-order` | Products 1, discount optional 1-3, pending-order count/list 1, create order 3-4, reservations per item, update payment ref 1. | Bounded by max 20 items; hot path should avoid per-item DB calls where possible. | Mutation, not cached. | Missing indexes for pending-order check, Razorpay reference lookup, payment status; reservation insert loops by item. | Add order/payment/reservation indexes; keep server-price and fresh availability checks. |
| `/api/v2/auth/otp/start` | Rate-limit adapter, user lookup 1-2, recent challenges optional, challenge insert, security event insert, email send if eligible. | 2-5 DB calls plus mail. | Auth, not cached. | Phone lookup is unindexed; no secrets logged by current helper. | Add `users(phone)` index if phone OTP is supported; add PERF_DEBUG timing without identifiers. |
| `/api/v2/auth/otp/verify` | Rate-limit adapter, challenge lookup, attempt update or verified update, ticket update, security event insert. | 3-5. | Auth, not cached. | Challenge/token indexes exist. | Keep atomic consumption; add timing only with hash-safe labels. |

## 2. N+1 Table

| Location | Loop/caller | Query inside loop? | Current impact | Fix |
|---|---|---:|---|---|
| `db/queries/products.ts` `hydrateProducts` | Product list hydration | No; collection, images, and tags are batched. | Good. No product-grid N+1 for images/tags. | Preserve batched hydration; improve selected columns. |
| `components/product/product-card.tsx` | Product grid cards | No stock fetch; `useLiveProductStock({ enabled: false })`. Wishlist uses shared query key. | Good. Zero stock route fan-out from grids. | Keep disabled; do not reintroduce polling. |
| `components/cart/cart-drawer.tsx` | Cart open/stale focus stock refresh | Yes, `/api/v2/products/[slug]/stock` per cart item. | Linear in cart size, bounded by cart/order caps. | Consider a batch stock endpoint if manual testing shows delay; no 5-second polling. |
| `components/checkout/checkout-page-client.tsx` | Checkout entry stock refresh | Yes, `/api/v2/products/[slug]/stock` per cart item. | Linear in cart size, bounded by max 20. | Same as cart: batch only if needed. |
| `db/queries/orders.ts` `hydrateOrders` | Account/admin order list hydration | No; items and events are batched. | Query count is bounded, but list over-fetches detail. | Summary list select, detail hydration only on order detail page. |
| `api/hono/routes/payments.ts` create-order | Reservation insert/update per product item | Yes, per item for reservations. | Bounded by `MAX_ORDER_ITEMS = 20`; acceptable but not ideal under checkout load. | Keep logic now; future transaction/batch after payment outbox design. |
| `db/queries/products.ts` `bulkSetProductTags` | Admin bulk edit | Yes, `replaceProductTags` per product. | Admin-only but can become slow for large bulk edits. | Batch delete/insert product tags by productIds/tagIds. |
| `app/(site)/account/wishlist/page.tsx` | Wishlist page client | No per-item API, but it fetches full product list then filters client-side. | Over-fetch rather than N+1. | Fetch only IDs in wishlist with `getProductsByIds`. |

## 3. Select Star / Over-Fetch Table

| Query/file | Currently returns full row? | Sensitive fields risk | Needed fields | Fix |
|---|---:|---|---|---|
| `db/queries/users.ts` `getUserById/getUserByEmail/listUsers` | Yes | `passwordHash`, `metadata` internal. 4.1 added serializers for route output. | Auth internals need hash; client responses need safe profile only. | Keep internal functions private to server paths; enforce serializer tests. |
| `api/hono/routes/addresses.ts` GET | Yes | Address PII is expected for owner, but extra timestamps/internal columns are unnecessary. | id, label, name, line1, line2, city, state, postalCode, country, phone, isDefault. | Partial select. |
| `db/queries/orders.ts` `listOrders/getOrder` | Yes | Shipping PII is expected for owner/admin; `internalNote` should not be public customer list data. | List: id, placed/created date, status, payment status, total, item count/summary. Detail: shipping/order fields, items/events where authorized. | Add summary select or route serialization. |
| `api/hono/routes/products.ts` list | Yes via `listProducts` + spreads enriched product. | Product metadata/internal attributes may leak if present in full row. | Card fields: id, slug, name, price, original price, stock status, fabric/story title, cover image. | Public list should map through a public card serializer; admin list can request full data. |
| `db/queries/products.ts` public list/detail | Yes | Less sensitive than users/orders, but heavy fields and admin metadata are unnecessary in card lists. | Card/detail-specific column sets. | Add public card/detail select helpers. |
| `db/queries/auth-otp.ts` public helpers | Mostly no; internal challenge lookup returns hashes intentionally. | Hash fields must never serialize to clients. | Public challenge columns only. | Current public/internal split is good; keep tests. |
| `db/queries/wishlist.ts` `listWishlistProductIds` | No | None. | productId only. | No change needed. |

## 4. Pagination Table

| Route/query | Offset/page/cursor | Max limit | Risk at large data | Fix |
|---|---|---:|---|---|
| `/collection` page | Page-number with `visibleLimit = page * perPage`; no max page. | perPage 50, but visibleLimit unbounded. | Huge `?page=` can request massive product hydration and count work. | Add max page or max visible item cap; reject/clamp negative/huge page. |
| `/api/v2/products` | `limit` + `offset` query params. | No schema max; route defaults 200 and account wishlist asks 500. | Public endpoint can request large offsets/limits. | Clamp public max to 100 or lower; admin max 100/500 by explicit admin path; add tests. |
| `db/queries/products.listProducts` | Offset. | Caller controlled. | Offset scans get expensive as product count grows. | Early public pages can stay offset; add cursor/keyset for admin deep lists. |
| `/api/v2/orders` | No query params; `listOrders` default limit 100, offset 0. | 100 default; function accepts caller values. | Admin/user list will need paging as orders grow. | Add cursor pagination by `createdAt desc, id desc`; keep detail fetch separate. |
| `/api/v2/addresses` | Fixed `limit(100)`. | 100. | Acceptable for customer addresses. | Add explicit partial select and indexes. |
| `/api/v2/wishlist/merge` | Payload array capped by schema/report from 4.1/4.3. | 100 expected. | Acceptable. | Verify cap remains in tests. |
| Contact/review admin lists | Existing queries have created/status indexes. | Needs route-level confirmation when editing admin. | Admin list growth. | Cursor later if admin UI needs deep paging. |

## 5. Index Table

| Query pattern | Existing index? | Missing index? | Proposed index | Evidence |
|---|---:|---:|---|---|
| Products public newest: `status='published'` sorted by `created_at desc` | `products_status_created_at_idx(status, created_at)` | Tie-break id and stock filter not covered. | `products(status, stock_status, created_at desc, id desc)` | Catalog search and public cards filter status/stock/sort. |
| Products price sort/filter | No composite price index. | Yes. | `products(status, price_paise, id)` or sort-specific price/id indexes. | `searchProducts` supports price low/high and min/max. |
| Products legacy collection page | `products_collection_idx(collection_id)` | Sort tie-break not covered. | `products(collection_id, status, created_at desc, id desc)` | `getCollectionProductIds` and catalog collection scope use legacy `collection_id`. |
| Fabric filter through JSONB/expression | No normal btree can cover current expression well. | Maybe. | Defer until EXPLAIN; consider generated column/expression index only if common. | `searchProducts` filters `lower(coalesce(details_fabric, attributes->>'fabric'))`. |
| Product tags filter | PK `(product_id, tag_id)`, `tag_id` index exists. | Better composite for tag-to-product. | `product_tags(tag_id, product_id)` | Tag filters use tag slug EXISTS against product_tags/tags. |
| Orders by user and date | `orders_user_idx(user_id)` | Yes. | `orders(user_id, created_at desc, id desc)` | Account orders and pending payment cap filter user/order by recency. |
| Orders pending payment cap | `payment_status` only. | Yes. | `orders(user_id, payment_status, created_at desc)` | `payments.ts` checks recent pending orders per session user. |
| Orders admin status lists | `status` only. | Yes if admin list grows. | `orders(status, created_at desc, id desc)` | Admin order filters sort by recency. |
| Razorpay order lookup | No. | Yes. | `orders(razorpay_order_id)` | `findOrderByRazorpayReference` queries by Razorpay order reference. |
| Payment ID lookup | No. | Yes if queried. | `orders(payment_id)` | Payment verification/callback may need payment id lookup/audit. |
| Guest email lookup | No functional index. | Yes if legacy guest claim remains. | `index on lower(shipping_email)` | `listOrders` can match null-user guest orders by shipping email. |
| Reservations active product | `product_id`, `(product_id, expires_at)`, `expires_at` exist. | Status/expires composite missing. | `reservations(product_id, status, expires_at)` and maybe `(expires_at, status)` | Reservation counts and expiry jobs filter active/expired statuses. |
| Addresses by user default/created | `addresses_user_idx(user_id)` | Yes. | `addresses(user_id, is_default)`, `addresses(user_id, created_at desc)` | Address route filters user and default/recency. |
| Users phone OTP lookup | No phone index. | Yes. | `users(phone)` partial/not-null if supported. | OTP sign-in can look up by normalized phone. |
| OTP challenge token/ticket | Unique indexes exist. | No. | Keep. | `auth_otp_challenges_*` indexes present in schema. |
| Auth security events | `event_type, created_at`, `identifier, created_at`, `user` exist. | Better user/date composite. | `auth_security_events(user_id, created_at desc)` | Security audit/user event timelines. |
| Contact/review status/date/email | Existing indexes present. | No current blocker. | Keep. | `contact_submissions` and `site_feedback_submissions` have status/date indexes. |

Index migration note: use one local Drizzle-compatible migration for selected indexes. For production, large tables should use `CREATE INDEX CONCURRENTLY` in a separate non-transactional deploy plan if required.

## 6. Connection Strategy

| Current driver | Pooled endpoint? | Region pin? | Runtime | Recommendation |
|---|---|---|---|---|
| `@neondatabase/serverless` HTTP via `drizzle-orm/neon-http` in `db/index.ts` | Yes, the local `DATABASE_URL` hostname contains `pooler` and is in `us-east-1`. | No `vercel.json` was found. | Next.js/Hono server routes on Node/serverless style runtime. | Keep Neon HTTP for now, rely on caching and route query reduction first. Add a deployment-region plan near Neon `us-east-1` (Vercel `iad1`) before production staging. Do not migrate drivers without benchmark. |

Notes:

- Neon HTTP avoids long-lived local process pooling and fits serverless burst patterns, but every uncached query is a network round trip.
- The current app already wraps reads in `withRetry()` for transient Neon errors.
- A `pg`/TCP pool might help hot Node runtime paths, but it changes operational behavior and should be benchmarked separately.

## 7. Cache Table

| Data | Freshness required | Cache TTL/revalidate | Invalidated by | Implementation plan |
|---|---|---|---|---|
| Homepage public CMS/products | Minutes. | Existing ISR/public route. | CMS/product admin writes. | Keep static/ISR; do not add user-specific data to route cache. |
| Collection page global content | Minutes. | `getCachedCollectionPage` 300s. | `global:collectionPage`, `catalog`. | Keep; add timing evidence. |
| Visible collections | Minutes. | `getCachedVisibleCollections` 300s. | `collections`, `products`, `catalog`. | Keep; ensure admin product/collection writes revalidate tags. |
| Catalog search products | About 60s okay. | `getCachedSearchProducts` 60s. | `products`, `catalog`. | Keep; cap page/limit; add index support. |
| Catalog facets | About 300s okay. | `getCachedCatalogFacets` 300s. | `products`, `catalog`, `facets`. | Keep separate from filtered search; avoid recomputing per filter. |
| Product detail/PDP | About 300s okay. | `getPublicProductBySlugPersistent` 300s. | `PRODUCTS_CACHE_TAG`, product slug tag. | Keep; no draft leak into public cache. |
| Product stock display | Seconds okay. | Route cache header `max-age=5, stale-while-revalidate=30`. | Fresh DB checks still happen at cart/checkout/payment lifecycle. | Keep display cache only; create-order/payment completion stays fresh. |
| Wishlist/addresses/orders | User-specific. | React Query only; no shared cache. | User mutation/query invalidation. | Do not use global/shared cache. |
| OTP/auth/payment | Fresh/security-critical. | No cache. | N/A. | Do not cache. Add only safe timing instrumentation. |
| Reservations | Fresh/security-critical at create-order/payment completion. | No shared cache for enforcement. | Cart reserve/release/payment completion. | Display can be stale briefly; enforcement must read DB. |

## Initial Recommendations Before Source Edits

1. Add safe `PERF_DEBUG=1` timing around the already identified hot query groups using the existing `lib/perf/timed.ts`/`server-timing.ts` helpers.
2. Cap `/collection` max page or max visible items immediately; this is the clearest unbounded public query risk.
3. Clamp `/api/v2/products` `limit` and `offset`; avoid account wishlist loading 500 products just to filter client-side.
4. Add a focused index migration for orders, addresses, product catalog sort/filter, reservations, users phone, and auth-security user/date.
5. Use partial selects or serializers on public/client-facing products, addresses, and order lists.
6. Keep payment amount calculation, Razorpay verification, OTP expiry, and auth policies unchanged.
7. Create `DB_CONNECTION_SCALE_PLAN.md`, `CACHE_INVALIDATION_PLAN.md`, and `LOAD_TEST_PLAN_4_4E.md` before claiming release readiness.

