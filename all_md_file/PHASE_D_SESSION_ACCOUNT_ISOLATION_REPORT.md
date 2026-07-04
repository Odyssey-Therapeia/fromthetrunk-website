# Phase D Session Account Isolation Report

Date: 2026-07-03

## Browser Smoke

Added `tests/e2e/auth-session-isolation.spec.ts`.

Method:

- Created two independent browser contexts.
- Minted synthetic NextAuth JWT cookies from local auth secret without printing the secret.
- Mocked `/api/auth/session`.
- Mocked account orders, addresses, wishlist IDs, and wishlist product lookups.
- Navigated each context through account orders, addresses, and wishlist pages.

Result:

- User A order text was visible only to User A.
- User B order text was visible only to User B.
- User A address text was visible only to User A.
- User B address text was visible only to User B.
- User A wishlist product was visible only to User A.
- User B wishlist product was visible only to User B.

Command:

`npx -y -p node@22 -p pnpm@10.28.0 pnpm exec playwright test --project=chromium tests/e2e/auth*.spec.ts`

Result: pass, 1 test.

## Server-Side Isolation Surfaces

Reviewed:

- `proxy.ts` protects account profile, addresses, orders, and wishlist paths using NextAuth `getToken`.
- `api/hono/middleware/auth.ts` derives `authUser` from the signed JWT.
- Orders and address tests already assert session-scoped query arguments/predicates.
- Wishlist route requires auth for account-backed mutations.
- `buildClientCallbackUrl` prevents external-origin callback redirects by normalizing to the active origin.

## Cookie Properties

The smoke used a synthetic local cookie with `httpOnly` and `sameSite=Lax`. Secure cookie behavior is framework/runtime controlled and should be verified in the deployed HTTPS environment.

## Logout

`AccountShell` calls `signOut` with a normalized same-origin callback URL. Full logout cookie clearing was not live-tested against a real NextAuth server response in Phase D because the browser smoke mocked account APIs and avoided real auth/email flows.

## Result

Session/account isolation is GO for Phase D mocked-browser validation. Production HTTPS cookie attributes remain a deployment verification item.
