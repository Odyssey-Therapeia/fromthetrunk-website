# Phase H Rollback And Monitoring Plan

Date: 2026-07-03
Status: Plan only. Not executed.

## Pre-Cutover Checklist

1. Confirm Vercel project and production domain.
2. Confirm production env values exist without exposing secret values.
3. Confirm Neon production project, branch, database, and fresh snapshot.
4. Apply and verify `drizzle/0026_orders_idempotency_key.sql`.
5. Deploy only after owner approval.
6. Verify deployed auth cookies and account isolation.
7. Verify Razorpay mode, webhook endpoint, and notification behavior.
8. Verify `www` sitemap, robots, llms, canonical tags, and no stale preview mismatch.
9. Run Search Console submission only after owner approval.

## Immediate Post-Deploy Monitoring

Monitor for at least the first 60 minutes:

- 5xx rate on public pages and `/api/v2/*`.
- Checkout create-order failures.
- Duplicate idempotency conflict logs.
- Razorpay payment link creation and webhook completion.
- Reservation release failures.
- OTP send/verify failures.
- Durable rate-limit 503s indicating missing Redis/KV config.
- Auth callback/session cookie errors.
- Sitemap/robots/llms response status.
- LCP and server response degradation.

## Rollback Triggers

- Production checkout cannot create orders.
- Multiple duplicate order records appear for the same checkout attempt.
- Razorpay live mode is active on an unsafe host or wrong environment.
- Webhook signature failures spike after dashboard/env verification.
- Auth cookies do not persist or leak across accounts.
- Durable rate limiter fails closed on critical customer flows due missing production env.
- Production error rate materially exceeds baseline.
- Sitemap/robots expose wrong domains or noindex critical storefront pages.

## Rollback Shape

Preferred rollback order:

1. Roll back Vercel deployment to last known good build.
2. Disable live checkout if payment safety is in doubt.
3. Keep production DDL in place if already applied; it is additive and should not need rollback for a code rollback.
4. Only consider DDL rollback with owner approval, verified backup, and confirmation no current orders rely on the new columns.

## Communication

- Owner must approve any deploy, rollback, production DDL, Search Console submission, and live payment validation.
- Customer-facing notification should not be sent unless owner explicitly approves the exact message and timing.

