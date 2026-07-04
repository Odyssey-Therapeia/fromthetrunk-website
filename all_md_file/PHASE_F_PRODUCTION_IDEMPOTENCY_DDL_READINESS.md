# Phase F Production Idempotency DDL Readiness

Status: NO-GO until production DDL is applied and verified, or an owner-approved deployment plan is accepted.

## Reviewed Migration Artifact

Created:
- `drizzle/0026_orders_idempotency_key.sql`

Contents:

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

This file was not run against production.

## Schema Evidence

`db/schema.ts` already includes:
- `orders.idempotencyKey: text("idempotency_key")`
- `orders.cartFingerprint: text("cart_fingerprint")`
- partial unique index `orders_idempotency_key_unique` on `idempotency_key` where non-null

`api/hono/routes/payments.ts` contains conflict handling for the `orders_idempotency_key_unique` constraint.

## Drizzle Journal

Drizzle journal is not reconciled:
- `drizzle/meta/_journal.json` stops at migration tag `0009_tags`.
- SQL files exist through `drizzle/0026_orders_idempotency_key.sql`.

Do not represent the Drizzle journal as production-ready until the team reconciles the migration history with the actual migration runner strategy. The Phase F SQL file is a reviewed artifact, not proof that `pnpm db:migrate` will apply it in order in the current journal state.

## Safest Deployment Order

1. Take production database snapshot/backup.
2. Apply additive DDL.
3. Verify columns and index:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('idempotency_key', 'cart_fingerprint');

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders'
  AND indexname = 'orders_idempotency_key_unique';
```

4. Deploy app code.
5. Run read-only validation against checkout creation paths with test-safe payment setup only.

## Rollback SQL

Use only after confirming app code no longer writes these columns:

```sql
DROP INDEX IF EXISTS "orders_idempotency_key_unique";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "cart_fingerprint";

ALTER TABLE "orders"
DROP COLUMN IF EXISTS "idempotency_key";
```

## Deployment Ordering Risk

If app deploys before DDL:
- checkout insert/write paths that include `idempotency_key` or `cart_fingerprint` can fail because production `orders` lacks those columns.
- strict one-of-one idempotency may degrade from DB-enforced uniqueness to application handling only.

If DDL applies before app deploy:
- safe and backward compatible.
- columns are nullable.
- partial unique index only constrains rows that set `idempotency_key`.
- existing rows and old callers are unaffected.

## Launch Classification

DB/DDL readiness: NO-GO until production applies and verifies the DDL, or owner explicitly approves launch sequencing with this DDL still pending.
