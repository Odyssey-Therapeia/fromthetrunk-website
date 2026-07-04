# Checkout And Order Isolation Audit

Status: Conditional GO, pending staging tests and DB verification.

## Evidence Reviewed

- Orders routes: `api/hono/routes/orders.ts:21-217`
- Order queries/scoping: `db/queries/orders.ts:84-233`
- Payments create/repay/verify/status: `api/hono/routes/payments.ts:301-1164`
- Checkout idempotency: `lib/payments/checkout-idempotency.ts:1-148`
- Checkout attempt fingerprint: `lib/checkout/checkout-attempt.ts:53-84`
- Checkout client submit lock: `components/checkout/checkout-page-client.tsx:345-491`
- Address ownership: `api/hono/routes/addresses.ts:38-287`
- Wishlist ownership: `api/hono/routes/wishlist.ts:58-280`
- Confirmation and receipt: `app/(site)/checkout/confirmation/page.tsx`, `app/(site)/checkout/confirmation/receipt/route.ts`
- Viewable order and access token: `lib/orders/viewable-order.ts:6-28`, `lib/orders/order-access-token.ts:12-46`

## Pass Findings

- Order list/detail routes require auth. Customers are scoped to their own `userId` or guest orders with matching verified email where `userId IS NULL`.
- Address and wishlist routes use authenticated user IDs, not client-supplied ownership.
- Direct order creation route is disabled; checkout must use the payments flow.
- Checkout create-order requires auth, recomputes subtotal, discount, shipping, GST, and total server-side from product rows and validated rules.
- Payment retry route is owner/admin/guest-email gated and never trusts client amount.
- Payment status endpoint allows owner/admin, guest email, or HMAC order access token.
- Receipt route uses `getViewableOrder(orderId, key)` and is paid-only, private/no-store, and noindex.
- Order access token is HMAC-signed with expiry and verified via timing-safe comparison.
- Checkout idempotency reuse checks stored userId, cart fingerprint, order owner, pending payment status, payment-link presence, and expiry before returning a link.
- Webhooks locate orders by trusted Razorpay identifiers and complete through `completePaidOrder`, not by a browser-supplied owner.

## Questions Answered

1. User A should not see user B's order through normal orders routes because queries are scoped by user/admin/guest-email claim.
2. User A should not pay user B's order because repay and verify paths enforce owner/admin/guest-email or strict user ownership.
3. User A should not download user B's receipt without session ownership or the valid HMAC order access token.
4. Guest order token is not guessable under HMAC assumptions, but it is a bearer token and valid until expiry.
5. Payment status enforces owner/admin/guest-email or token access.
6. Confirmation page uses backend status and a poller; it does not trust client payment state.
7. Cart totals are recomputed server-side at create-order.
8. Shipping/payment totals are server-side.
9. Client cannot change product price or shipping maliciously without server recomputation rejecting or ignoring it.
10. Two checkout tabs use a submit lock client-side and server idempotency key/cart fingerprint server-side, but staging tests are still needed.
11. Payment retry should reuse only the correct order after ownership/status checks.
12. Same idempotency key from another user should not return another user's payment link because stored userId/cart/order owner are checked.

## Risky Or Conditional Areas

- Order access tokens are bearer tokens. If leaked, they allow view/status/receipt access within expiry for the specific order.
- Confirmation/receipt guest access depends on token/key, not just email. That is safer but must be reflected in support operations.
- Order insertion before inventory claim can create failed order rows in race paths. This is not order mixing, but reporting/cleanup must be clear.
- Admin order routes exist in `api/hono/app.ts:187-189`, but not in the mounted `site-app` catch-all (`app/api/v2/[...route]/route.ts:1-12`, `api/hono/site-app.ts:1-178`). If admin UI expects them through `/api/v2/admin/orders`, this is a deployment surface gap.

## Tests Found

- `tests/unit/payments-route.test.ts`
- `tests/unit/checkout-idempotency.test.ts`
- `tests/unit/order-access-token.test.ts`
- `tests/unit/order-charge-totals-route.test.ts`
- `tests/unit/customer-accounts-p6-01*.test.ts`
- `tests/unit/wishlist-p6-04*.test.ts`
- `tests/unit/webhooks-route.test.ts`
- `tests/unit/app-api-surface.test.ts`

## Tests Needed

- Playwright multi-user test: user A and user B checkout attempts with different sessions.
- Integration test: same idempotency key across different users cannot reuse link.
- Receipt access test: wrong user, missing token, wrong token, expired token.
- Admin route deployment test: expected admin routes are mounted where the UI calls them.

## Verdict

Checkout/order isolation is code-level strong and owner-safe. Launch should remain conditional until actual deployed API surface and staging multi-user tests are verified.
