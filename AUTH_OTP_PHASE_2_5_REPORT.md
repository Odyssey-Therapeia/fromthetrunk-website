# OTP Auth Phase 2.5 Verification Report

Date: 2026-06-26
Project: From the Trunk Next.js ecommerce backend

## Recommendation

NO-GO for Phase 3 UI.

Most OTP route behavior, database persistence, security events, hashing, cleanup, and rate limits worked in the backend harness. The blocker is the NextAuth provider registration: the installed NextAuth Credentials provider factory ignores the custom `id: "email-otp"` option and registers both credential providers as `credentials`. That means the Phase 2 requirement "NextAuth CredentialsProvider id email-otp" is not reliably satisfied.

Before building UI, fix the provider registration so `email-otp` is a real provider id, add or confirm explicit admin OTP policy, then rerun this Phase 2.5 verification.

## Files Inspected

- `drizzle/0019_auth_otp_phase_1.sql`
- `db/schema.ts`
- `db/queries/auth-otp.ts`
- `lib/auth/otp.ts`
- `lib/email/templates.ts`
- `lib/email/send.ts`
- `lib/email/resend.ts`
- `api/hono/schemas/auth-otp.ts`
- `api/hono/routes/auth-otp.ts`
- `api/hono/site-app.ts`
- `api/hono/app.ts`
- `lib/auth/options.ts`
- `app/(site)/checkout/page.tsx`
- `components/wishlist/wishlist-merge-on-login.tsx`
- `lib/store/cart-store.ts`
- `api/hono/routes/payments.ts`
- `lib/checkout/use-checkout-payment.ts`
- `node_modules/next-auth/providers/credentials.js`
- `.next/static`
- `.next/server/app`
- `public`

## Test Summary

| Area | Result | Evidence |
| --- | --- | --- |
| Migration applies cleanly | PASS | Applied `drizzle/0019_auth_otp_phase_1.sql` after confirming OTP tables were absent. |
| Migration idempotency | PASS | Re-applied the same migration successfully. The SQL uses `create table if not exists` and guarded index creation. |
| Required indexes | PASS | Found indexes for challenge token hash, login ticket hash, identifier/purpose/created, expires, user, and active challenges. |
| Existing email OTP start | PASS | `POST /api/v2/auth/otp/start` returned 200, generic message, challenge token, masked email, and created security events. |
| Unknown email OTP start | PASS | Returned the same generic shape/message, stored no user id, and did not create a login-capable user link. |
| Unknown email delivery | PASS | No `otp_sent` event was created for unknown sign-in email in the dev harness. |
| Phone OTP start | PASS | Existing phone returned generic response and sent to the user's registered email; unknown phone returned generic response without account enumeration. |
| Wrong OTP attempts | PASS | Attempts incremented. After max attempts, the challenge stayed locked and rejected the later correct OTP. |
| Expired OTP | PASS | Expired challenge was rejected. |
| Correct OTP verify | PASS | Verification set `verifiedAt`, returned a ticket, rejected second verify, and stored the ticket hashed only. |
| Login ticket one-time behavior | PARTIAL | HTTP callback flow consumed a valid ticket once and rejected second use, but direct provider registration evidence shows `email-otp` is not a real registered provider id. |
| Registration complete | PASS | Created user, address, generated password hash, set `metadata.authMethod = "email_otp"`, returned login ticket, and did not duplicate welcome email behavior in the harness. |
| Checkout shell upgrade | PASS | Existing shell user was upgraded in place; user id and attached test order ownership were preserved. |
| Admin protection | FAIL | No explicit safe admin OTP policy was proven. Direct provider lookup for `email-otp` failed because the provider id is not registered. If provider registration is fixed as-is, admin OTP may be allowed unless blocked. |
| Rate limits | PASS | Start, verify, and complete endpoints eventually returned blocked responses in dev in-memory limiter mode. |
| Secret/log audit | PASS | No raw OTP, challenge token, login ticket, or API secret value was found in inspected logs/source/client bundles. |
| Existing password login | PARTIAL | Existing credentials provider remains in source. The direct harness check was inconclusive because this NextAuth version stores provider callbacks under provider options and duplicates provider ids. |
| OAuth provider loading | PASS BY INSPECTION | Existing OAuth provider construction was not removed or edited by OTP Phase 2. |
| Checkout guest redirect | PASS BY INSPECTION | `/checkout` still redirects unauthenticated users to sign-in. |
| Wishlist merge after login | PASS BY INSPECTION | `WishlistMergeOnLogin` remains wired for post-login merge behavior. |
| Cart local state | PASS BY INSPECTION | Cart store remains local-storage based and was not touched. |
| Razorpay/payment routes untouched by Phase 2.5 | PASS | Inspected only. No Phase 2.5 edits were made to payment routes or checkout payment payload code. |

## Commands Run

```sh
DOTENV_CONFIG_PATH=.env.local pnpm exec tsx -r dotenv/config
```

Used for:

- migration presence check
- migration apply and re-apply
- index verification
- OTP route harness against the local Hono app
- NextAuth ticket callback/session harness
- temporary test data cleanup
- secret value scan across `.next/static`, `.next/server/app`, and `public`

```sh
pnpm exec eslint api/hono/routes/auth-otp.ts api/hono/schemas/auth-otp.ts lib/auth/options.ts
```

Result: passed.

```sh
pnpm exec tsc --noEmit --pretty false
```

Result: failed due existing unrelated TypeScript errors listed below.

## Detailed Results

### 1. Migration Check

Result: PASS.

The OTP tables were absent before applying `0019`. Applying `drizzle/0019_auth_otp_phase_1.sql` succeeded. Re-applying it also succeeded, matching the repo pattern used in this migration.

Verified indexes:

- `auth_otp_challenges_challenge_token_hash_unique`
- `auth_otp_challenges_login_ticket_hash_unique`
- `auth_otp_challenges_identifier_purpose_created_idx`
- `auth_otp_challenges_expires_at_idx`
- `auth_otp_challenges_user_idx`
- `auth_otp_challenges_active_idx`
- `auth_security_events_event_type_created_idx`
- `auth_security_events_identifier_created_idx`
- `auth_security_events_user_idx`

Note: this was verified against a dev database with OTP tables absent, not a separate brand-new Postgres database replaying every historical migration from zero.

### 2. OTP Start: Existing Email

Result: PASS.

The harness created a temporary customer user and called:

```http
POST /api/v2/auth/otp/start
```

Payload shape:

```json
{ "purpose": "sign_in", "identifier": "phase25-...@example.test" }
```

Observed:

- 200 response
- generic message
- challenge token returned
- masked email returned
- `otp_requested` and `otp_sent` style security events created
- no raw OTP printed

The test used generated `phase25-*` emails instead of `existing@example.com` so cleanup could be deterministic and avoid real customer data.

### 3. OTP Start: Unknown Email

Result: PASS.

Observed:

- same 200 response shape
- same generic message
- challenge token returned
- challenge row had `userId = null`
- no `otp_sent` event was created
- no account existence signal was exposed

The unknown challenge is not login-capable because there is no linked user. If the code were somehow verified, the returned ticket would still not authorize a session without a linked user.

### 4. OTP Start: Phone

Result: PASS.

Observed:

- existing phone returned generic response and created a sent event to the user's registered email path
- unknown phone returned generic response
- no account enumeration was exposed

### 5. Wrong OTP Attempts

Result: PASS.

Observed:

- wrong OTP returned failure
- attempts incremented
- after configured max attempts, challenge was locked
- a later correct OTP was still rejected
- no raw OTP printed

### 6. Correct OTP

Result: PASS.

Observed:

- correct OTP returned success
- `verifiedAt` was set
- a login ticket was returned
- ticket was stored hashed only
- second verify was rejected

### 7. Login Ticket Consumption Through NextAuth

Result: PARTIAL / BLOCKED.

The HTTP harness used:

```http
GET /api/auth/csrf
POST /api/auth/callback/email-otp
GET /api/auth/session
```

Observed in the HTTP harness:

- valid login ticket created a session
- session included user email, role, name, and id-like session data
- second use of the same ticket failed
- `consumedAt` was set
- `otp_login_ticket_consumed` event was created

Blocking issue:

Direct inspection of `authOptions.providers` showed both credential providers registered with id `credentials`, not `email-otp`. Direct inspection of `node_modules/next-auth/providers/credentials.js` confirms this installed provider factory hard-codes `id: "credentials"` and ignores the custom id option.

This makes the NextAuth integration unsafe to rely on for UI work until provider registration is fixed and retested.

### 8. Registration Complete

Result: PASS.

Observed:

- sign-up challenge verified successfully
- `register/complete` created a customer user
- address was created when supplied
- generated password hash was set
- metadata contained `authMethod: "email_otp"`
- login ticket was returned
- login ticket could be used in the HTTP callback harness
- no duplicate welcome email event was observed in the harness

### 9. Checkout Shell Upgrade

Result: PASS.

Observed:

- existing checkout shell user was upgraded in place
- original user id was preserved
- attached test order remained attached to that user id
- generated password hash was set
- metadata contained `authMethod: "email_otp"`
- shell source metadata was preserved

### 10. Admin Protection

Result: FAIL.

Admin OTP protection is not proven. The direct lookup for provider id `email-otp` failed because the provider is not actually registered with that id.

Recommended policy before Phase 3:

- reject email OTP login for admin users unless the product explicitly approves admin passwordless login
- keep admin password/OAuth/admin-console paths unchanged
- add a route/provider test that proves admin OTP rejection

### 11. Rate Limits

Result: PASS in dev mode.

Observed status sequences:

- start: `200, 200, 200, 200, 200, 429`
- verify: repeated failures eventually returned `429`
- complete: repeated failures eventually returned `429`

The dev harness disabled durable Redis/KV env values after process start to exercise the in-memory limiter safely. Production durable-limiter behavior was inspected in source but not live-tested.

### 12. Secret and Log Audit

Result: PASS.

Checked:

- no raw OTP logging in OTP route/helpers/options
- no raw challenge token logging
- no raw login ticket logging
- security event metadata uses challenge id, purpose, reason, attempts, and hashes where needed
- `RESEND_API_KEY` appears only in server email/newsletter modules by env-name, not as a value
- `AUTH_OTP_SECRET` and `AUTH_OTP_TOKEN_SECRET` appear only in server OTP crypto utility by env-name
- no known secret values were found in `.next/static`, `.next/server/app`, or `public`

### 13. Existing Behavior Regression

Result: PARTIAL.

Confirmed by source inspection:

- existing password credentials provider remains in `lib/auth/options.ts`
- OAuth provider setup remains present
- `/checkout` still redirects guests to sign-in
- wishlist merge component remains present
- cart state remains local-storage based
- Razorpay create-order/verify and checkout payment payload files were not edited during Phase 2.5

Not fully proven:

- password sign-in through real NextAuth callback should be retested after fixing duplicate credential provider ids

## Existing Unrelated TypeScript Errors

`pnpm exec tsc --noEmit --pretty false` currently fails on unrelated project errors:

- `.next/dev/types/app/(site)/collection/page.ts`: `searchParams` type mismatch.
- `tests/unit/customer-accounts-p6-01.test.ts`: order fixtures missing `isGift`, `giftFrom`, and `giftMessage`.
- `tests/unit/order-receipt-html.test.ts`: order fixtures missing `isGift`, `giftFrom`, and `giftMessage`.
- `tests/unit/rate-limit-production.test.ts`: assignment to read-only `NODE_ENV`.

These were not changed as part of Phase 2.5 because the task scope was OTP backend verification only.

## Temporary Data Cleanup

Temporary test rows used generated `phase25-*` identifiers.

Cleanup was run for:

- temporary users
- temporary addresses
- temporary orders
- temporary OTP challenges
- temporary auth security events

Final cleanup verification returned zero matching `phase25-*` users, challenges, or security events.

## Risks Found

1. Blocking: `email-otp` is not a real registered NextAuth provider id with the installed Credentials provider factory.
2. Blocking: admin OTP policy is not explicitly proven safe. If provider registration is fixed without an admin guard, admin users may be able to use OTP login.
3. Medium: password login was not fully proven through the actual callback path because duplicate credential provider ids make direct provider tests unreliable.
4. Low: unknown sign-in identifiers can create non-deliverable, unlinked challenges. This does not create a session path, but should remain monitored for storage/rate-limit abuse.
5. Low: production durable rate limiting was source-inspected and env presence was checked, but not live-tested against production infrastructure.

## Required Fixes Before Phase 3 UI

1. Replace or wrap the second credentials provider so `authOptions.providers` contains an actual provider id `email-otp`.
2. Add explicit admin rejection in the OTP login provider unless admin OTP is intentionally approved.
3. Re-run Phase 2.5 checks for:
   - valid OTP ticket session creation
   - one-time ticket consumption
   - admin OTP rejection
   - existing password login callback
   - OAuth provider loading
4. Keep UI work blocked until the rerun report is GO.

