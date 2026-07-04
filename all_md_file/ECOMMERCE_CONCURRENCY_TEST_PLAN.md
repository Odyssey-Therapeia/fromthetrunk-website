# Ecommerce Concurrency Test Plan

Status: Plan only. Do not run destructive tests yet.

## Environments

- Unit tests: safe, mocked, local.
- Integration tests: disposable local/test DB only.
- Playwright multi-user tests: local or staging only with test products and test payment mode.
- `autocannon`: local only unless explicitly approved.
- `k6`: staging only if approved. Never production without explicit launch-load approval.

## Inventory Tests

| Test | Purpose | Setup | Expected Result | Writes Data | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Two users add same item to cart | Prove reserve winner rule | One available test product, two sessions | One reserve 200, one conflict | Yes | Release/reset product |
| Two users checkout same item | Prove create-order atomic claim | Two authenticated users, same product | One payment link, one 409 | Yes | Cancel/release/reset |
| One payment succeeds, second fails | Prove no double sell | Simulate one paid webhook, second attempt | Product sold once, loser rejected | Yes | Reset test data |
| Abandoned payment releases hold | Prove cleanup | Create hold, let expiry pass or trigger test cleanup | Product available after cleanup | Yes | Reset product/order |
| Sold product cannot be bought again | Prove sold exclusion | Product `sold` | Cart/checkout rejects | Yes if setup | Reset product |
| Duplicate webhook | Prove idempotency | Same event id twice | Completion once, emails once | Yes | Reset order/product |

## Checkout Tests

| Test | Purpose | Expected Result |
| --- | --- | --- |
| User A cannot access user B order | Owner isolation | 403/404 or generic inaccessible response |
| Guest token works only for correct order | HMAC scoping | Correct order visible, wrong order denied |
| Same idempotency key across users | No payment link leak | Second user cannot reuse first link |
| Retry same checkout | Correct reuse | Same user/cart gets same pending link |
| Cart changes create new attempt | Prevent stale payment | New fingerprint/new attempt |
| Client price tampering | Server authority | Server recomputes totals or rejects |

## Traffic Tests

| Test | Tool | Environment | Expected Result |
| --- | --- | --- | --- |
| 10 concurrent collection requests | autocannon | local | No errors, stable latency |
| 50 stock endpoint requests | autocannon | local/staging approved | Rate limit not triggered under normal burst, p95 acceptable |
| 20 geo/search requests | autocannon | local | No upstream/error storm |
| Semantic search rate limit | Vitest/integration | local | 10/min cap enforced |
| Mobile Lighthouse image-heavy pages | Lighthouse/agent check | local/staging | LCP/CLS/TBT within agreed budget |

## Login/OTP Tests

| Test | Purpose | Expected Result |
| --- | --- | --- |
| Many OTP starts same identifier | Abuse control | 429 after configured threshold |
| Many OTP starts same IP | Abuse control | 429 after configured threshold |
| OTP brute force | Attempt limit | Challenge locked/invalid after max attempts |
| Resend spam | Provider protection | Identifier/IP limits throttle |
| Email provider failure | Safe UX | Generic safe response, no secret logs |
| Concurrent verifies | Replay protection | One verification/ticket wins, old ticket cannot replay |

## Existing Test Anchors

- Vitest: `cart-reservation-routes`, `payments-route`, `complete-paid-order`, `webhooks-route`, `checkout-idempotency`, `auth-otp-*`, `rate-limit-production`, `seo-production-hardening`.
- Playwright existing e2e is UI-focused; add multi-session commerce scenarios.

## Proposed Commands

Safe local only after owner confirms test DB/test payment mode:

```text
pnpm vitest run tests/unit/cart-reservation-routes.test.ts tests/unit/payments-route.test.ts tests/unit/complete-paid-order.test.ts tests/unit/webhooks-route.test.ts
pnpm vitest run tests/unit/auth-otp-route-expiry.test.ts tests/unit/rate-limit-production.test.ts
pnpm exec playwright test tests/e2e --project=chromium
```

Optional local load smoke only:

```text
pnpm exec autocannon -c 10 -d 15 http://localhost:3000/collection
pnpm exec autocannon -c 50 -d 15 http://localhost:3000/api/v2/products/test-product/stock
```

Do not run the load commands against production.
