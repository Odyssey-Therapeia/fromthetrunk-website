# Phase B One-Of-One Concurrency Final Report

Date: 2026-07-03

## Decision

Option 2 was chosen and implemented: DB-backed `orders.idempotency_key` with server cart fingerprinting and a partial unique index.

## Files Changed

Core checkout/payment:

- `api/hono/routes/payments.ts`
- `db/schema.ts`
- `db/queries/orders.ts`
- `lib/checkout/use-checkout-payment.ts`
- `lib/cart/availability-errors.ts`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/order-summary.tsx`
- `lib/checkout/one-of-one-conflict-copy.ts`

Existing Phase A.1 safety files still dirty:

- `lib/payments/payment-host-guard.ts`
- `lib/payments/razorpay.ts`

Tests/fixtures:

- `tests/unit/payments-route.test.ts`
- `tests/unit/one-of-one-conflict-copy.test.tsx`
- `tests/unit/payment-host-guard.test.ts`
- `tests/unit/razorpay-notification-safety.test.ts`
- `tests/unit/payments-cap.test.ts`
- `tests/unit/payments-route-discount.test.ts`
- `tests/unit/order-charge-totals-route.test.ts`
- `tests/unit/customer-accounts-p6-01.test.ts`
- `tests/unit/order-receipt-html.test.ts`

Reports:

- `PHASE_B_CONCURRENCY_SAFETY_SNAPSHOT.md`
- `PHASE_B_CURRENT_RACE_ANALYSIS.md`
- `PHASE_B_STRICT_IDEMPOTENCY_OPTIONS.md`
- `PHASE_B_IDEMPOTENCY_DB_PREFLIGHT.md`
- `PHASE_B_IDEMPOTENCY_DDL_REPORT.md`
- `PHASE_B_CONCURRENCY_HTTP_PROOF_REPORT.md`
- `PHASE_B_ONE_OF_ONE_CONCURRENCY_FINAL_REPORT.md`

## DB DDL / Migration Status

Applied local/staging additive DDL only:

- added nullable `orders.idempotency_key`
- added nullable `orders.cart_fingerprint`
- added partial unique index `orders_idempotency_key_unique`

Not run:

- no production migration
- no `db:push`
- no destructive DDL
- no table/column drop
- no enum conversion
- no `placed_at` change

## Strict Idempotency Status

Implemented.

The create-order path now:

- reads `checkoutAttemptId` from request body or `Idempotency-Key`
- computes a server-side cart fingerprint from product, selected options, shipping, discount, gift, and totals data
- inserts the order with `idempotency_key` before stock/Razorpay side effects
- relies on the partial unique index for atomic same-attempt claim
- resolves unique conflicts by loading the existing order
- returns an existing same-user, same-cart, pending, non-expired payment link when safe
- returns `409 CHECKOUT_IN_PROGRESS` with `Retry-After` while the first request is still preparing
- rejects cross-user or cart-mismatched reuse without leaking links
- never reuses paid/failed/expired orders

## One-Of-One Winner Rule

Preserved. Different-user same-product concurrency still produces one winner, one active hold, and one usable payment link. The loser cannot pay.

## HTTP Proof Summary

Local/staging Hono route proof used synthetic data and Razorpay test mode. Payment links, keys, DB URL, tokens, email/phone/address values, and secrets were not printed.

Same-user same-product same-attempt concurrent double-click:

- responses: one `409 CHECKOUT_IN_PROGRESS`, one `200`
- order rows: 1
- failed rows: 0
- payment link rows: 1
- active holds: 1

Sequential retry same user/cart/attempt:

- response: `200`
- existing order/link reused
- order rows after retry: 1

Changed cart with new attempt:

- response: `200`
- independent order/link created
- old link not reused

Cross-user same idempotency key:

- other user response: `409 CHECKOUT_IN_PROGRESS`
- other user order rows: 0
- other user payment link rows: 0
- link leaked: false

Different-user same-product concurrent checkout:

- responses: one `200`, one `409 PRODUCT_RESERVED`
- order rows: 2
- failed rows: 1
- pending rows: 1
- payment link rows: 1
- active holds: 1

The different-user failed loser row is the existing stock-loss audit path, not the same-attempt double-click problem. Payment and inventory isolation remained correct.

## Customer Conflict Messaging

Implemented a central mapper at `lib/checkout/one-of-one-conflict-copy.ts`.

Covered states:

- `PRODUCT_RESERVED` / `RESERVATION_CONFLICT`
- `PRODUCT_SOLD`
- `PRODUCT_UNAVAILABLE`
- `CHECKOUT_IN_PROGRESS`
- `TOO_MANY_PENDING_ORDERS`
- generic create-order/payment failure

Checkout UI now renders an inline `aria-live="polite"` conflict panel near the order summary/payment step. Reserved/sold/unavailable states link to `/collection` and guard payment for unavailable products. Raw backend codes and `409` are not rendered to customers.

Route/UI proof notes:

- HTTP proof verified backend loser state maps to reserved customer copy.
- Unit render test verifies the inline panel includes `aria-live="polite"` and `/collection` CTA.
- No browser screenshot was captured in this phase; the route and render tests cover the Phase B copy/error state.

## Tests Added / Updated

Added/updated tests for:

- server-computed cart fingerprint rejects forged client fingerprint
- same-attempt duplicate before link returns `CHECKOUT_IN_PROGRESS`
- same-attempt after link returns existing link
- same-attempt retry after the product is already reserved by that attempt reuses existing link
- cross-user same idempotency key does not leak link
- cart fingerprint mismatch does not reuse link
- paid/failed existing orders are not reused
- conflict copy mapping for reserved/sold/unavailable/in-progress/pending/generic states
- raw backend codes are not rendered in customer UI
- `/collection` CTA exists
- inline message uses `aria-live="polite"`
- Razorpay live/test host and notification safety

## Command Results

Required Phase B commands:

- `npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint`: passed
- `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false`: passed
- `npx -y -p node@22 -p pnpm@10.28.0 pnpm run build`: passed
- `npx -y -p node@22 -p pnpm@10.28.0 pnpm run test`: passed, 138 files / 1715 tests
- `npx -y -p node@22 -p pnpm@10.28.0 pnpm audit`: passed, no known vulnerabilities
- `git diff --check`: passed

Additional repo gate:

- `npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check`: failed in public mobile LHCI assertions after `verify` passed.

LHCI blocker details:

- `/`: LCP 5268.686625 ms, expected <= 2500
- `/collection`: LCP 4438.835 ms, expected <= 2500
- `/cart`: LCP 4696.597 ms, expected <= 2500; SEO warning 0.66, expected >= 0.85
- `/checkout`: LCP 4895.5989 ms, expected <= 2500; SEO warning 0.66, expected >= 0.85
- `/our-story`: LCP 5422.1044 ms, expected <= 2500
- `/how-it-works`: LCP 5797.98075 ms, expected <= 2500
- `/policies/privacy-policy`: LCP 4215.7605 ms, expected <= 2500
- `/policies/terms-of-service`: LCP 4245.1174 ms, expected <= 2500
- `/policies/shipping-delivery-policy`: LCP 4290.62675 ms, expected <= 2500
- `/policies/return-refund-policy`: LCP 4441.3515 ms, expected <= 2500
- `/packing`: LCP 4243.5824 ms, expected <= 2500

The LHCI failure is a public mobile performance/SEO gate, not a checkout idempotency/payment safety failure.

## Cleanup Verification

HTTP proof synthetic cleanup returned to zero:

- synthetic order rows: 0
- synthetic product rows: 0
- synthetic user rows: 0
- synthetic checkout-attempt events: 0
- synthetic order-payload events: 0

LHCI generated ignored files under `test-results/`.

## Remaining Risks

- A production migration still needs to be prepared/applied for `idempotency_key`, `cart_fingerprint`, and the partial unique index before production launch.
- Different-user same-product races may still create one failed loser audit row. This is expected inventory conflict behavior and does not create a duplicate link/hold.
- `agent:check` is not fully green because public mobile LHCI LCP assertions fail across existing routes.

## GO / NO-GO

Phase B functional/security gate: GO.

Phase C order isolation/browser tests: GO.

Production launch: NO-GO until the production idempotency migration is handled and repo-level LHCI policy is either fixed or explicitly waived by the owner.
