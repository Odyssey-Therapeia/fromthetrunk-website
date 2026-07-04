# Phase E Production DDL Launch Checklist

## Status

Production DDL was not applied in Phase E.

## Required DDL From Prior Checkout Idempotency Phase

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

## Rollback SQL

```sql
DROP INDEX IF EXISTS "orders_idempotency_key_unique";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "cart_fingerprint";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "idempotency_key";
```

## Preflight Checklist

- Take a Neon snapshot immediately before production DDL.
- Confirm no incompatible `orders.idempotency_key`, `orders.cart_fingerprint`, or `orders_idempotency_key_unique` objects already exist.
- Apply through a reviewed Drizzle migration when possible.
- If manual SQL is used, reconcile the Drizzle migration journal afterward.
- Deploy code that depends on idempotency only after the production schema supports it.
- Do not run synthetic payment mutation tests against production.

## Post-DDL Read-Only Checks

- Verify `orders.idempotency_key` exists.
- Verify `orders.cart_fingerprint` exists.
- Verify `orders_idempotency_key_unique` exists.
- Verify the unique index is partial on non-null idempotency keys.

## Launch Classification

NO-GO for production checkout launch until this DDL is applied and verified in production.

