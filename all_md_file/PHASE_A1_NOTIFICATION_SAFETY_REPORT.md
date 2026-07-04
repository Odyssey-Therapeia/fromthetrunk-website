# Phase A.1 Notification Safety Report

Date: 2026-07-03

## Audited Files

```text
lib/payments/razorpay.ts
api/hono/routes/payments.ts
lib/payments/payment-host-guard.ts
```

## Finding

Before Phase A.1, `createRazorpayPaymentLink()` always sent:

```text
notify.email: true
notify.sms: true when customer contact exists
reminder_enable: true
```

That was unsafe for local/staging sanity because even test-mode payment-link creation could attempt customer notifications.

## Change Applied

Added `shouldNotifyRazorpayCustomer()` in `lib/payments/razorpay.ts`.

It returns `true` only when all are true:

- Razorpay mode is live
- callback URL is HTTPS
- callback host is exactly `www.fromthetrunk.shop`
- callback host is not an unsafe live host

It returns `false` for:

- localhost
- `*.vercel.app`
- test keys
- invalid callback URLs

`createRazorpayPaymentLink()` now uses that helper for:

```text
notify.email
notify.sms
reminder_enable
```

## Host Guard Tightening

`isLiveRazorpayMode()` now treats either key surface as live:

```text
RAZORPAY_KEY_ID
NEXT_PUBLIC_RAZORPAY_KEY_ID
```

This closes the Phase A blocker where server key was test but public key was live.

## Verification

Focused tests passed:

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec vitest run \
  tests/unit/payment-host-guard.test.ts \
  tests/unit/razorpay-notification-safety.test.ts \
  tests/unit/payments-route.test.ts \
  tests/unit/checkout-idempotency.test.ts

4 files passed, 38 tests passed
```

API-level smoke confirmed:

```text
notificationWouldSendOnLocalhost: false
```

No real customer email/SMS was sent by the app code path.

