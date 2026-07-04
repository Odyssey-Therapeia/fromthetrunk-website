# FTT 5 Risk Master Audit Report

Audit date: 2026-07-03
Branch: `JP-Sprint`
Mode: Audit-first, no code fixes.

## Executive Summary

| Area | Result | Summary |
| --- | --- | --- |
| SEO/ranking/indexing | Conditional GO, performance blocker | Crawlability, canonical URLs, sitemap, robots, image/schema basics are strong. Local mobile Lighthouse failed LCP across public routes. |
| One-of-one concurrency | Conditional NO-GO | Product-row atomic claims are strong, but DB schema and cleanup/cron route surface need staging proof. |
| Traffic/load | Conditional NO-GO for performance readiness | Caching and lightweight stock API are good for modest traffic, but `agent:check` failed mobile LCP. |
| Checkout/order isolation | Conditional GO | Ownership checks, server totals, HMAC access tokens, and idempotency are strong. Needs multi-user staging tests. |
| Login/email/OTP concurrency | Conditional GO | Durable rate limits and replay guards are strong. Email provider and Upstash/KV availability must be verified. |
| DB/schema | NO-GO | Migration journal and actual DB state are not proven. `DATABASE_URL` is remote-unknown, so no DB query was run. |

## Top Blockers

| Blocker | Affected area | Evidence | Fix needed | Approval required |
| --- | --- | --- | --- | --- |
| Actual DB schema not verified | DB, checkout, inventory | `DATABASE_URL` remote-unknown; journal only through `0009` while SQL files exist through `0025` | Read-only staging/local preflight, then reviewed repair plan | Yes |
| Route composition gap | Cron/admin cleanup | `app/api/v2/[...route]/route.ts:1-12` imports `site-app`; cron/admin routes are in `api/hono/app.ts:167-221` | Decide expected deployed surface and mount/test it | Yes |
| No real DB concurrency proof | One-of-one | Unit tests exist, but no staged same-product DB race run in this audit | Add local/staging integration tests | Yes |
| Durable limiter env unknown | Auth/payment/cart/contact | `requireDurable` fails closed if Upstash/KV absent | Verify deployment envs and metrics | No code, but owner/env access needed |
| Mobile performance gate failed | SEO/load | `agent:check` public mobile LCP failures from 4214 ms to 6707 ms | Fix or formally waive LCP blockers, then rerun Lighthouse | Yes for asset/content changes |

## Current Behavior

- Two users add same product: add-to-cart reserves using a conditional product-row update. First update wins; second should get conflict.
- Two users checkout same product: create-order revalidates and performs another atomic product-row claim. One gets payment link; the loser is marked failed/rejected.
- Many people browse: cache layers and CDN/image optimization help, but cold catalog/search/facet traffic and large assets can stress DB/render.
- Many people checkout: auth and durable payment rate limits apply; product-row claim serializes item ownership.
- Many people request OTP/email: IP and identifier durable limits throttle; missing durable limiter fails closed with 503 in production.
- Duplicate payment webhook: event id dedupe and order paymentStatus guard prevent duplicate completion/emails.
- User refreshes checkout: checkout attempt/cart fingerprint can reuse the correct pending payment link for same user/cart.

## Risk Matrix

| Risk | Severity | Likelihood | User impact | Business impact | Current protection | Gap | Fix | Owner approval required | Can launch with risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB schema drift breaks checkout | Critical | Medium | Failed orders/payments | Revenue halt | Type schema/migrations | Actual DB unknown | Read-only preflight and repair | Yes | No |
| Same item double-sell | Critical | Low-medium | Two buyers for one product | Trust/refund damage | Atomic product/order updates | No real DB race test | Integration/staging test | Yes | No until tested |
| Reservation cleanup not running | High | Medium | Product stuck reserved | Lost sales | Cart release-expired route | Cron mount gap | Route/cron decision and test | Yes | Conditional |
| OTP/email burst failure | High | Medium | Login unavailable | Checkout drop-off | Durable fail-closed limits | Env/provider unknown | Verify Upstash/KV and email quota | Env approval | Conditional |
| Mobile LCP poor | High | High | Slow first impression | Ranking/conversion loss | Next image config | Local mobile LCP failed on 11 routes | Identify LCP element and optimize assets/rendering | Yes | No for performance-ready launch |
| Public search DB load | Medium | Low-medium | Slow search/catalog | DB cost/latency | Memory limits, small catalog | Not durable/indexed | Metrics, cache/index if needed | Yes | Yes |
| Order access token leak | Medium | Low | Specific order visible | Privacy/support risk | HMAC+expiry | Bearer token has no revocation | Shorter expiry/revocation if needed | Yes | Yes |

## Execution Plan

Phase A - DB/schema + checkout sanity:
Confirm DB identity, run read-only preflight, compare schema, decide repair plan.

Phase B - One-of-one inventory concurrency tests:
Run same-product reserve/create-order/payment completion tests against disposable DB/staging.

Phase C - Order isolation tests:
Run multi-user owner/token/receipt/idempotency tests.

Phase D - OTP/email concurrency tests:
Verify durable limiter envs, provider quota, and concurrent verify behavior.

Phase E - Load/performance test:
Run local route timing, Lighthouse matrix, and staging-only load smoke if approved.

Phase F - SEO indexing/backlink/image/performance finish:
Approve content clusters, asset optimization, crawl check, Search Console submission after launch approval.

Phase G - Production launch validation:
Backups, env audit, webhook/cron smoke, monitoring dashboards, low-risk launch checklist.

## Commands Run

Safety snapshot commands were run and documented in `ECOMMERCE_RISK_AUDIT_SAFETY_SNAPSHOT.md`.

Required verification commands requested by the audit brief:

```text
pnpm run lint                                  PASS
pnpm exec tsc --noEmit --pretty false         PASS
pnpm run build                                 PASS
pnpm run test                                  PASS, 137 files / 1703 tests
pnpm audit                                     PASS, no known vulnerabilities
git diff --check                               PASS
```

Additional repo gate:

```text
pnpm run agent:check                           FAIL
```

`agent:check` re-ran `verify` successfully, then failed in the public mobile Lighthouse phase. All 11 audited public/mobile URLs exceeded the 2500 ms LCP assertion:

- `/`: 5207 ms
- `/collection`: 6707 ms
- `/cart`: 4549 ms, plus SEO score warning 0.66 vs 0.85
- `/checkout`: 4970 ms, plus SEO score warning 0.66 vs 0.85
- `/our-story`: 5035 ms
- `/how-it-works`: 5737 ms
- `/policies/privacy-policy`: 4214 ms
- `/policies/terms-of-service`: 4291 ms
- `/policies/shipping-delivery-policy`: 4368 ms
- `/policies/return-refund-policy`: 4288 ms
- `/packing`: 4364 ms

Because the public mobile Lighthouse pass failed first, public desktop and admin Lighthouse passes did not run. The local shell also warns that Node `v25.4.0` is outside the repo engine range `>=20.9 <25`.

## Final Recommendation

Fix first: Phase A, DB/schema + checkout sanity. The code has strong app-level protections, but launch risk is dominated by unverified DB state and route-surface cleanup.

Can wait: backlink growth, new keyword content, durable search hardening, asset polish beyond measured launch blockers.

Must not touch without approval: checkout/payment/auth/cart/order logic, product stock/pricing, DB schema/migrations, production data, live payments, live emails, sitemap submission, production load tests.

Recommended next prompt:

```text
Execute Phase A only: perform a read-only DB/schema and checkout sanity preflight for From the Trunk. Do not mutate DB, do not run migrations, do not deploy, do not print secrets. Confirm the connected DB environment first, then compare information_schema for orders, order_items, products, reservations, events, auth OTP, and discounts against db/schema.ts and produce an approval-required repair plan.
```

FTT 5-RISK AUDIT RESULT:
- SEO/ranking/indexing: Conditional GO for crawl/schema, but performance blocker due mobile LCP failures.
- One-of-one concurrency: Conditional NO-GO until DB/staging concurrency proof.
- Traffic/load: Conditional NO-GO for performance readiness; modest traffic may function but local LCP gate failed.
- Checkout/order isolation: Conditional GO pending multi-user staging tests.
- Login/email/OTP concurrency: Conditional GO if durable limiter and email provider are configured.
- DB/schema status: NO-GO until read-only preflight proves schema match.
- Top 5 blockers: DB schema unknown; mobile LCP gate failed; route composition gap for cron/admin; no real DB concurrency run; durable limiter/env unknown.
- Safe quick wins: run read-only DB preflight, inspect LCP reports in `test-results/lighthouse/mobile`, verify Upstash/KV and email provider envs, document mounted API routes, rerun Lighthouse after fixes.
- Approval-required fixes: DB migrations/repair, route mount changes, checkout/payment/auth/cart/order changes, asset/content changes, staging/prod load tests.
- Recommended first execution phase: Phase A - DB/schema + checkout sanity.
