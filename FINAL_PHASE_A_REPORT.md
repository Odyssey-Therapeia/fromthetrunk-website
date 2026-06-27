# FINAL_PHASE_A_REPORT.md

Date: 2026-06-27

Recommendation: **NO-GO for production release candidate**.

Reason: Phase A reservation/query hardening is implemented and focused tests pass, but the release gate is still blocked by existing payment/shipping total regression tests and strict public mobile LCP failures.

## Changed Files

Phase A files touched:

- `FINAL_PHASE_A_PLAN.md`
- `FINAL_PHASE_A_REPORT.md`
- `LOAD_TEST_PLAN_4_4E.md`
- `PERF_REBASELINE_REQUEST.md`
- `api/hono/routes/cart.ts`
- `api/hono/routes/orders.ts`
- `components/cart/cart-item.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/product/product-card-commerce-row.tsx`
- `db/queries/orders.ts`
- `lib/cart/reservation-policy.ts`
- `lib/cart/reservation-token.ts`
- `lib/legal/policies.ts`
- `tests/unit/cart-reservation-routes.test.ts`
- `tests/unit/customer-accounts-p6-01.test.ts`

No migration was added in this phase. The existing products-table reservation model (`stockStatus` + `reservedUntil`) was preserved so the dashboard/admin stock views continue to see the same source of truth.

## What Changed

### 1. One-of-one Cart Reservation

- Added `CART_RESERVATION_MINUTES = 60` in `lib/cart/reservation-policy.ts`.
- Added non-production/preview/test-only `FTT_RESERVATION_MINUTES` override.
- Replaced the cart route hard-coded 30-minute reservation with the shared 60-minute policy.
- Kept add-to-cart reservation atomic through the existing product-row update.
- Preserved structured responses for sold/reserved/conflict/expired cases.
- Kept release protection: active reservations require a matching signed token.
- Extended reservation tokens to include `quantity: 1` and optional `reservationId` if a future active reservation id is available.
- Preserved backward compatibility for older local-cart tokens that do not yet include `quantity`.

### 2. Cart and Checkout UX Safety

- Cart items now show `Reserved for you` plus a held-until time when available.
- Collection/product-card add-to-cart failures now surface the server’s friendly availability message instead of a generic silent animation failure.
- Checkout now performs an explicit availability recheck immediately before `startPayment`.
- Checkout still removes invalid cart items only after showing a toast.
- No 5-second polling was added. Existing lifecycle checks remain cart open, checkout entry, focus-stale refresh, and create-order.

### 3. Order List Over-Fetch Cleanup

- Added `listOrderSummaries()` in `db/queries/orders.ts`.
- `/api/v2/orders` now uses the summary helper instead of hydrated full orders with events.
- List responses include only order summary fields plus line-item summary fields.
- Order detail route still uses authorized full order detail.
- Added bounded `limit` and `offset` handling on the order list route.

### 4. Public Copy Alignment

- Updated policy copy so wishlist is not a hold, cart is a time-limited hold, and payment remains final confirmation.

### 5. Load/Rebaseline Docs

- Updated `LOAD_TEST_PLAN_4_4E.md` with one-of-one conflict, expiry recovery, and stale checkout reservation scenarios.
- Updated `PERF_REBASELINE_REQUEST.md` with fresh Phase A public-mobile LHCI artifacts and current LCP values.

## Tests Added / Updated

- `tests/unit/cart-reservation-routes.test.ts`
  - Asserts add-to-cart creates about a 60-minute reservation.
  - Asserts reservation token verifies with product id and quantity `1`.
  - Existing quantity compatibility test remains: `quantity: 1` is accepted, `quantity: 2` is rejected.

- `tests/unit/customer-accounts-p6-01.test.ts`
  - Updated order route mocks/assertions to use `listOrderSummaries()`.

## Verification

All commands below were run with Node 22 + pnpm 10.28.0 unless noted.

| Command | Result | Notes |
|---|---|---|
| `pnpm exec eslint <Phase A touched files>` | Pass | No output. |
| `pnpm exec vitest run tests/unit/customer-accounts-p6-01.test.ts tests/unit/cart-reservation-routes.test.ts tests/unit/payments-route.test.ts` | Pass | 3 files, 53 tests. |
| `pnpm exec tsc --noEmit --pretty false` | Pass | No TypeScript errors. |
| `pnpm run lint` | Pass with warning | Existing `app/(site)/our-story/page.tsx` hook dependency warning. |
| `pnpm run build` | Pass | Existing Edge Runtime static-generation warning. |
| `pnpm audit` | Pass | No known vulnerabilities. |
| `pnpm run test` | Fail | 5 existing payment/shipping total regression failures; see below. |
| `pnpm run agent:check` | Fail | Stops during `pnpm run test`; LHCI matrix does not run through normal gate. |
| Direct `FTT_LHCI_SCOPE=public FTT_LHCI_FORM_FACTOR=mobile pnpm run lhci:autorun` | Fail | Public mobile LCP still fails all measured routes. |
| `git diff --check -- <Phase A files>` | Pass | No whitespace errors. |

## Remaining Blockers

### Payment/Shipping Total Regression

`pnpm run test` fails because current payment configuration calculates standard shipping as `250` instead of the locked `150`.

Failing tests:

- `tests/unit/checkout-estimate.test.ts`
  - expected shipping `150`, received `250`.
- `tests/unit/order-charge-totals-route.test.ts`
  - expected persisted shipping `15000`, received `25000`.
  - expected route totals are off by `10000` paise.

This phase did not change payment amount calculation because the brief explicitly forbids it. This must be resolved or formally accepted before production release candidate.

### Public Mobile LCP

Direct public-mobile LHCI still fails strict `<= 2500ms` LCP.

Fresh artifacts:

- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_07_35_39.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_07_36_04.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_07_36_21.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_07_36_35.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_07_36_49.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_07_37_03.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_07_37_16.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_07_37_30.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_07_37_43.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_07_37_56.report.json`

| Route | LCP |
|---|---:|
| `/` | 4894 ms |
| `/collection` | 5198 ms |
| `/cart` | 4608 ms |
| `/checkout` | 4738 ms |
| `/our-story` | 4521 ms |
| `/how-it-works` | 3967 ms |
| `/privacy-policy` | 3811 ms |
| `/shipping-policy` | 4088 ms |
| `/return-policy` | 3796 ms |
| `/packing` | 3841 ms |

`PERF_REBASELINE_REQUEST.md` was updated with these fresh numbers and proposed temporary route-specific gates.

## Dashboard Impact

Dashboard/admin stock logic should continue to work because this phase did not introduce a new reservation table as the active cart source of truth. The existing `products.stockStatus = "reserved"` and `products.reservedUntil` fields remain the operational dashboard-facing state.

The `/api/v2/cart/reserve` `quantity` compatibility issue is handled by the existing schema: `quantity: 1` is accepted for old storefront/dashboard clients and values above one are rejected for one-of-one inventory.

## Live Smoke Tests Still Required

Run on staging only:

- Two customers reserve the same product at the same time.
- A cart reservation expires and becomes available through lazy expiry.
- Wrong reservation token cannot release another customer’s active hold.
- Matching token can release the active hold.
- Checkout with expired/wrong/missing reservation token blocks payment with structured error.
- Razorpay test-mode successful payment marks product sold.
- Duplicate webhook/payment callback remains idempotent.
- Dashboard/admin product views show reserved, available-after-expiry, and sold states correctly.

## Final Recommendation

**NO-GO for production release candidate.**

GO criteria still missing:

1. Resolve or formally accept the payment/shipping total regression.
2. Either meet strict public mobile LCP or formally accept `PERF_REBASELINE_REQUEST.md`.
3. Run public desktop and admin mobile/desktop LHCI scopes after the blocking gate is cleared.
4. Complete live staging smoke with Razorpay test mode only.
