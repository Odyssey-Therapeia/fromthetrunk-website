# Security Fix Phase 4.3 Report

Date: 2026-06-27  
Scope: release-gate cleanup, concurrency hardening, duplicate-registration controls, validation sweep, CSP enforcement planning, and live-smoke readiness from `SECURITY.md`, `SECURITY_FIX_PHASE_4_1_REPORT.md`, and `SECURITY_FIX_PHASE_4_2_REPORT.md`.

No live OTP email was sent. No production payment endpoint was hit. Razorpay signature verification and server-authoritative pricing/payment calculation were not weakened.

## Summary

Phase 4.3 moved the repo from isolated control passes to a much cleaner local release posture:

- Release gates were rerun on supported Node `v22.23.1` with pnpm `10.28.0`.
- Full unit suite is now green: 123 files, 1,574 tests.
- `lint`, `build`, `tsc`, `audit`, `audit --prod`, and `git diff --check` are green.
- `agent:check` now reaches LHCI; public mobile still fails LCP assertions.
- Remaining public-mobile contrast failures found by LHCI were fixed with scoped text-color corrections.
- Dependency audit findings from the 4.2 report were cleared with safe dependency movement/overrides.
- Duplicate sign-up after OTP verification now blocks existing real/admin accounts while preserving checkout-shell upgrade.
- Additional tests cover create-order races and Razorpay callback/webhook idempotency.
- `CSP_ENFORCEMENT_PLAN.md`, `DESIGN_PAYMENT_OUTBOX.md`, and `LIVE_SMOKE_TEST_PLAN.md` were added for work that should not be forced into this phase.

Recommendation: GO for controlled pre-production staging and live-smoke rehearsal. NO-GO for production release until LHCI mobile LCP and live service smoke tests are complete.

## Changed Files

Phase 4.3 changed or added the following release/security-focused files:

- `api/hono/routes/auth-otp.ts`
- `api/hono/routes/discounts.ts`
- `api/hono/routes/media.ts`
- `api/hono/routes/payments.ts`
- `api/hono/routes/wishlist.ts`
- `api/hono/schemas/admin-import.ts`
- `api/hono/schemas/cart.ts`
- `api/hono/schemas/orders.ts`
- `api/hono/schemas/payments.ts`
- `app/(admin)/layout.tsx`
- `app/(admin)/admin/orders/[id]/packing-slip/page.tsx`
- `app/(admin)/admin/orders/[id]/packing-slip/print-controls.tsx`
- `app/(site)/collection/page.tsx`
- `components/cart/cart-page-client.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/empty-cart.tsx`
- `components/widgets/floating-whatsapp.tsx`
- `CSP_ENFORCEMENT_PLAN.md`
- `DESIGN_PAYMENT_OUTBOX.md`
- `LIVE_SMOKE_TEST_PLAN.md`
- `SECURITY_FIX_PHASE_4_3_REPORT.md`
- `package.json`
- `pnpm-lock.yaml`
- `tests/unit/auth-middleware.test.ts`
- `tests/unit/auth-otp-registration-complete.test.ts`
- `tests/unit/bulk-edit-collection-tag-routes.test.ts`
- `tests/unit/bulk-edit-routes.test.ts`
- `tests/unit/cart-reservation-routes.test.ts`
- `tests/unit/checkout-estimate.test.ts`
- `tests/unit/csv-export.test.ts`
- `tests/unit/media-upload-enforcement.test.ts`
- `tests/unit/order-charge-totals-route.test.ts`
- `tests/unit/payments-route-discount.test.ts`
- `tests/unit/payments-route.test.ts`
- `tests/unit/product-api-public-visibility.test.ts`
- `tests/unit/product-stock-route.test.ts`
- `tests/unit/site-feedback-fixes.test.ts`
- `tests/unit/validation-schemas.test.ts`
- `tests/unit/webhooks-route.test.ts`

The working tree still contains earlier OTP, commerce-auth, analytics, and storefront changes. This report treats only the files above as Phase 4.3-relevant.

## Fixed Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Supported Node gate | Fixed | Commands were run through `npx -y -p node@22 -p pnpm@10.28.0`; runtime confirmed `node v22.23.1`, `pnpm 10.28.0`. |
| Full-suite blockers from 4.2 | Fixed | The listed auth middleware, checkout estimate, order total, packing slip, site feedback, and product-route test failures were repaired or isolated with mocks. Full suite passes. |
| Dependency audit | Fixed locally | `pnpm audit` and `pnpm audit --prod` now report no known vulnerabilities. |
| LHCI color contrast | Fixed for public mobile | The latest public-mobile LHCI run no longer reports `color-contrast`; scoped fixes were made to the WhatsApp bubble, collection labels, cart labels, and checkout empty-state labels. |
| Registration duplicate-account rules | Fixed | Verified sign-up tickets now reject existing real/admin accounts post-verification with a safe `ACCOUNT_ALREADY_EXISTS` response; checkout shells still upgrade in place. |
| Create-order race tests | Added | `tests/unit/payments-route.test.ts` covers two users racing create-order for the same product. |
| Callback/webhook idempotency tests | Added | `tests/unit/payments-route.test.ts` and `tests/unit/webhooks-route.test.ts` cover duplicate callback/webhook replay behavior. |
| Payment outbox design | Documented | `DESIGN_PAYMENT_OUTBOX.md` contains the migration/rollout plan instead of forcing a risky transaction/outbox rewrite in this phase. |
| CSP enforcement path | Documented | `CSP_ENFORCEMENT_PLAN.md` defines domains, nonce/hash strategy, Razorpay/map/analytics needs, and rollout timeline. |
| Live smoke readiness | Documented | `LIVE_SMOKE_TEST_PLAN.md` defines manual smoke steps without sending live OTPs or hitting production payments. |

## Release Gates

| Command | Result | Notes |
| --- | --- | --- |
| `node -v && pnpm -v` through Node 22 shim | Pass | `v22.23.1`, `10.28.0`. |
| `pnpm run lint` | Pass with warning | Existing warning only: `app/(site)/our-story/page.tsx` hook dependency warning. |
| `pnpm run build` | Pass | Next.js 16.2.9 Turbopack build completed. Existing warning: edge runtime disables static generation for that page. |
| `pnpm exec tsc --noEmit --pretty false` | Pass | A stale generated `.next/dev/types` folder caused one false failure first; after deleting only `.next/dev`, source TypeScript passed. |
| `pnpm run test` | Pass | 123 files, 1,574 tests. Expected intentional test logs still appear for failing sinks/error handling. |
| `pnpm audit` | Pass | No known vulnerabilities found. |
| `pnpm audit --prod` | Pass | No known vulnerabilities found. |
| `pnpm outdated` | Informational exit 1 | Lists available updates; no direct security vulnerability remains from audit. |
| `pnpm run agent:check` | Reaches LHCI, fails mobile LCP | Test/lint/build phase passes. Public mobile LHCI fails LCP thresholds before desktop/admin scopes run. |
| `git diff --check` | Pass | No whitespace errors. |

## LHCI Status

The latest public-mobile LHCI run has no remaining color-contrast assertion failures. It still fails the `largest-contentful-paint <= 2500ms` assertion:

| URL | Latest public-mobile LCP | Main LCP element |
| --- | ---: | --- |
| `/` | 4,663 ms | Hero span/text |
| `/collection` | 3,173 ms | Collection span/text |
| `/cart` | 23,856 ms | Cart hero paragraph |
| `/checkout` | 30,829 ms | External Instagram/video element rendered in page chrome/footer |
| `/our-story` | 4,552 ms | Hero image |
| `/how-it-works` | 4,184 ms | Page H1 |
| `/privacy-policy` | 4,043 ms | Policy list text |
| `/shipping-policy` | 4,209 ms | Policy paragraph |
| `/return-policy` | 4,051 ms | Policy paragraph |
| `/packing` | 4,044 ms | Page paragraph |

Cart and checkout also retain SEO score warnings at `0.66` against the `0.85` warning threshold. These are release-gate blockers, but they are performance/SEO work rather than the Phase 4.3 security controls.

Latest LHCI artifacts are under:

- `test-results/lighthouse/mobile/manifest.json`
- `test-results/lighthouse/mobile/*.report.html`
- `test-results/lighthouse/mobile/*.report.json`

## Dependency Audit Status

Implemented cleanup:

- Moved `drizzle-kit` out of production dependencies.
- Added pnpm overrides for vulnerable transitive/dev-tooling paths:
  - `esbuild: 0.25.12`
  - `js-yaml: ^4.2.0`
  - `postcss: ^8.5.15`
  - `tmp: ^0.2.7`
  - `uuid: ^11.1.1`
- Updated direct dev `postcss` to `^8.5.15`.
- Verified:
  - `pnpm audit`: no known vulnerabilities.
  - `pnpm audit --prod`: no known vulnerabilities.
  - `pnpm exec drizzle-kit --version`: works with `drizzle-kit v0.31.10`, `drizzle-orm v0.45.2`.
  - `pnpm exec lhci --version`: works with `0.15.1`.
  - NextAuth JWT encode smoke passes with the `uuid` override.

Accepted follow-up:

- `pnpm install` still reports a peer warning because `@auth/core`/`next-auth` expects `nodemailer@^7.0.7` while the direct dependency is `9.0.1`. The audit is clean, but email-provider compatibility should be watched in staging.
- `pnpm outdated` lists non-security update candidates, including patch/minor updates for Assistant UI, Electric SQL, Playwright, TanStack Query, Vercel Blob, framer-motion, `pg`, and major updates for AI SDK, Hono node server, TypeScript, ESLint, Speed Insights, undici, Lucide, and Sharp. Risky framework/tooling majors were intentionally not taken in this phase.

## Concurrency Test Status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Two users attempt reserve same product | Covered | `tests/unit/cart-reservation-routes.test.ts`. |
| Two users attempt create-order for same product | Covered | New race test in `tests/unit/payments-route.test.ts`. |
| Expired reservation attempts create-order | Covered | `tests/unit/payments-route.test.ts` and reservation route tests cover expired/invalid reservation behavior. |
| Duplicate Razorpay callback/webhook arrives | Covered | New callback replay test in `tests/unit/payments-route.test.ts`; webhook replay delegation test in `tests/unit/webhooks-route.test.ts`. |
| Payment completion after product sold fails gracefully | Covered | `tests/unit/complete-paid-order.test.ts`. |
| Structured errors | Covered | Existing and updated payment/cart tests assert `PRODUCT_SOLD`, `RESERVATION_EXPIRED`, `RESERVATION_CONFLICT`, and `PRODUCT_RESERVED` paths. |
| UI toast/dialog, no silent removal | Covered by source inspection | Add-to-cart, cart open, checkout entry, and create-order paths map availability errors to friendly customer toasts. No 5-second polling was added. |

Remaining design work:

- A true payment transaction/outbox remains a planned hardening item. The current code has idempotency and stock-claim guards, but the durable outbox should be implemented separately from this release cleanup. See `DESIGN_PAYMENT_OUTBOX.md`.

## Duplicate-Account Test Status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Pre-verification does not reveal account existence | Pass | OTP start remains generic. |
| Existing real email does not duplicate user | Pass | `tests/unit/auth-otp-registration-complete.test.ts`. |
| Checkout shell upgrades in place | Pass | `tests/unit/auth-otp-registration-complete.test.ts`. |
| Unknown email creates user | Pass | `tests/unit/auth-otp-registration-complete.test.ts`. |
| Existing admin email cannot create customer takeover | Pass | `tests/unit/auth-otp-registration-complete.test.ts`. |
| OAuth-created customer remains OTP sign-in eligible | Preserved | The duplicate-registration guard blocks sign-up takeover, not customer OTP sign-in. |

## SQL Injection and Validation Sweep

Command run:

```sh
rg -n 'sql`|db\\.execute|raw|\\$queryRaw|where\\(' db api lib
```

Findings:

- Raw SQL appears as Drizzle `sql` tagged templates or Neon `rawSql` tagged templates.
- Spot-checked `db/queries/reservations.ts`, `lib/ai/embeddings.ts`, `lib/ai/extensions.ts`, and `lib/adapters/postgres-catalog-search.ts`.
- User-controlled values in these raw templates are passed through tagged-template bindings, not concatenated strings.
- No `$queryRaw` usage was found.
- The broad `raw` matches mostly refer to `c.req.raw`, raw webhook body verification, or local variable names, not unsafe SQL.

Validation/cap additions:

- Media complete-upload caps URL/path/name/content type/size and only accepts trusted Vercel Blob image URLs.
- Admin import caps file IDs, headers, rows, columns, fields, confidence, and malformed CSV.
- Wishlist restock email is normalized and capped.
- Discount preview caps product IDs, subtotal, and item count.
- Order/cart/payment schemas are stricter and cap reservation tokens, IDs, signatures, and reject forged price/total/tax/shipping fields.
- Product existence is checked before wishlist/cart/order mutation paths.

## CSP and Live Smoke

CSP remains report-only by design. Enforcement is blocked until inline JSON-LD/theme/receipt patterns get nonce/hash treatment and Razorpay test checkout is verified under the policy.

Prepared follow-up documents:

- `CSP_ENFORCEMENT_PLAN.md`
- `LIVE_SMOKE_TEST_PLAN.md`

Live smoke was not run because the instruction explicitly prohibited live OTP emails unless allowed and prohibited production payment endpoints. Required staging smoke remains:

- Resend OTP to release test inbox.
- OTP login from account, wishlist dialog, and checkout gate.
- Razorpay test-mode create-order/success/failure.
- Razorpay webhook signature validation and replay.
- Durable production-like rate limiter.
- Dedicated token secrets in the staging environment.
- CSP report review in browser with Razorpay and analytics loaded.

## Remaining Risks

- Public mobile LHCI LCP fails on every tested URL; cart/checkout are especially high.
- Admin desktop/mobile LHCI did not run in the latest `agent:check` because the matrix stops after public-mobile failure.
- Cart and checkout SEO warnings remain in LHCI.
- Live service smoke is still required before production release.
- CSP is not enforced yet.
- Payment outbox/transaction refactor is still design-only.
- Nodemailer v9 clears audit but has a peer warning against the NextAuth/Auth.js expected v7 range.
- Existing `app/(site)/our-story/page.tsx` React hook lint warning remains.

## GO / NO-GO

GO for controlled pre-production staging candidate and live-smoke rehearsal.

NO-GO for production release until:

- Public mobile LHCI LCP and cart/checkout SEO warnings are resolved or formally rebaselined.
- Full `agent:check` passes through public desktop and admin mobile/desktop scopes.
- Live Resend/Razorpay/durable-rate-limit/token-secret smoke tests pass in staging.
- CSP report-only observations are reviewed and the enforcement plan is either completed or accepted as a staged follow-up.
