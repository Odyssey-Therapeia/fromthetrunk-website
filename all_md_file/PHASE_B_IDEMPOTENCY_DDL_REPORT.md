# Phase B Idempotency DDL Report

## Target Safety

The target was classified as local/staging safe before DDL:

- Razorpay server key: test
- Razorpay public key: test
- public/server URLs: localhost
- unsafe live override: missing/false
- `DATABASE_URL`: present but not printed

Production was not touched.

## SQL Applied

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;
```

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;
```

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

## Why Additive

- Existing order rows keep `NULL` values.
- The unique index applies only to non-null idempotency keys.
- No table, column, enum, or legacy data was dropped.
- `placed_at` was not changed.
- `db:push` was not run.

## Before / After Proof

Before:

- `idempotency_key`: missing
- `cart_fingerprint`: missing
- `orders_idempotency_key_unique`: missing

After:

- `orders.idempotency_key`: text, nullable
- `orders.cart_fingerprint`: text, nullable
- `orders_idempotency_key_unique`: partial unique index where `idempotency_key IS NOT NULL`

## Rollback SQL For Documentation Only

Not executed:

```sql
DROP INDEX IF EXISTS orders_idempotency_key_unique;
ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE orders DROP COLUMN IF EXISTS cart_fingerprint;
```

## Secret Safety

No `DATABASE_URL`, Razorpay key, token, payment link, auth secret, OTP secret, customer email, phone, or address was printed.
