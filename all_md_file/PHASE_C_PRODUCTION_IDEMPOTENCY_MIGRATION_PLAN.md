# Phase C Production Idempotency Migration Plan

This plan documents production readiness only. It was not applied to production.

## Required Production DDL

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

## Why This Is Additive

- Existing rows get nullable columns, so historical orders are not rewritten into an invalid state.
- The unique index is partial and only applies to non-null idempotency keys.
- Existing orders without checkout attempt keys are unaffected.

## Rollback SQL

```sql
DROP INDEX IF EXISTS "orders_idempotency_key_unique";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "cart_fingerprint";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "idempotency_key";
```

## Recommended Application Path

- Prefer a reviewed Drizzle migration file for production, then apply through the normal reviewed migration path.
- If launch timing requires manual SQL, take a Neon snapshot first, apply the exact DDL above, then generate/reconcile the Drizzle journal afterward so schema history does not drift.
- Drizzle journal should not be treated as reliable until the migration file is generated, reviewed, and matched against production state.

## Production Preflight

- Confirm maintenance window or low-traffic window.
- Confirm Neon snapshot/backup exists immediately before DDL.
- Confirm current production schema does not already have incompatible columns/indexes.
- Confirm app code deployed with strict idempotency reads/writes only after DDL exists.
- Confirm Razorpay live keys are only on the production custom domain.

## Post-Migration Validation

- Verify `orders.idempotency_key` exists.
- Verify `orders.cart_fingerprint` exists.
- Verify `orders_idempotency_key_unique` exists and is partial on non-null keys.
- Run a production-safe read-only checkout preflight.
- Do not run synthetic payment-link mutation tests against production.
