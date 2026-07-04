# Phase A DB/Checkout Final Report

Date: 2026-07-03

Scope: Phase A only - DB/schema and checkout sanity for From the Trunk.

## DB Before/After

Before:

- existing `.env.local` DB used as staging/test, per brief
- hybrid schema with current checkout tables plus legacy Payload-era artifacts
- `orders`, `order_items`, `products`, `reservations`, `events`, `auth_otp_challenges`, and `discounts` present
- `orders_items` legacy table present
- legacy enum type names still used by several actual columns
- `orders.placed_at` nullable with no default

After:

- no persistent DB schema changes
- no DDL run
- no production migration
- no data delete/truncate/drop
- rollback-only synthetic DML left 0 persisted synthetic products, orders, or users

No `PHASE_A_DB_REPAIR_APPLIED_REPORT.md` was created because no repair was approved or applied.

## Does DB Match Current Checkout Requirements?

Core checkout insert requirements: YES for the tested DB insert path.

- `orders` insert works.
- `order_items` insert works.
- legacy `orders.subtotal numeric NOT NULL` no longer blocks inserts because it is nullable and defaults to `0`.
- required inventory reservation columns exist on `products`.

Full schema parity: NO.

Remaining drift:

- `orders.status` uses `enum_orders_status`, not `order_status`.
- `orders.payment_status` uses `enum_orders_payment_status`, not `payment_status`.
- `products.status` uses `enum_products_status`, not `product_status`.
- `products.stock_status` uses `enum_products_stock_status`, not `stock_status`.
- `orders.placed_at` is nullable and has no default, but current app schema expects defaulted/non-null behavior.
- some order/product fields are looser than app schema nullability.

## SQL Applied

None.

## Checkout Sanity Result

DB-level checkout insert sanity: PASS.

Rollback-only result:

```json
{
  "orderInsert": "pass",
  "orderItemsInsert": "pass"
}
```

Create-order-shaped insert without `placed_at`: PASS, but returned `placedAtReturned: "null"`.

Full `POST /api/v2/payments/create-order` payment-link sanity: BLOCKED/NO-GO.

Reasons:

- `.env.local` has `NEXT_PUBLIC_RAZORPAY_KEY_ID` set to a live key.
- server `RAZORPAY_KEY_ID` is test, causing a mixed-key local/staging setup.
- payment-link creation enables customer notification, so calling it could send real email/SMS.
- the brief forbids live payments and real unsafe side effects.

## One-Of-One Sanity Result

Minimal DB predicate proof: PASS.

Observed:

```json
{
  "firstClaimRows": 1,
  "secondClaimRows": 0,
  "activeHoldCount": 1,
  "loserOrderStatus": "failed",
  "rollback": "complete"
}
```

Limit: this is not a full multi-session HTTP/payment race test.

## Verification Commands

All required commands passed under repo-supported Node 22:

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm run build
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm run test
PASS - 137 files, 1703 tests

npx -y -p node@22 -p pnpm@10.28.0 pnpm audit
PASS - no known vulnerabilities found

git diff --check
PASS
```

Build emitted the existing expected canonical fallback warning for localhost:

```text
[seo] Invalid production canonical origin "http://localhost:3000"; using https://www.fromthetrunk.shop.
```

Test output included expected negative-path mocked error logs, but the command exited successfully.

## Remaining Risks

- live `NEXT_PUBLIC_RAZORPAY_KEY_ID` in `.env.local`
- `NEXTAUTH_URL` is non-local in `.env.local`
- full HTTP create-order payment-link test not run
- no double-click/idempotency HTTP proof yet
- no same-attempt retry proof yet
- no changed-cart new-attempt proof yet
- no independent multi-session race proof yet
- legacy enum type drift
- `orders.placed_at` default/nullability drift

## Can Phase B Start?

Phase B should not start for full checkout/payment validation until the local/staging Razorpay public key is test-only and the payment-link path is made notification-safe or mocked for testing.

DB-level Phase B race planning can start, but full checkout race proof remains blocked by the payment environment.

## GO / NO-GO

Phase A DB schema core insert sanity: GO.

Phase A overall DB/schema + checkout final gate: NO-GO.

Reason: the final gate requires checkout create-order to work with test keys and no live key on localhost/staging. Current `.env.local` has a live public Razorpay key and the payment-link path can send notifications, so full checkout sanity was correctly blocked.

## Required Next Actions

1. Rotate the exposed Neon password, then update `.env.local` and Vercel staging envs.
2. Replace or remove local/staging `NEXT_PUBLIC_RAZORPAY_KEY_ID` so localhost/staging uses only Razorpay test keys.
3. Set local/staging `NEXTAUTH_URL` to the correct local or staging URL.
4. Approve either notification-safe Razorpay test wiring or a mocked payment-link path for local/staging sanity.
5. Decide whether to approve the `orders.placed_at` compatibility repair.
6. Rerun full checkout sanity, including double-click and same-attempt retry checks.

