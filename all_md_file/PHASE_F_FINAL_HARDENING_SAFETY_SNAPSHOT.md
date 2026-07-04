# Phase F Final Hardening Safety Snapshot

Date: 2026-07-03
Branch: JP-Sprint
Scope: final launch hardening only. No deploy, push, production DDL, sitemap submission, live payment, production load test, or customer notification was performed.

## Required Commands

| Command | Result |
| --- | --- |
| `git status --short` | Dirty worktree before and after Phase F. Existing Phase B/C/D/E changes remain present. |
| `git diff --name-status` | Dirty tracked files include payment, checkout, auth/account UI, DB/schema, SEO, e2e, unit tests, and test-results. |
| `git diff --check` | PASS before edits and PASS after validation. |
| `test -f pnpm-lock.yaml && echo "pnpm-lock exists" || echo "pnpm-lock missing"` | `pnpm-lock exists` |
| `node -v` | `v25.4.0` local shell default |
| `pnpm -v` | `10.28.0` |
| Node 22 wrapper | `npx -y -p node@22 -p pnpm@10.28.0 node -v` -> `v22.23.1` |
| Node 22 wrapper pnpm | `10.28.0` |

## Dirty File Classification

Existing dirty files from prior phases were not reverted.

Product/payment/auth/DB dirty files:
- `api/hono/routes/payments.ts`
- `components/account/account-auth-frame.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/order-summary.tsx`
- `db/queries/orders.ts`
- `db/schema.ts`
- `lib/cart/availability-errors.ts`
- `lib/checkout/use-checkout-payment.ts`
- `lib/email/templates.ts`
- `lib/orders/receipt-html.ts`
- `lib/payments/payment-host-guard.ts`
- `lib/payments/razorpay.ts`
- payment/auth/order/rate-limit unit tests

Performance/media dirty files:
- `app/globals.css`
- `components/layout/site-footer.tsx`
- `components/layout/site-header-server.tsx`
- `components/layout/site-header.tsx`
- `components/sections/founders-page-client.tsx`
- `app/(site)/our-story/page.tsx`
- `public/Ftt_logo_navbar.avif`
- `test-results/mobile-product-page.png`
- `test-results/mobile-product-gallery.png`

SEO dirty files:
- `app/sitemap.ts`
- `lib/seo/json-ld.ts`
- `lib/seo/keyword-landing-pages.ts`

Test-results dirty files:
- `test-results/mobile-product-page.png`
- `test-results/mobile-product-gallery.png`
- `test-results/lighthouse/mobile/*` is ignored by git

Report files ignored by git:
- `/*_REPORT.md` is ignored by `.gitignore`.
- `/*_PLAN.md` is ignored by `.gitignore`.
- `/*_CHECKLIST.md` is ignored by `.gitignore`.
- `test-results/` is ignored by `.gitignore`.
- Snapshot/readiness/decision/preflight/packet files do not match those ignore rules and may appear as untracked files.

Package/lockfile:
- `pnpm-lock.yaml` exists.
- `package.json` and `pnpm-lock.yaml` were not changed in Phase F.

## Phase F Files Changed By This Turn

Code/config:
- `app/globals.css`: removed global `text-rendering: optimizeLegibility`.
- `components/layout/site-footer.tsx`: added `loading="lazy"` and `fetchPriority="low"` to footer-only logo image, added `fetchPriority="low"` to the decorative footer trunk image. The precise trunk `sizes` value was already part of the Phase E footer work.
- `app/sitemap.ts`: added `/sell-your-saree` to the static sitemap list.
- `tests/e2e/site-feedback-fixes.spec.ts`: updated stale assertions to current UI contracts.
- `tests/e2e/mobile-screenshot.spec.ts`: updated mobile screenshot flow to scroll current purchase CTA into view.
- `drizzle/0026_orders_idempotency_key.sql`: created reviewed additive idempotency DDL artifact. Not applied.

Artifacts:
- Phase F reports/checklists/plans created in repo root.

## Guardrails Observed

- No product pricing, stock, order ownership, payment amount, shipping math, auth rule, DB production data, or product image representation was changed.
- No deploy or push.
- No production DDL was run.
- No sitemap was submitted.
- No production load test was run.
- No live Razorpay payment was used.
- No customer notification was sent.
- No secret values were printed.
