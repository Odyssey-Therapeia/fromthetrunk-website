# OTP Auth Phase 2.6 Verification Report

Date: 2026-06-27
Project: From the Trunk Next.js ecommerce backend

## Recommendation

GO for Phase 3 UI, limited to OTP UI work.

The Phase 2.5 blocker is fixed: `authOptions.providers` now contains exactly one `credentials` provider and exactly one real `email-otp` provider. Admin OTP login is explicitly rejected for non-customer roles, and a valid customer OTP login ticket signs in through `/api/auth/callback/email-otp` once only.

## Changed Files

- `lib/auth/options.ts`
- `AUTH_OTP_PHASE_2_6_REPORT.md`

No UI, checkout, cart, Razorpay, payment route, wishlist, product, address, or order logic was edited for Phase 2.6.

## Files Inspected

- `lib/auth/options.ts`
- `db/queries/auth-otp.ts`
- `api/hono/routes/auth-otp.ts`
- `api/hono/schemas/auth-otp.ts`
- `lib/auth/otp.ts`
- `lib/email/send.ts`
- `lib/email/resend.ts`
- `lib/email/templates.ts`
- `db/schema.ts`
- `drizzle/0019_auth_otp_phase_1.sql`
- `app/(site)/checkout/page.tsx`
- `components/wishlist/wishlist-merge-on-login.tsx`
- `lib/store/cart-store.ts`
- `api/hono/routes/payments.ts`
- `lib/checkout/use-checkout-payment.ts`
- `node_modules/next-auth/core/lib/providers.js`
- `node_modules/next-auth/providers/credentials.js`
- `.next/static`
- `.next/server/app`
- `public`

## Test Summary

| Area | Result | Evidence |
| --- | --- | --- |
| Real `email-otp` provider exists | PASS | `authOptions.providers.map(p => p.id)` returned `["credentials", "email-otp"]`. |
| Provider ids unique | PASS | Unique provider id count matched provider count. |
| Password provider preserved | PASS | Existing password credentials provider remains `credentials`; callback login succeeded with a temporary password user. |
| OTP provider registration | PASS | OTP provider is now a manual credentials provider object with `id: "email-otp"`, not the installed factory that hard-codes `credentials`. |
| Valid OTP ticket login | PASS | `/api/auth/callback/email-otp` returned 200 and `/api/auth/session` returned a customer user. |
| Reused OTP ticket | PASS | Second use of the same login ticket returned 401 and no session user. |
| Ticket consumed atomically | PASS | `consumedAt` was set after successful customer OTP login. |
| Admin OTP rejection | PASS | Temporary admin OTP login returned 401, no session user, consumed the ticket, and created one `otp_admin_rejected` event. |
| Admin/staff style role policy | PASS | OTP authorize path is customer-only by allowlist: any role other than `customer` returns null. |
| OTP start existing email | PASS | Route harness returned 200, generic response, challenge token, and one sent event. |
| OTP start unknown email | PASS | Route harness returned same generic shape and stored no linked user id. |
| OTP start phone | PASS | Route harness returned 200 generic response with challenge token. |
| Wrong OTP attempts | PASS | Wrong attempts incremented; after max attempts, the later correct OTP was rejected. |
| Correct OTP verify | PASS | Correct OTP returned a ticket; a second verify attempt returned 400. |
| Migration/index check | PASS | OTP indexes still exist for challenge token hash, login ticket hash, identifier/purpose/created, expires, user, and active challenges. |
| OAuth loading unchanged | PASS BY INSPECTION | Existing Google, Azure AD, and Twitter provider conditionals were not changed. |
| Wishlist merge unchanged | PASS BY INSPECTION | `WishlistMergeOnLogin` remains wired. |
| Cart unchanged | PASS BY INSPECTION | Cart store still uses local storage key `ftt-cart-v2`; no cart files were edited. |
| Razorpay/payment logic untouched | PASS BY INSPECTION | Payment route and checkout payment hook were inspected only; no Phase 2.6 edits were made there. |
| Checkout guest redirect unchanged | PASS BY SOURCE INSPECTION | `app/(site)/checkout/page.tsx` still redirects guests to `/account/sign-in?callbackUrl=%2Fcheckout`. Local dev HTTP returned 200 with sign-in content, so this remains a source-level regression check rather than a payment/checkout edit. |
| Secret/log audit | PASS | No raw OTP, challenge token, login ticket, or API secret value was found in inspected logs/source/client bundle scan. |
| Temporary data cleanup | PASS | Final check found zero `phase26-*` users, OTP challenges, or security events. |

## Provider Assertion

Result:

```json
{
  "ids": ["credentials", "email-otp"],
  "unique": true,
  "credentialsCount": 1,
  "emailOtpCount": 1
}
```

## Callback Harness Results

The harness used temporary `phase26-*` users and manually-created verified OTP tickets. It did not print raw OTPs, challenge tokens, login tickets, or secrets.

Observed:

```json
{
  "validOtpLogin": {
    "callbackStatus": 200,
    "sessionStatus": 200,
    "hasUser": true,
    "role": "customer",
    "emailMatches": true
  },
  "reusedOtpLogin": {
    "callbackStatus": 401,
    "sessionStatus": 200,
    "hasUser": false
  },
  "consumedAtSet": true,
  "adminOtpLogin": {
    "callbackStatus": 401,
    "sessionStatus": 200,
    "hasUser": false
  },
  "adminChallengeConsumedAtSet": true,
  "adminRejectedEventCount": 1,
  "passwordLogin": {
    "callbackStatus": 200,
    "sessionStatus": 200,
    "hasUser": true,
    "role": "customer",
    "emailMatches": true
  }
}
```

## Route Harness Results

The route harness used an isolated Hono app, disabled real email delivery in-process, and used temporary `phase26-route-*` data.

Observed:

```json
{
  "existingStart": {
    "status": 200,
    "ok": true,
    "hasChallengeToken": true,
    "sentEventCount": 1
  },
  "unknownStart": {
    "status": 200,
    "ok": true,
    "hasChallengeToken": true,
    "storedUserId": null
  },
  "phoneStart": {
    "status": 200,
    "ok": true,
    "hasChallengeToken": true
  },
  "wrongOtp": {
    "wrong1": 400,
    "wrong2": 400,
    "correctAfterLock": 400,
    "attempts": 2,
    "locked": true
  },
  "validVerify": {
    "status": 200,
    "ok": true,
    "mode": "sign_in",
    "hasTicket": true,
    "secondStatus": 400
  }
}
```

## Commands Run

```sh
DOTENV_CONFIG_PATH=.env.local pnpm exec tsx -r dotenv/config
```

Used for:

- provider id assertion
- local NextAuth callback/session harness
- OTP route harness
- OTP index verification
- temporary data cleanup verification
- secret value scan across `.next/static`, `.next/server/app`, and `public`

```sh
pnpm exec eslint lib/auth/options.ts db/queries/auth-otp.ts api/hono/routes/auth-otp.ts api/hono/schemas/auth-otp.ts
```

Result: passed.

```sh
pnpm exec tsc --noEmit --pretty false
```

Result: failed on existing unrelated project errors listed below.

## Existing Unrelated TypeScript Errors

`pnpm exec tsc --noEmit --pretty false` still fails on unrelated files:

- `tests/unit/customer-accounts-p6-01.test.ts`: order fixtures missing `isGift`, `giftFrom`, and `giftMessage`.
- `tests/unit/order-receipt-html.test.ts`: order fixtures missing `isGift`, `giftFrom`, and `giftMessage`.
- `tests/unit/rate-limit-production.test.ts`: assignment to read-only `NODE_ENV`.

No TypeScript error was reported for `lib/auth/options.ts`, `db/queries/auth-otp.ts`, `api/hono/routes/auth-otp.ts`, or `api/hono/schemas/auth-otp.ts`.

## Secret and Log Audit

Checked:

- OTP auth options and queries
- OTP Hono route and schemas
- OTP crypto utilities
- email send/template modules
- built/static output roots: `.next/static`, `.next/server/app`, `public`

Findings:

- no raw OTP logging was found
- no raw challenge token logging was found
- no raw login ticket logging was found
- security event metadata stores reason/provider/challenge id/role, not raw tokens
- no API secret values were found in scanned bundle/static roots

## Temporary Data Cleanup

Temporary test rows used generated `phase26-*` identifiers.

Final cleanup verification:

```json
{
  "users": 0,
  "challenges": 0,
  "events": 0
}
```

## Remaining Notes

1. Phase 3 UI can proceed against the backend OTP contract.
2. Keep admin OTP blocked unless product explicitly approves a separate admin passwordless policy.
3. Fix the unrelated TypeScript test fixture errors before using full `tsc` as a clean release gate.
4. The checkout guest gate source is unchanged and still calls `redirect()`. The local HTTP response returned 200 with sign-in content, so any future checkout-specific verification should inspect the rendered state as well as the status code.

