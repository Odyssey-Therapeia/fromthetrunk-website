# Phase C Order Isolation Safety Snapshot

Date: 2026-07-03

## Scope Guard

- No SEO changes were made for Phase C.
- No deploy, push, sitemap submit, production migration, or production DB mutation was performed.
- Razorpay mode classified as test for both server and public key ids.
- No payment links, tokens, secrets, customer PII, phone numbers, emails, or addresses are included in this report.

## Commands

- `git status --short`: dirty worktree, including Phase B changes, pre-existing unrelated deletions/modifications, and Phase C test/report additions.
- `git diff --name-status`: dirty worktree confirmed.
- `git diff --check`: passed.
- `test -f pnpm-lock.yaml && echo "pnpm-lock exists" || echo "pnpm-lock missing"`: `pnpm-lock exists`.

## Dirty State Summary

Known pre-Phase-C or unrelated dirty state observed and not reverted:

- Deleted root artifacts: `Archive.zip`, `FINAL_PRE_PUSH_COMMAND_RESULTS.md`, `FINAL_PRE_PUSH_SAFETY_SNAPSHOT.md`, `LEGAL_CONTENT.md`, `PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md`, `SERVER_RATE_LIMIT_MATRIX.md`, `handoff-top-viewed.md`.
- Unrelated storefront/content/header/footer/SEO/email/template files were already dirty or outside Phase C scope.
- `all_md_file/` and `public/Ftt_logo_navbar.avif` are untracked and unrelated to Phase C.

Phase B checkout/idempotency files still dirty:

- `api/hono/routes/payments.ts`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/order-summary.tsx`
- `db/queries/orders.ts`
- `db/schema.ts`
- `lib/cart/availability-errors.ts`
- `lib/checkout/use-checkout-payment.ts`
- `lib/payments/payment-host-guard.ts`
- `lib/payments/razorpay.ts`
- payment/idempotency unit tests

Phase C files added/updated:

- `scripts/phase-c-order-isolation-proof.ts`
- `tests/e2e/phase-c-checkout-isolation.spec.ts`
- `tests/unit/order-receipt-route-isolation.test.ts`
- `tests/unit/viewable-order-isolation.test.ts`
- `tests/unit/payments-route.test.ts`
- `vitest.config.ts`
- existing Playwright selector tests stabilized for duplicate PDP `Add to Bag` CTAs

## DB And Migration State

- `db/schema.ts` is dirty and includes `orders.idempotency_key`, `orders.cart_fingerprint`, and partial unique index `orders_idempotency_key_unique`.
- No new Drizzle migration file was created in Phase C.
- Local/staging DDL preflight returned:
  - `orders.cart_fingerprint`: present
  - `orders.idempotency_key`: present
  - `orders_idempotency_key_unique`: present

## Env Classification

Redacted classification only:

- `NODE_ENV`: unset
- `VERCEL_ENV`: unset
- `RAZORPAY_KEY_ID`: test
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`: test
- `NEXT_PUBLIC_SERVER_URL` production-domain check: false
- `DATABASE_URL`: configured, value not printed
- `.env.local`: ignored by `.gitignore`

## Vercel Env

No Vercel env commands were run and no Vercel env values were changed.
