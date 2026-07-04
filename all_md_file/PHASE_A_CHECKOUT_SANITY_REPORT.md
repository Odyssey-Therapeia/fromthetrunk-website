# Phase A Checkout Sanity Report

Date: 2026-07-03

Scope: checkout sanity against the existing `.env.local` staging DB, without live payments, emails, production migration, or secret output.

## Environment Gate

Sanitized `.env.local` classification:

```text
DATABASE_URL: present
RAZORPAY_KEY_ID: present test key
NEXT_PUBLIC_RAZORPAY_KEY_ID: present live key
RAZORPAY_KEY_SECRET: present
RAZORPAY_WEBHOOK_SECRET: present
NEXTAUTH_SECRET: present
NEXTAUTH_URL: present non-local URL
FTT_FEATURE_INVENTORY_V2: missing
NEXT_PUBLIC_FTT_FEATURE_GST_INCLUSIVE: missing
NEXT_PUBLIC_SERVER_URL: present
APP_URL: missing
```

Full local browser/API checkout was not executed because:

- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is a live key in `.env.local`.
- `api/hono/routes/payments.ts` returns `razorpayKeyId` from `NEXT_PUBLIC_RAZORPAY_KEY_ID` first, then `RAZORPAY_KEY_ID`.
- `lib/payments/razorpay.ts` payment-link creation enables customer email notification and SMS when a contact exists.
- The Phase A brief forbids live Razorpay payments and requires no real email/payment effects.

Result: full `POST /api/v2/payments/create-order` payment-link sanity is BLOCKED until the public key is test-only and the test path is notification-safe or mocked.

## DB Insert Sanity

Rollback-only transaction was run with synthetic test records. No test data persisted.

Observed result:

```json
{
  "orderInsert": "pass",
  "orderItemsInsert": "pass",
  "firstClaimRows": 1,
  "secondClaimRows": 0,
  "activeHoldCount": 1,
  "loserOrderStatus": "failed",
  "rollback": "complete",
  "persistedAfterRollback": {
    "products": 0,
    "orders": 0,
    "users": 0
  }
}
```

A second create-order-shaped rollback insert omitted `placed_at` to match the current route shape:

```json
{
  "createOrderShapeInsert": "pass",
  "placedAtReturned": "null",
  "rollback": "complete"
}
```

Interpretation:

- `orders` insert no longer fails for the tested checkout shape.
- `order_items` insert works.
- `placed_at` being returned as `null` confirms schema drift, not an immediate insert blocker.
- no nested Postgres error code, constraint, table, column, or message was produced by the tested DB insert path.

## Phase A Checkout Assertions

| Assertion | Result | Evidence |
| --- | --- | --- |
| login with test user | NOT RUN | blocked before browser/payment path because public key is live and payment-link notifications are enabled |
| add one available test product to cart | NOT RUN | same blocker |
| checkout and click Pay once | NOT RUN | same blocker |
| `POST /api/v2/payments/create-order` returns 200/payment link | BLOCKED | cannot safely call notification/payment-link path with current env |
| exactly one order row created | PARTIAL | rollback DB insert proved order insertion works, but HTTP create-order was not run |
| exactly one `order_items` row created | PARTIAL | rollback DB insert proved item insertion works, but HTTP create-order was not run |
| product reserved state correct | PARTIAL | rollback one-of-one DB predicate proof passed |
| no duplicate order on rapid double click | NOT RUN | requires HTTP/idempotency path test |
| retry with same `checkoutAttemptId` reuses same order/link | NOT RUN | requires HTTP/idempotency path test |
| changing cart creates a new attempt | NOT RUN | requires HTTP/idempotency path test |
| no live Razorpay key on localhost/staging | FAIL | live `NEXT_PUBLIC_RAZORPAY_KEY_ID` is present |

## Checkout Result

DB-level checkout insert sanity: PASS.

Full checkout/payment-link sanity: NO-GO until staging/local Razorpay public key is test-only and the test path cannot send real notifications.

