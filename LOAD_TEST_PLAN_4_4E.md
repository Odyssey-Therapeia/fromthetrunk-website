# LOAD_TEST_PLAN_4_4E.md

Date: 2026-06-27

Scope: staging-only load and stress plan. Do not run against production. Do not send live OTP emails. Use Razorpay test mode only.

## Preconditions

- Node 22 and pnpm 10.28.0.
- Staging database, not production.
- Dedicated staging secrets configured.
- Razorpay test credentials only.
- Rate limiter durable adapter configured.
- At least one published available test product.
- Test email/OTP path approved or mocked.

## Scenarios

| Scenario | Routes | Notes |
|---|---|---|
| Public browsing | `/`, `/collection`, `/collection?tags=...`, `/collection/[slug]`, policy pages | Warm cache and cold cache runs. |
| Auth OTP | `/api/v2/auth/otp/start`, `/api/v2/auth/otp/verify` | Use safe test identifiers and stay below live email limits unless mocked. |
| Wishlist | `/api/v2/wishlist` GET/POST/DELETE | Authenticated customer only; no userId in payload. |
| Cart | `/api/v2/cart/reserve`, `/api/v2/cart/release` | Use disposable test product or reset fixture. |
| Cart one-of-one conflict | `/api/v2/cart/reserve` | Two simulated customers attempt to reserve the same available product at the same time. Exactly one succeeds; the other gets `PRODUCT_RESERVED` or `RESERVATION_CONFLICT`. |
| Cart expiry recovery | `/api/v2/cart/reserve`, `/api/v2/cart/release-expired` | Use a staging/test override for a short hold only outside production. Confirm expired holds become available lazily and never silently disappear in UI smoke. |
| Checkout | `/api/v2/payments/create-order` | Razorpay test mode only; do not trust client totals. |
| Checkout stale reservation | `/api/v2/payments/create-order` | Attempt create-order with expired, missing, wrong, and matching reservation tokens. Expect `RESERVATION_EXPIRED`, `PRODUCT_RESERVED`, `RESERVATION_CONFLICT`, and success respectively. |
| Webhook replay | Razorpay test webhook route | Signed valid replay and invalid signature 400. |

## Tools

- `k6` for staged traffic profiles.
- `autocannon` for focused API endpoint pressure.
- Lighthouse/agent gate after warm-cache browsing.

## Ramp Plan

1. 25 concurrent users for smoke.
2. 100 concurrent users for launch rehearsal.
3. 500 concurrent users only if staging infra and rate limits are sized for it.

Do not simulate "1 lakh visitors" by hammering DB-backed mutation routes. Validate that high-volume public browsing is served by CDN/static/cache paths and that mutation paths rate-limit safely.

## Metrics

- p50, p95, p99 latency.
- Error rate.
- DB query count.
- DB connection/HTTP request count.
- Rate-limit hit count.
- Vercel function duration and memory.
- Neon compute utilization.
- Cache hit rate.
- Mobile LCP after warm cache.

## Pass Targets

| Area | Target |
|---|---:|
| Public cached routes | p95 server time < 500ms |
| Catalog/filter warm cache | p95 server time < 1000ms |
| Mutations | p95 < 1500ms |
| Payment create-order | p95 < 2000ms |
| Error rate | < 1%, excluding intended rate limits |
| DB saturation | No saturation at expected launch load |

## Reporting

Capture:

- command and environment,
- test data used,
- p50/p95/p99,
- error samples,
- Neon/Vercel utilization screenshots or exports,
- rollback decision if targets fail.
