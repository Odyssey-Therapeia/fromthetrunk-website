# Phase A.1 Idempotency Sanity Report

Date: 2026-07-03

## Method

API-level Hono route sanity with synthetic staging DB data and mocked authenticated users.

No real payment, no live key, and no customer notification.

## Same Attempt Retry

Result:

```json
{
  "firstStatus": 200,
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
}
```

Classification: PASS.

The same user/cart/attempt retry reused the existing order and payment link.

## Same Attempt From Different User

Result:

```json
{
  "status": 409,
  "code": "PRODUCT_RESERVED",
  "reused": false
}
```

Classification: PASS.

The second user could not reuse another user's order/link.

## Changed Cart

Result:

```json
{
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
```

Classification: PASS.

Changed cart/new attempt created a new order.

## Rapid Double-Click

Concurrent same-user/same-product/same-attempt result:

```json
{
  "statuses": [200, 409],
  "codes": ["PRODUCT_RESERVED"],
  "successfulPaymentLinks": 1,
  "rowsForProduct": [
    {
      "hasItem": true,
      "hasPaymentLink": true,
      "paymentStatus": "pending"
    },
    {
      "hasItem": true,
      "hasPaymentLink": false,
      "paymentStatus": "failed"
    }
  ],
  "activeHoldCount": 1
}
```

Classification: PARTIAL.

Pass:

- only one pending order/payment link
- only one active hold
- second request was rejected

Residual risk:

- the losing concurrent request still created a failed order row before the atomic stock claim rejected it.
- if the strict requirement is "no extra order row at all," server-side idempotency still needs a stronger DB-backed unique claim before order creation.

