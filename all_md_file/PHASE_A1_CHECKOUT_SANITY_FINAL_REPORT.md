# Phase A.1 Checkout Sanity Final Report

Date: 2026-07-03

Scope: local/staging Razorpay test-safe checkout sanity.

## Env Safety Status

Post-fix local classification:

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: test
RAZORPAY_KEY_SECRET: present
RAZORPAY_WEBHOOK_SECRET: present
NEXT_PUBLIC_SERVER_URL: localhost
NEXTAUTH_URL: localhost
ALLOW_UNSAFE_LIVE_PAYMENTS: missing/false
```

`.env.local` was changed and remains gitignored. No env values were printed.

## Code Safety Changes

Changed:

```text
lib/payments/payment-host-guard.ts
lib/payments/razorpay.ts
tests/unit/payment-host-guard.test.ts
tests/unit/payments-route.test.ts
tests/unit/razorpay-notification-safety.test.ts
```

Key changes:

- live mode now detects either server or public Razorpay live key
- local/staging live public key now blocks create-order on unsafe hosts
- Razorpay customer notifications and reminders are disabled outside live production custom-domain mode
- production live custom-domain behavior remains enabled

## Notification Safety Status

```text
localhost/test key notification decision: false
vercel.app/live key notification decision: false
production custom domain/live key notification decision: true
```

No real customer email/SMS was sent by the local/staging test path.

## Create-Order HTTP Result

API-level Hono route sanity with mocked auth and synthetic staging DB data:

```text
POST /create-order: 200
payment link response: yes, test mode
order row: exactly one for the first attempt
order_items row: present
product active hold: one
same-attempt retry: reused same order/link
cross-user same-attempt reuse: rejected with PRODUCT_RESERVED
changed cart/new attempt: created a new order
```

Cleanup verification:

```json
{
  "products": 0,
  "users": 0,
  "orders": 0,
  "attempt_events": 0
}
```

## Idempotency Result

Sequential retry: PASS.

Different user cannot reuse same attempt: PASS.

Changed cart/new attempt: PASS.

Rapid concurrent double-click: PARTIAL.

```text
statuses: 200 and 409
successful payment links: 1
active holds: 1
extra row: one failed loser order row
```

This is payment/inventory safe, but not perfectly order-row idempotent under concurrent same-attempt submission.

## One-Of-One HTTP Result

```text
statuses: 200 and 409
successful payment links: 1
active holds: 1
loser row: failed and cannot pay
```

One-of-one same-product HTTP sanity: PASS for one winner only; PARTIAL for strict no-extra-order-row cleanliness.

## Verification Commands

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm run build
PASS

npx -y -p node@22 -p pnpm@10.28.0 pnpm run test
PASS - 138 files, 1708 tests

npx -y -p node@22 -p pnpm@10.28.0 pnpm audit
PASS - no known vulnerabilities found

git diff --check
PASS
```

Build emitted the expected localhost canonical fallback warning:

```text
[seo] Invalid production canonical origin "http://localhost:3000"; using https://www.fromthetrunk.shop.
```

The test suite emitted expected negative-path error logs and exited successfully.

## Remaining Blockers / Risks

1. Concurrent same-attempt double-click can create one extra failed order row before the loser request is rejected by the stock claim.
2. The current durable idempotency marker is recorded after payment-link creation, so it is not a strict pre-order unique claim.
3. Full browser UI checkout was not run; the safe run was API-level Hono with mocked auth.
4. Vercel staging envs were not changed in this phase and must be set to test keys before staging checkout tests.

## GO / NO-GO For Phase B Concurrency Tests

Phase A.1 payment-environment safety: GO.

Phase A.1 HTTP create-order sanity: GO.

Phase A.1 strict idempotency gate: CONDITIONAL NO-GO.

Reason: no duplicate payment link or active hold was created, but the concurrent same-attempt loser still created a failed order row. Phase B can start only as a focused concurrency/idempotency hardening phase, or this failed-row behavior must be explicitly accepted as safe before broader production-readiness concurrency testing.

