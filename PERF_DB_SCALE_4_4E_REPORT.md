# PERF_DB_SCALE_4_4E_REPORT.md

Date: 2026-06-27

Recommendation: **NO-GO for production release candidate**. DB/query/cache hardening landed and the supported-Node non-LHCI gates pass, but `agent:check` still fails the existing public mobile LCP assertions before public desktop/admin scopes run.

## Changed Files

- `PERF_DB_SCALE_4_4E_AUDIT.md`
- `DB_CONNECTION_SCALE_PLAN.md`
- `CACHE_INVALIDATION_PLAN.md`
- `LOAD_TEST_PLAN_4_4E.md`
- `PERF_DB_SCALE_4_4E_REPORT.md`
- `api/hono/schemas/products.ts`
- `api/hono/routes/products.ts`
- `api/hono/routes/addresses.ts`
- `api/hono/routes/auth-otp.ts`
- `api/hono/routes/payments.ts`
- `app/(site)/account/wishlist/page.tsx`
- `app/(site)/collection/page.tsx`
- `db/queries/orders.ts`
- `db/queries/wishlist.ts`
- `db/schema.ts`
- `drizzle/0022_db_scale_indexes.sql`
- `lib/adapters/postgres-catalog-search.ts`
- `lib/perf/timed.ts`
- `tests/unit/product-api-public-visibility.test.ts`
- `tests/unit/validation-schemas.test.ts`

The repo had many pre-existing dirty files from earlier phases. This list is the Phase 4.4E scope.

## What Changed

- Added the required pre-edit audit: `PERF_DB_SCALE_4_4E_AUDIT.md`.
- Added safe `PERF_DEBUG=1` instrumentation helper `timedRows()` with label, request id, duration, and safe row count only.
- Instrumented catalog search/facet/product hydration groups, wishlist ID reads, order list hydration, OTP start/verify DB groups, and payment create-order DB groups.
- Capped `/collection` deep page math to a maximum of 100 visible products and 10 page increments.
- Capped public `/api/v2/products` limit to 100 and admin/draft product list limit to 500.
- Added targeted `ids=` support on `/api/v2/products` so account wishlist no longer fetches 500 products then filters client-side.
- Changed account wishlist fetch to request only saved product IDs.
- Changed address list/create/update responses to selected client-safe address fields.
- Added a focused index migration: `drizzle/0022_db_scale_indexes.sql`.
- Added connection, cache invalidation, and load-test plans.

No product card visuals, OTP expiry, Razorpay signature verification, payment amount calculation, server-side payment validation, checkout/cart payment payload logic, or auth policy was weakened.

## N+1 Issues

| Area | Status | Notes |
|---|---|---|
| Product grid stock fan-out | Already bounded | `ProductCard` still uses `useLiveProductStock({ enabled: false })`; no per-card stock route calls were added. |
| Product hydration | Already batched | `hydrateProducts` batches collection/images/tags. |
| Account orders | Already batched | `hydrateOrders` batches items/events; now instrumented. Summary-only order list remains future work. |
| Account wishlist | Fixed over-fetch | Before: wishlist IDs + `/api/v2/products?includeDrafts=true&limit=500` then client filtering. After: wishlist IDs + `/api/v2/products?ids=...`. |
| Cart/checkout stock rechecks | Documented | Still per cart item on lifecycle events only; bounded by order item cap. No 5-second polling added. |

## Select-Star / Over-Fetch Fixes

| Area | Before | After |
|---|---|---|
| Public product list | Full hydrated product rows returned by list route. | Public list maps through `serializePublicProduct`; admin draft list can still return full admin data. |
| Targeted wishlist products | Full public catalog up to 500 loaded client-side. | Only saved IDs are requested. |
| Address list/create/update | Bare `select()` / full returning rows. | Selected client address fields only. |
| User responses | Already protected by earlier serializer work. | Unchanged. |
| OTP hashes/tokens | Already split public/internal in helper layer. | Unchanged. |

## Pagination Changes

| Route/query | Change |
|---|---|
| `/collection` | `safePage()` clamps to 10; `visibleLimit` clamps to 100; “load more” stops at the cap. |
| `/api/v2/products` | Public max `limit=100`; admin/draft max `limit=500`; invalid negative/non-numeric paging normalizes away. |
| Wishlist product lookup | `ids` query is deduped, UUID-validated, and capped at 100. |

Cursor/keyset pagination for admin orders/admin products is documented as follow-up. It was not forced into this pass because the current public release blocker is LCP and the user-facing order list still has a default bounded list.

## Indexes Added

Migration: `drizzle/0022_db_scale_indexes.sql`

| Index | Query tied to |
|---|---|
| `users_phone_idx` | OTP phone sign-in lookup. |
| `addresses_user_created_at_idx` | Customer address list by user/date. |
| `addresses_user_default_idx` | Default address updates/lookups. |
| `products_status_stock_created_at_idx` | Public catalog status/stock/newest queries. |
| `products_status_price_idx` | Public catalog price filter/sort. |
| `products_collection_status_created_at_idx` | Legacy collection-scoped product lookup. |
| `product_tags_tag_product_idx` | Tag-to-product filtering. |
| `orders_user_created_at_idx` | Account order history. |
| `orders_user_payment_created_at_idx` | Recent pending payment cap by user. |
| `orders_status_created_at_idx` | Admin/status order lists. |
| `orders_payment_status_created_at_idx` | Payment status dashboards/queries. |
| `orders_razorpay_order_id_idx` | Razorpay reference lookup. |
| `orders_payment_id_idx` | Payment id lookup/audit. |
| `orders_shipping_email_lower_idx` | Legacy lower-email guest order lookup. |
| `auth_security_events_user_created_at_idx` | User security event timeline/audit. |

Production note: if target tables are already large, run equivalent `CREATE INDEX CONCURRENTLY` statements outside the normal transactional migration path.

## Instrumentation Evidence

Instrumentation is gated by `PERF_DEBUG=1` and avoids PII, SQL params, OTPs, tokens, and raw bodies.

Smoke command:

```sh
PERF_DEBUG=1 npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsx -e 'import { timedRows } from "./lib/perf/timed.ts"; void (async () => { await timedRows("sample.query", async () => [{ id: 1 }, { id: 2 }], "phase-4-4e-smoke"); })();'
```

Output:

```text
[perf:phase-4-4e-smoke] sample.query: 0ms rows=2
```

Live DB-backed before/after timings were not run in this local phase, because the brief forbids production load testing and no staging target was provided. Staging should use `PERF_DEBUG=1` plus `LOAD_TEST_PLAN_4_4E.md`.

## Query Count Impact

| Route/API | Before | After | Evidence |
|---|---:|---:|---|
| `/account/wishlist` | 1 wishlist ID query + full product list query/count/hydration up to 500. | 1 wishlist ID query + targeted product-by-IDs hydration for saved IDs only. | Unit test: targeted IDs call `getProductsByIds`, not `listProducts`. |
| `/api/v2/products?limit=999` | Caller could request a huge public limit. | Public list clamps to 100. | Unit test asserts limit 999 becomes 100. |
| `/collection?page=huge` | `visibleLimit = page * perPage` unbounded. | `visibleLimit <= 100`; page clamped to 10. | Source-level cap. |
| `/api/v2/addresses` | 1 full-row query. | 1 partial-select query. | Source-level selected columns. |
| `/api/v2/orders` | 1 order query + batched items/events. | Same query count, now instrumented. | Full tests pass; future summary list remains backlog. |

## Route Timing / LCP Evidence

`agent:check` generated fresh public mobile artifacts under:

- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_06_54_54.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_06_55_20.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_06_55_37.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_06_55_51.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_06_56_04.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_06_56_19.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_06_56_32.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_06_56_46.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_06_56_59.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_06_57_12.report.json`

| Route | Phase 4.4E LCP | Result |
|---|---:|---|
| `/` | 5652 ms | Fail |
| `/collection` | 5797 ms | Fail |
| `/cart` | 4459 ms | Fail; SEO warning 0.66 |
| `/checkout` | 4664 ms | Fail; SEO warning 0.66 |
| `/our-story` | 4517 ms | Fail |
| `/how-it-works` | 3788 ms | Fail |
| `/privacy-policy` | 4008 ms | Fail |
| `/shipping-policy` | 4237 ms | Fail |
| `/return-policy` | 3814 ms | Fail |
| `/packing` | 3842 ms | Fail |

These LCP numbers are not claimed as DB-query improvements. They confirm the previous public mobile LCP blocker remains.

## Verification

All commands were run through supported Node 22 and pnpm 10.28.0.

| Command | Result | Notes |
|---|---|---|
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec eslint <4.4E files>` | Pass | No output. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec vitest run tests/unit/product-api-public-visibility.test.ts tests/unit/validation-schemas.test.ts` | Pass | 2 files, 14 tests. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint` | Pass with warning | Existing `app/(site)/our-story/page.tsx` hook dependency warning. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run build` | Pass | Existing Edge Runtime static-generation warning. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false` | Pass | No TypeScript errors. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run test` | Pass | 124 files, 1595 tests. Intentional failure-path logs still appear. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm audit` | Pass | No known vulnerabilities. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check` | Fail | Verify phase passes; public mobile LHCI LCP fails before desktop/admin scopes. |
| `git diff --check` | Pass | No whitespace errors. |

## Remaining Bottlenecks

1. Public mobile LCP is still above the strict 2.5s gate on every measured public route.
2. `agent:check` still does not reach public desktop or admin scopes because public mobile fails first.
3. `/collection` remains a dynamic route due to search params and catalog state.
4. Live DB-backed query timings and EXPLAIN plans still need staging evidence.
5. Admin products/orders cursor pagination is documented but not implemented in this pass.
6. Order list still hydrates items/events in a batched way; summary-only order list remains a future optimization.

## Final Recommendation

**GO for Phase 4.4D/live staging smoke only if the team accepts that public mobile LCP remains a separate known blocker.**

**NO-GO for production release candidate** until either strict public mobile LCP passes or `PERF_REBASELINE_REQUEST.md` is formally accepted and public desktop/admin scopes are run separately.

