# Live Smoke Test Plan

Do not run this plan without explicit approval, a release test inbox, Razorpay test-mode keys, durable rate limiter configuration, and dedicated production-like token secrets.

## Environment Preconditions

- Node satisfies `>=20.9 <25`.
- `RESEND_API_KEY` points to a test-enabled sender.
- `AUTH_OTP_SECRET` and `AUTH_OTP_TOKEN_SECRET` are dedicated non-session secrets.
- `RESERVATION_TOKEN_SECRET`, `ORDER_ACCESS_TOKEN_SECRET`, `EMAIL_VERIFICATION_TOKEN_SECRET`, and `PREVIEW_TOKEN_SECRET` are configured.
- Razorpay is in test mode only.
- Durable rate limiter env is configured.
- Test product exists with `status=published` and `stockStatus=available`.

## OTP Smoke

1. Account sign-in:
   - Visit `/account/sign-in`.
   - Request OTP for the release test inbox.
   - Verify no raw OTP, challenge token, login ticket, or API secret appears in browser console/server logs.
   - Complete OTP and confirm `/api/auth/session` has customer id/email/role.

2. Wishlist dialog:
   - Sign out.
   - Click wishlist heart on the test product.
   - Confirm auth dialog opens with no navigation.
   - Complete OTP sign-in.
   - Confirm pending product is saved to the authenticated wishlist.

3. Checkout gate:
   - Sign out.
   - Add the test product to cart.
   - Visit `/checkout`.
   - Confirm inline auth gate appears and no create-order call fires before auth.
   - Complete OTP sign-in.
   - Confirm checkout remains on `/checkout` and saved addresses refetch.

## Razorpay Test-Mode Smoke

1. Create order:
   - From authenticated checkout, click review/pay.
   - Confirm `/api/v2/payments/create-order` returns a Razorpay test payment link/order id.
   - Confirm client did not send price, tax, total, or shipping amounts.

2. Success callback:
   - Complete a test payment.
   - Confirm callback redirects to `/checkout/confirmation?payment=paid`.
   - Confirm order is `paymentStatus=paid`, `status=confirmed`, product is `stockStatus=sold`.

3. Failed payment:
   - Trigger Razorpay test failure.
   - Confirm order/payment status and reservation release behavior are safe and user-facing status is understandable.

4. Webhook signature:
   - Send a signed `payment_link.paid` webhook payload using the Razorpay test webhook secret.
   - Confirm invalid signature returns 400.
   - Confirm valid signature reaches payment completion.

5. Duplicate replay:
   - Replay the same valid webhook.
   - Confirm no duplicate email/outbound analytics side effect and order remains paid.

## Rate Limiter Smoke

1. Trigger OTP start over the configured limit.
2. Trigger OTP verify over the configured limit.
3. Trigger register complete over the configured limit.
4. Trigger wishlist merge and create-order limits.
5. Confirm responses are blocked safely and do not reveal account existence.

## CSP Smoke

1. Keep CSP report-only.
2. Exercise OTP, wishlist, checkout, Razorpay, product page JSON-LD, FAQ JSON-LD, receipt download, and map/autocomplete.
3. Review browser console and `/api/csp-report` logs.
4. Do not enforce CSP until reports are understood and nonce/hash work is complete.
