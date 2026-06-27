# Security Fix Phase 4.2 Report

Date: 2026-06-27  
Scope: remaining pre-production hardening from `SECURITY.md` and `SECURITY_FIX_PHASE_4_1_REPORT.md`. No UI redesign was done, Razorpay signature verification was not weakened, no frontend price/payment data was trusted, no live OTP emails were sent, and no production payment endpoints were hit.

## Summary

Phase 4.2 addressed the remaining hardening items that were safe to implement locally:

- Inventory and reservation responses now use structured availability codes and friendly customer messages.
- Payment create-order does a final server-side availability check and rejects expired, invalid, conflicting, sold, or externally reserved products.
- Payment completion now remains idempotent and also verifies the product stock claim before emails/events continue.
- Cart and checkout recheck availability on meaningful lifecycle events only: add-to-cart, cart open, checkout entry, create-order, payment completion, and stale window focus. No 5 second DB polling was added.
- Media completion now accepts only trusted Vercel Blob image URLs and enforces host/path/type/extension/size/pixel/fetch-timeout checks before Sharp processing.
- Admin CSV import now has file, row, column, field length, malformed CSV, and per-admin cache-owner controls.
- CSP report-only headers and a no-log CSP report endpoint were added.
- Production token classes now require dedicated secrets instead of falling back to shared session/admin secrets.
- `/api/v2/docs`, `/api/v2/openapi.json`, and `/api/debug/db-ping` are disabled in production unless explicitly enabled and protected.
- Low-risk direct dependency cleanup upgraded Hono, Resend, and Nodemailer.

## Changed Files

Phase 4.2 changed or added:

- `api/hono/routes/cart.ts`
- `api/hono/routes/payments.ts`
- `api/hono/routes/orders.ts`
- `api/hono/routes/media.ts`
- `api/hono/routes/admin-import.ts`
- `api/hono/schemas/admin-import.ts`
- `api/hono/app.ts`
- `api/hono/site-app.ts`
- `app/api/debug/db-ping/route.ts`
- `app/api/csp-report/route.ts`
- `components/cart/add-to-cart-button.tsx`
- `components/cart/cart-drawer.tsx`
- `components/checkout/checkout-page-client.tsx`
- `lib/checkout/use-checkout-payment.ts`
- `lib/cart/availability-errors.ts`
- `lib/media/blob-upload.ts`
- `lib/import/file-parser.ts`
- `lib/orders/complete-paid-order.ts`
- `lib/cart/reservation-token.ts`
- `lib/orders/order-access-token.ts`
- `lib/users/email-verification-token.ts`
- `lib/content/preview-token.ts`
- `lib/auth/otp.ts`
- `lib/security/token-secrets.ts`
- `lib/http/api-docs-policy.ts`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `tests/unit/cart-reservation-routes.test.ts`
- `tests/unit/payments-route.test.ts`
- `tests/unit/complete-paid-order.test.ts`
- `tests/unit/analytics-emit-exactly-once.test.ts`
- `tests/unit/media-upload-enforcement.test.ts`
- `tests/unit/admin-import-caps.test.ts`
- `tests/unit/security-phase-4-2-policy.test.ts`

The working tree still contains many unrelated dirty files from earlier OTP, commerce-auth, analytics, and storefront phases. Those are not treated as Phase 4.2 changes in this report.

## SECURITY.md Findings Fixed

| SECURITY.md finding | Status | Fix |
| --- | --- | --- |
| Medium: admin media complete route can SSRF/fetch arbitrary URLs | Fixed | `complete-upload` now requires MIME/size, accepts only HTTPS Vercel Blob URLs under `media/`, rejects localhost/private hosts, validates extension/type/size, fetches with timeout, and checks fetched content type/length/bytes/pixels before Sharp processing. |
| Medium: admin import lacks file size/row caps and owner scoping | Fixed | CSV parse now enforces max file bytes, rows, columns, field length, malformed quoted rows, and per-admin cache ownership. Execute clears cache after use. |
| Medium: no CSP is configured | Fixed for report-only phase | Added `Content-Security-Policy-Report-Only` with app-required domains and `/api/csp-report`. Existing security headers remain. |
| Low/Medium: shared secret fallbacks increase blast radius | Fixed for production | Added `lib/security/token-secrets.ts`; production now requires dedicated reservation, order access, email verification, preview, and OTP token secrets. Development fallback remains documented in code. |
| Low/Medium: public docs/debug route exposure needs hardening | Fixed | API docs/OpenAPI are disabled in production unless `FTT_ENABLE_API_DOCS=true`. DB ping is disabled by default in production and, if enabled, requires admin session or `FTT_DEBUG_TOKEN` bearer. |
| High: dependency audit has direct Hono/Resend/Nodemailer cleanup | Partially fixed | Upgraded `hono` to `^4.12.27`, `resend` to `^6.16.0`, and `nodemailer` to `^9.0.1`. Direct Nodemailer audit finding is cleared. Remaining audit findings are transitive/dev-tooling or framework-pinned. |
| Inventory/reservation concurrency risk from Phase 4.2 brief | Improved | Add-to-cart, cart open, checkout entry, create-order, and completion recheck availability. Create-order returns `PRODUCT_SOLD`, `RESERVATION_EXPIRED`, `RESERVATION_CONFLICT`, or `PRODUCT_RESERVED`. Completion remains winner-branch idempotent and rejects product claim conflicts with `PRODUCT_SOLD`. |

## Inventory and Reservation Details

Structured availability codes:

- `PRODUCT_SOLD`: "This saree has found its next home."
- `RESERVATION_EXPIRED`: "Your reservation expired. Please add it again if still available."
- `RESERVATION_CONFLICT`: "This piece has just been reserved."
- `PRODUCT_RESERVED`: "This piece has just been reserved."

Backend controls:

- `/api/v2/cart/reserve` returns `PRODUCT_SOLD` and `PRODUCT_RESERVED` for sold/reserved contention.
- `/api/v2/payments/create-order` rejects sold products, expired reservation tokens, missing reservation tokens for reserved products, mismatched reservation tokens, v2 stock claim failures, and final atomic quantity claim failures.
- `completePaidOrder()` still uses the atomic `paymentStatus != paid` winner branch and now also requires product stock update rows before continuing to cache invalidation, reservation release, payment event, discount usage, analytics, and emails.

UI controls:

- Add-to-cart maps backend availability codes to friendly toasts.
- Cart drawer rechecks availability when opened and on window focus only if stale.
- Checkout rechecks availability on entry and maps create-order availability errors to friendly toasts.
- Items are not silently removed; a toast is shown before cart state is updated.

Remaining risk:

- The payment completion stock claim is not wrapped in a multi-statement database transaction with the order paid update because the existing implementation uses Drizzle Neon HTTP chains. The new guard prevents emails/events from continuing after a product claim conflict, but a future transaction/outbox refactor would be stronger.

## Media SSRF and Resource Caps

Implemented:

- Trusted host suffix: `.public.blob.vercel-storage.com`
- Trusted pathname prefix: `media/`
- HTTPS only
- Localhost/private IPv4 host rejection
- MIME allowlist: AVIF, JPEG, PNG, WebP
- Extension must match MIME type
- Max image bytes: 12 MB
- Max pixels: 24,000,000
- Fetch timeout: 5 seconds
- Fetched response content type, content length, raw byte length, and Sharp metadata are validated before compression.

Tests cover:

- Non-Blob URL rejected
- Localhost/internal URL rejected
- Oversized declared file rejected
- Wrong declared content type rejected
- Slow fetch timeout rejected safely
- Compression still applies for large valid files

## Admin CSV Import Caps

Implemented caps:

- Max CSV file bytes: 1 MB
- Max rows: 1,000
- Max columns: 80
- Max field length: 2,000 characters
- Per-admin cache owner check
- Cache deletion after execute
- Malformed quoted CSV rows rejected
- No full CSV contents logged by the new paths

Tests cover:

- Oversized file rejected
- Too many rows rejected
- Too many columns rejected
- Malformed CSV rejected
- Cross-admin `fileId` reuse rejected

## CSP Report-Only

Added `Content-Security-Policy-Report-Only` in `next.config.ts` and `POST /api/csp-report`.

The report-only policy allows only the currently required sources, including:

- `self`
- Razorpay checkout/API script, frame, image, and connect endpoints
- GA/GTM analytics endpoints already used by the app
- Vercel Blob images
- Existing image/CDN sources used by the storefront
- Photon/OpenStreetMap connect sources for geo search

`/api/csp-report` returns `204` with `no-store` and does not read or log the report body. Report-only mode is intentional because the app still has inline JSON-LD/theme/receipt patterns that need nonce/hash hardening before enforcement.

## Dedicated Token Secrets

Production now requires:

- `RESERVATION_TOKEN_SECRET`
- `ORDER_ACCESS_TOKEN_SECRET`
- `EMAIL_VERIFICATION_TOKEN_SECRET`
- `PREVIEW_TOKEN_SECRET`
- `AUTH_OTP_SECRET`
- `AUTH_OTP_TOKEN_SECRET`

Production no longer falls back to `NEXTAUTH_SECRET`, `AUTH_SECRET`, `PAYLOAD_SECRET`, or `ADMIN_API_SECRET` for these token classes. Development fallback remains to avoid breaking local workflows, but production fails loudly.

## Docs and Debug Policy

Implemented:

- `/api/v2/openapi.json` and `/api/v2/docs` are registered only outside production, or in production when `FTT_ENABLE_API_DOCS=true`.
- `/api/debug/db-ping` returns 404 in production unless `FTT_ENABLE_DEBUG_ENDPOINTS=true`.
- If production debug is enabled, access requires either admin session or bearer token matching `FTT_DEBUG_TOKEN`.

## Dependency Audit Cleanup

Direct upgrades performed:

- `hono`: `^4.12.25` to `^4.12.27`
- `resend`: `^6.12.4` to `^6.16.0`
- `nodemailer`: `^7.0.13` to `^9.0.1`

`pnpm audit` after upgrades still fails with 8 vulnerabilities:

- High: `tmp <0.2.6` through `@lhci/cli`
- Moderate: `esbuild <=0.24.2` through `drizzle-kit`
- Moderate: `postcss <8.5.10` through `next`
- Moderate: `uuid <11.1.1` through `@lhci/cli`
- Moderate: `js-yaml <=4.1.1` through `@lhci/cli`
- Low: `tmp <=0.2.3` through `@lhci/cli`

Cleanup plan:

- Treat `@lhci/cli` findings as dev-tooling blockers for release gates; upgrade/replace LHCI or isolate it from production install.
- Wait for or validate a safe `drizzle-kit` upgrade/override before forcing esbuild.
- Wait for a Next.js patch or validated override for PostCSS because this is framework-pinned.
- Do not do major framework/tooling upgrades in this phase without a dedicated compatibility pass.

`pnpm outdated` no longer lists `hono`, `resend`, or `nodemailer`. It still lists unrelated patch/minor/major candidates such as Playwright, TanStack Query, Vercel Blob, framer-motion, pg, AI SDK, ESLint, TypeScript, and sharp.

## Validation

| Command | Result | Notes |
| --- | --- | --- |
| Focused Phase 4.2 Vitest set | Pass | 11 files, 97 tests passed. The payment-route tests still emit non-fatal analytics mock errors because their DB mock does not include the internal event sink insert chain. |
| `pnpm run lint` | Pass with warning | Existing Node engine warning (`node v25.4.0`, package wants `>=20.9 <25`) and existing React hook warning in `app/(site)/our-story/page.tsx`. |
| `pnpm run build` | Pass | Production build completed. Existing warnings: Node engine and `--localstorage-file` without valid path during static generation. |
| `pnpm exec tsc --noEmit --pretty false` | Pass | No TypeScript errors. |
| `pnpm run test` / `pnpm exec vitest run --reporter=json` | Fail, unrelated existing suites | 1,514 passed, 24 failed. Phase 4.2-focused suites pass. Failure list below. |
| `pnpm run agent:check` | Fail at `pnpm run test` | Did not reach Lighthouse matrix because `verify` stops on full-suite failures. |
| `pnpm audit` | Fail | 8 remaining transitive/dev-tooling or framework-pinned vulnerabilities listed above. |
| `pnpm outdated` | Fail by design | Reports available updates; direct Hono/Resend/Nodemailer cleanup completed. |

Full test failures remaining:

- `tests/unit/auth-middleware.test.ts`: 2 failures, test harness calls `authMiddleware` with a context missing `c.get`.
- `tests/unit/checkout-estimate.test.ts`: 1 failure, shipping default expectation is `500` but runtime returns `150`.
- `tests/unit/order-charge-totals-route.test.ts`: 4 failures, shipping/total expectations still expect `50000` paise shipping while runtime uses `15000`.
- `tests/unit/packing-slip-render.test.ts`: 5 failures, expected admin packing-slip files are missing at `app/(admin)/admin/orders/[id]/packing-slip/*`.
- `tests/unit/site-feedback-fixes.test.ts`: 12 storefront/content/string-snapshot failures unrelated to Phase 4.2 security changes.

## Live Smoke Tests Still Required

These were not run locally because they require real services or multi-user browser sessions:

- Two separate users attempt to reserve the same product.
- Two separate authenticated users attempt create-order for the same reserved product.
- Duplicate Razorpay callback/webhook delivery confirms idempotency against a real database.
- Razorpay test checkout still loads under CSP report-only.
- Media upload/complete through real Vercel Blob and admin UI.
- Admin CSV import through the real admin UI.
- CSP reports observed in browser/devtools without blocking checkout.
- Production env validation after dedicated secrets are added in Vercel.

## Remaining Blockers

- Full unit test suite is not green.
- `agent:check` is not green because the full test suite fails first.
- `pnpm audit` is not green due remaining transitive/dev-tooling/framework-pinned findings.
- Node `v25.4.0` is outside the package engine range `>=20.9 <25`; rerun release gates on a supported Node version.
- CSP is report-only, not enforced. Enforced CSP needs inline JSON-LD/theme/receipt nonce/hash work.
- Payment completion would benefit from a true transaction/outbox refactor for strongest inventory/payment consistency.

## Recommendation

NO-GO for pre-production staging as a release candidate until full tests, `agent:check`, supported Node, and the remaining audit findings are resolved.

GO for isolated staging QA of the Phase 4.2 controls only, after adding the dedicated production token secrets in the staging environment and using Razorpay test mode.
