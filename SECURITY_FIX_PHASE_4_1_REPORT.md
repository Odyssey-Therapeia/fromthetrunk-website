# Security Fix Phase 4.1 Report

Date: 2026-06-27  
Scope: Phase 4.1 release-blocking fixes from `SECURITY.md`. No live OTP emails were sent and no production payment endpoints were hit.

## Summary

Phase 4.1 fixed the release-blocking auth/payment/data-leak controls that were safe to address without redesigning UI or changing Razorpay signature verification:

- OTP challenge expiry is now backend-owned at 5 minutes, with a hard 10 minute maximum helper.
- OTP login tickets now have their own short DB expiry and are consumed atomically only while unexpired.
- User-facing API responses no longer return `passwordHash` or internal `metadata`.
- `/api/v2/payments/create-order` now requires an authenticated session and binds order ownership to `authUser.id`.
- Central log redaction was added for raw errors, SQL params, PII, auth headers, tokens, OTP/ticket fields, and request bodies.
- Password credentials auth, wishlist, addresses, profile, and password mutation paths now have app-level durable rate-limit protection.
- Wishlist merge and order item schemas now have caps and duplicate/product validation.
- The readonly `NODE_ENV` release-gate test issue was fixed.

## Changed Files

Phase 4.1 files changed or added:

- `lib/auth/otp.ts`
- `db/schema.ts`
- `drizzle/0020_auth_otp_ticket_expiry.sql`
- `db/queries/auth-otp.ts`
- `api/hono/routes/auth-otp.ts`
- `components/account/otp-auth-panel.tsx`
- `lib/users/serialize.ts`
- `api/hono/routes/users.ts`
- `api/hono/routes/payments.ts`
- `api/hono/schemas/orders.ts`
- `lib/validation/order.ts`
- `lib/log.ts`
- `lib/http/on-uncaught-error.ts`
- `api/hono/routes/products.ts`
- `api/hono/routes/wishlist.ts`
- `db/queries/wishlist.ts`
- `api/hono/routes/addresses.ts`
- `lib/auth/options.ts`
- `tests/unit/auth-otp-expiry.test.ts`
- `tests/unit/auth-otp-route-expiry.test.ts`
- `tests/unit/auth-options-security.test.ts`
- `tests/unit/logger.test.ts`
- `tests/unit/p6-07-error-tracker.test.ts`
- `tests/unit/payments-route.test.ts`
- `tests/unit/payments-route-discount.test.ts`
- `tests/unit/payments-cap.test.ts`
- `tests/unit/user-password-route.test.ts`
- `tests/unit/user-signup-shell-claim.test.ts`
- `tests/unit/admin-user-management-routes.test.ts`
- `tests/unit/validation-schemas.test.ts`
- `tests/unit/rate-limit-production.test.ts`

The working tree also contains many unrelated dirty files from earlier OTP, commerce auth, analytics, and storefront phases. Those are not treated as Phase 4.1 changes in this report.

## SECURITY.md Findings Fixed

| SECURITY.md finding | Status | Fix |
| --- | --- | --- |
| Critical: full user rows including `passwordHash` returned by API routes | Fixed | Added `serializeUserForClient()` and applied it to `/users/me`, profile update, signup, checkout-shell upgrade, admin create, and admin user list responses. Tests now assert `passwordHash` and `metadata` are omitted. |
| High: `/api/v2/payments/create-order` unauthenticated and owner from shipping email | Fixed | Create-order now calls `requireAuth(c)`, rate-limits by session user, checks pending order caps by session user, creates orders with `userId: authUser.id`, and keeps shipping email as contact/shipping data only. |
| High: raw logging/error tracker can leak PII and SQL params | Fixed for inspected paths | Added recursive central redaction in `lib/log.ts`, redacted error tracker forwarding, routed uncaught Hono errors through the logger, and removed full product update body logging. |
| Medium/High: legacy password provider lacks rate limiting | Fixed | Password credentials `authorize()` now applies a durable-required rate limit keyed by hashed IP and normalized email, and fails closed in production if durable limiting is unavailable. |
| Medium: wishlist/address/profile mutation abuse gaps | Fixed for listed routes | Added per-user durable rate limits for wishlist add/delete/merge, address create/update/delete, profile patch, customer password change, and admin password reset. Wishlist merge is capped and deduped. |
| Medium: order item schema allows quantities up to 50 and unbounded item arrays | Fixed | Order item quantity is capped at 1, order item arrays are capped at 20, and duplicate product IDs are rejected in API and shared validation schemas. |
| Release-gate cleanup: readonly `NODE_ENV` test failure | Fixed | Updated the rate-limit production test cleanup to avoid assigning readonly `process.env.NODE_ENV`. |

Not fixed in Phase 4.1: dependency audit findings, media SSRF hardening, admin import caps, CSP, theme token hardening, dedicated token secrets, and public docs/debug route policy. Those remain Phase 4.2+ work.

## OTP Expiry Values

Implemented in `lib/auth/otp.ts`:

| Value | Minutes |
| --- | ---: |
| `OTP_EXPIRES_IN_MINUTES` | 5 |
| `OTP_MAX_EXPIRES_IN_MINUTES` | 10 |
| `OTP_LOGIN_TICKET_EXPIRES_IN_MINUTES` | 3 |
| `OTP_REGISTRATION_TICKET_EXPIRES_IN_MINUTES` | 5 |

Proof no OTP challenge exceeds 10 minutes:

- `createOtpChallenge()` no longer accepts caller-controlled `expiresAt`; it computes expiry server-side with `getOtpChallengeExpiresAt(now)`.
- `getOtpMaxChallengeExpiresAt(now)` exists as the hard max guard.
- `tests/unit/auth-otp-expiry.test.ts` passes a forged long `expiresAt` through a cast and asserts the inserted expiry is still 5 minutes and less than or equal to 10 minutes.
- `/api/v2/auth/otp/start` uses the backend-generated challenge expiry in the response and email template.

Ticket expiry proof:

- `auth_otp_challenges.login_ticket_expires_at` was added in `drizzle/0020_auth_otp_ticket_expiry.sql`.
- `setOtpLoginTicket()` stores a ticket expiry of 3 minutes for login and 5 minutes for registration.
- `consumeOtpLoginTicket()` atomically requires `login_ticket_expires_at IS NOT NULL`, `login_ticket_expires_at > now`, `verified_at IS NOT NULL`, `consumed_at IS NULL`, and `expires_at > now`.
- Expired OTP verification returns `OTP_EXPIRED` with the calm message: `This code has expired. Please request a new one.`

## Validation

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec eslint <Phase 4.1 touched files>` | Pass | No output. |
| Focused Phase 4.1 Vitest set | Pass | 16 files, 136 tests passed. Covered OTP expiry/tickets, auth options rate limit, payment auth ownership, passwordHash serialization, logging redaction, order schema caps, wishlist/address related regressions, and `NODE_ENV` cleanup. |
| `pnpm run lint` | Pass with warning | Existing Node engine warning (`node v25.4.0`, package wants `>=20.9 <25`) and existing React hook warning in `app/(site)/our-story/page.tsx`. |
| `pnpm run build` | Pass | Build and TypeScript inside build completed. Existing warnings: Node engine and `--localstorage-file` without valid path. |
| `pnpm exec tsc --noEmit --pretty false` | Pass | No TypeScript errors. |
| `pnpm run test` | Fail, unrelated existing suites | 1494 tests passed, 24 failed. Failing suites are listed below. |
| `pnpm run agent:check` | Fail at `pnpm run test` | Did not reach Lighthouse matrix because `verify` stops on the same test failures. |

Full test failures observed:

- `tests/unit/auth-middleware.test.ts`: 2 auth middleware expectation failures.
- `tests/unit/checkout-estimate.test.ts`: real config default expectation mismatch.
- `tests/unit/order-charge-totals-route.test.ts`: 4 existing charge/shipping total expectation mismatches. This Phase 4.1 patch intentionally did not change pricing/shipping logic.
- `tests/unit/packing-slip-render.test.ts`: 5 RSC/print-control expectation failures.
- `tests/unit/site-feedback-fixes.test.ts`: 12 storefront/content/layout expectation failures.
- `tests/unit/bulk-edit-collection-tag-routes.test.ts`, `tests/unit/bulk-edit-routes.test.ts`, `tests/unit/csv-export.test.ts`, `tests/unit/product-api-public-visibility.test.ts`, `tests/unit/product-stock-route.test.ts`: import/setup failures because `DATABASE_URL` is required to initialize the Drizzle client.

## Security Checks

- No raw OTP, challenge token, login ticket, registration token, API secret, authorization header, cookie, SQL params block, obvious email, or phone value is intentionally logged by the new code paths.
- Security events still avoid storing raw OTPs/tickets/tokens.
- `/api/v2/payments/create-order` no longer trusts client shipping email for order ownership.
- Razorpay signature verification and payment verification logic were not weakened.
- Checkout/cart/product pricing logic was not changed beyond requiring authenticated ownership at create-order.

## Remaining Risks

- Full release gates are not green because the repository has unrelated failing tests and Node `v25.4.0` is outside the declared engine range.
- Dependency audit high/moderate findings from `SECURITY.md` remain open.
- Admin media completion SSRF/resource caps remain open.
- Admin CSV import caps remain open.
- CSP is still missing.
- Theme token hardening remains open.
- Dedicated production secrets for non-OTP token classes remain open.

## Recommendation

GO for Phase 4.2 security hardening.

NO-GO for production release until the unrelated full-suite failures, dependency audit findings, and remaining `SECURITY.md` medium/high hardening items are resolved on the supported Node line.
