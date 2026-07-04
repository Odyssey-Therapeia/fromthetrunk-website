# Phase A.1 Create-Order HTTP Sanity Report

Date: 2026-07-03

## Method

Browser login was not used because that would add OTP/session setup and is not required for this payment-environment safety phase.

Instead, the Hono payment route was exercised directly with:

- mocked authenticated users
- synthetic staging DB users/products
- real local `.env.local` classification after the test-key fix
- Razorpay test keys only
- customer notifications disabled by `shouldNotifyRazorpayCustomer()`
- cleanup after the smoke

No request bodies, customer emails, payment links, env values, DB URL, or secrets were printed.

## Env Safety During Smoke

```text
RAZORPAY_KEY_ID: test
NEXT_PUBLIC_RAZORPAY_KEY_ID: test
NEXT_PUBLIC_SERVER_URL: localhost
NEXTAUTH_URL: localhost
ALLOW_UNSAFE_LIVE_PAYMENTS: false
```

## Result

```json
{
  "createOrder": {
    "firstStatus": 200,
    "firstHasPaymentLink": true,
    "retryStatus": 200,
    "retryReused": true,
    "retrySameOrder": true,
    "rowsForProduct": [
      {
        "hasItem": true,
        "hasPaymentLink": true,
        "paymentStatus": "pending"
      }
    ],
    "activeHoldCount": 1
  },
  "crossUserSameAttempt": {
    "status": 409,
    "code": "PRODUCT_RESERVED",
    "reused": false
  },
  "changedCart": {
    "status": 200,
    "newOrderCreated": true,
    "rowsForProduct": [
      {
        "hasItem": true,
        "hasPaymentLink": true,
        "paymentStatus": "pending"
      }
    ],
    "activeHoldCount": 1
  }
}
```

## Cleanup

Synthetic data cleanup verification:

```json
{
  "products": 0,
  "users": 0,
  "orders": 0,
  "attempt_events": 0
}
```

## Classification

Create-order HTTP sanity: PASS.

Limits:

- direct Hono route, not browser UI
- mocked authenticated users
- synthetic DB data
- Razorpay test-mode payment links only

