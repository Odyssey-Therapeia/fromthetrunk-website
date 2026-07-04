# Phase A Schema Diff Report

Date: 2026-07-03

Compared actual `.env.local` DB schema against current `db/schema.ts` and checkout insert expectations.

## Summary

Core checkout insert compatibility is present:

- `orders` has the current paise-based columns used by checkout.
- `order_items` exists with `selected_options`.
- the legacy `orders.subtotal numeric` column is no longer an insert blocker because it is nullable and defaults to `0`.
- the legacy `orders_items` table still exists and is classified as Payload-era compatibility data.

Full schema parity is not present:

- actual `orders` and `products` enum columns still use legacy Payload enum types.
- `orders.placed_at` is nullable and has no default, while `db/schema.ts` expects non-null/defaulted behavior.
- several actual status/tax/product fields are looser than `db/schema.ts` nullability/default expectations.

## Required Checkout Columns

| Area | Requirement | Actual | Status |
| --- | --- | --- | --- |
| `orders.id` | present | uuid, not null, default `gen_random_uuid()` | PASS |
| `orders.user_id` | present | uuid, nullable | PASS |
| `orders.subtotal_paise` | present | integer, not null | PASS |
| `orders.shipping_cost_paise` | present | integer, not null, default `0` | PASS |
| `orders.tax_rate` | present | numeric, nullable | PASS with drift |
| `orders.tax_amount_paise` | present | integer, not null, default `0` | PASS |
| `orders.total_paise` | present | integer, not null, default `0` | PASS |
| `orders.shipping_method` | present | legacy enum, nullable | PASS with drift |
| `orders.status` | present | legacy enum, nullable, default `pending` | PASS with drift |
| `orders.payment_status` | present | legacy enum, nullable, default `pending` | PASS with drift |
| `orders.payment_gateway` | present | varchar, nullable | PASS |
| `orders.payment_method` | present | varchar, nullable | PASS |
| `orders.payment_id` | present | varchar, nullable, unique index exists | PASS |
| `orders.razorpay_order_id` | present | varchar, nullable, unique index exists | PASS |
| `orders.paid_at` | present | timestamptz, nullable | PASS |
| shipping fields | present | current `shipping_*` text fields exist | PASS |
| `orders.placed_at` | present | timestamptz, nullable, no default | PASS with drift |
| reminder/refund/gift/tracking/internal note fields | present | expected columns exist | PASS |
| `orders.created_at` / `updated_at` | present | timestamptz, not null, default `now()` | PASS |
| legacy `orders.subtotal` | must not block inserts | nullable, default `0` | PASS |
| `order_items` | must exist | current table exists | PASS |
| `order_items.selected_options` | must exist | jsonb, not null, default `{}` | PASS |
| `orders_items` | classify legacy if present | exists with Payload-era shape | PASS |
| `products.stock_status` | must exist | legacy enum, nullable, default `available` | PASS with drift |
| `products.reserved_until` | must exist | timestamptz nullable | PASS |
| `products.sold_at` | must exist | timestamptz nullable | PASS |
| `products.quantity_available` | must exist | integer, not null, default `1` | PASS |
| `reservations` | required if inventory v2 active | table exists | PASS |
| `events.event_id` | unique | `events_event_id_unique` exists | PASS |
| `auth_otp_challenges` | OTP replay/concurrency guards | attempts, send count, verified/consumed/login ticket fields exist | PASS |
| `discounts` | checkout validation support | table and validation fields exist | PASS |

## Drift Details

### Enum family drift

`db/schema.ts` uses current enum type names such as:

```text
product_status
stock_status
order_status
payment_status
```

The actual DB still uses legacy Payload enum types on key columns:

```text
orders.status -> enum_orders_status
orders.payment_status -> enum_orders_payment_status
products.status -> enum_products_status
products.stock_status -> enum_products_stock_status
```

The labels match, so normal string writes can work, but this remains schema drift.

### `orders.placed_at` drift

Actual:

```text
placed_at timestamp with time zone nullable, no default
```

Current app schema expectation:

```text
placedAt not null default now()
```

The route-shaped insert test that omitted `placed_at` succeeded, but the returned value was `null`. This is not an insert blocker today, but it can cause runtime, type, analytics, or UI assumptions to fail.

### Loose nullability/default drift

Actual DB is looser than app schema for some fields:

```text
orders.status nullable
orders.payment_status nullable
orders.tax_rate nullable
products.name nullable
products.slug nullable
products.status nullable
products.stock_status nullable
products.story_title nullable
```

This does not block the specific checkout insert tested, but it is not full schema parity.

## Blocking Findings

1. Full local browser/API payment-link checkout sanity was not run because `.env.local` has a live `NEXT_PUBLIC_RAZORPAY_KEY_ID`, while the server key is test. This violates the Phase A requirement to confirm no live Razorpay key is used on localhost/staging.
2. The Razorpay payment-link path enables customer notifications in `lib/payments/razorpay.ts`, so calling it during this audit could send test emails/SMS. The brief forbids live payments and requires safe testing only.
3. Full schema parity remains NO-GO because of legacy enum type drift and `orders.placed_at` null/default drift.

## Non-Blocking Findings

1. `orders` insert compatibility is present for the current paise-based checkout shape.
2. `order_items` insert compatibility is present.
3. `orders.subtotal numeric NOT NULL` is not a current blocker.
4. Legacy `orders_items` is preserved and should not be dropped without separate approval.

