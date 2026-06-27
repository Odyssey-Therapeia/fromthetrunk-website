# FINAL_PHASE_A_PLAN.md

Date: 2026-06-27

Scope: deadline-mode hardening for scale, query shape, one-of-one cart reservations, and minimum performance/release-gate readiness. Baseline is `PERF_DB_SCALE_4_4E_AUDIT.md` and `PERF_DB_SCALE_4_4E_REPORT.md`; this plan intentionally avoids a fresh full audit cycle.

## Guardrails

- Do not redesign the storefront or product cards.
- Do not weaken OTP expiry, auth, Razorpay signature verification, payment amount calculation, or server-side payment validation.
- Do not trust frontend price/payment/cart totals.
- Do not print PII, secrets, reservation tokens, OTPs, login tickets, or payment secrets.
- Do not run load tests against production.
- Do not send live OTP emails or hit production payment endpoints.

## Files To Change

Planned source changes:

- `api/hono/routes/cart.ts`
- `api/hono/schemas/cart.ts`
- `api/hono/routes/payments.ts`
- `components/cart/add-to-cart-button.tsx`
- `components/cart/cart-drawer.tsx`
- `components/cart/cart-item.tsx`
- `components/checkout/checkout-page-client.tsx`
- `lib/cart/reservation-token.ts`
- `lib/cart/availability-errors.ts`
- `lib/store/cart-store.ts`
- `db/queries/orders.ts`
- `api/hono/routes/orders.ts`
- `app/(site)/account/orders/page.tsx`
- `tests/unit/cart-reservation-routes.test.ts`
- `tests/unit/payments-route.test.ts`

Planned docs/report changes:

- `FINAL_PHASE_A_PLAN.md`
- `FINAL_PHASE_A_REPORT.md`
- `LOAD_TEST_PLAN_4_4E.md`
- `PERF_REBASELINE_REQUEST.md` if strict public mobile LCP still fails after verification.

## Migration Files Planned

No new migration is planned unless inspection shows the reservation data model cannot enforce the one-of-one reservation contract safely with existing product reservation fields and the already-created `drizzle/0022_db_scale_indexes.sql`.

Current 4.4E indexes already cover the main scale candidates: products status/stock/date, price, product tags, addresses, orders, Razorpay/payment references, users phone, and auth security events.

If a schema-backed reservation identifier becomes necessary for active cart holds, add exactly one focused migration and document the production concurrent-index path separately.

## Reservation Duration Change Plan

- Add a single source of truth constant: `CART_RESERVATION_MINUTES = 60`.
- Allow `FTT_RESERVATION_MINUTES` only outside production or in preview/test environments.
- Use the constant for add-to-cart reservation expiry, tests, and user-facing expiry copy.
- Keep tokens scoped to product, quantity `1`, expiry, and reservation id if the current model has an active reservation id available.
- Preserve local cart-only token storage; never treat a reservation token as an auth credential.

## Reservation Safety Plan

- Keep add-to-cart as an atomic server-side update.
- Release expired holds lazily on add-to-cart, cart open, checkout entry, create-order, and the existing release-expired path.
- Return structured codes: `PRODUCT_SOLD`, `PRODUCT_RESERVED`, `RESERVATION_CONFLICT`, and `RESERVATION_EXPIRED`.
- Ensure wrong-token release fails and matching-token release succeeds.
- Ensure create-order rechecks fresh DB reservation state before Razorpay order creation.
- Keep payment completion idempotent and Razorpay verification unchanged.
- Add or update tests for two-customer conflicts, expired reservations, wrong release token, sold product, and expired checkout reservation.

## DB Index Plan

- Reuse `drizzle/0022_db_scale_indexes.sql` as the current focused index migration.
- Do not add blind indexes without a concrete query path.
- Document any remaining production large-table index rollout as `CREATE INDEX CONCURRENTLY` outside the regular transactional migration path.

## Query / Pagination / Select Fixes Planned

- Keep 4.4E public product limit caps, collection page clamps, targeted wishlist products, and safe address serializers.
- Finish order-list over-fetch cleanup by returning summary-safe fields in list responses and keeping detailed items/events for detail pages.
- Confirm public/user serializers do not expose `passwordHash`, OTP hashes, token hashes, IP/user-agent hashes, admin notes, or internal metadata.
- Keep product grid stock fan-out disabled.

## Cache Fixes Planned

- Preserve public catalog cache wrappers and invalidation tags from 4.4E.
- Do not cache auth, payment, OTP, order mutation, reservation enforcement, or user-specific data.
- Update `LOAD_TEST_PLAN_4_4E.md` with reservation conflict and checkout stale-reservation scenarios.

## LCP / Performance Plan

- Run `pnpm run agent:check` after scoped fixes.
- If strict public mobile LCP still fails, update `PERF_REBASELINE_REQUEST.md` with fresh artifact paths and measured values instead of claiming production readiness.
- Public desktop/admin scopes remain gated by the agent check behavior unless public mobile is formally rebaselined.

## Rollback Plan

- Reservation changes are isolated to cart reservation helpers/routes, cart UI messaging, checkout recheck handling, and unit tests.
- If checkout smoke fails, revert reservation duration/token changes and retain the 4.4E DB/query changes.
- If order list summary breaks account UI, revert route-level order serialization only; do not touch payment/order completion code.
- If a new migration becomes necessary, keep it additive and reversible; do not edit old migrations.
