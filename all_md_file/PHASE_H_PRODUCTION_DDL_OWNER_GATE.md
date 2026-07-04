# Phase H Production DDL Owner Gate

Date: 2026-07-03
Result: NO-GO

## Boundary

No production DDL was applied. No database connection string was printed. No production DDL verification report was created.

## DDL File Present

The additive migration file exists at:

- `drizzle/0026_orders_idempotency_key.sql`

The file adds:

- `orders.idempotency_key`
- `orders.cart_fingerprint`
- unique partial index `orders_idempotency_key_unique` on non-null `idempotency_key`

Source evidence:

- `drizzle/0026_orders_idempotency_key.sql:1-9`
- `db/schema.ts:388-389`
- `db/schema.ts:478`
- `api/hono/routes/payments.ts:56`

## Required Owner Approval Sequence

1. Confirm target Neon production project, branch, database, and role.
2. Confirm a fresh production snapshot/backup.
3. Confirm the site is in a safe maintenance/cutover window.
4. Apply only `drizzle/0026_orders_idempotency_key.sql`.
5. Verify columns and partial unique index exist.
6. Deploy the matching checkout/payment code only after DDL verification.
7. Monitor order creation, duplicate idempotency attempts, payment link creation, and webhook completion.

## Emergency Rollback Notes

Rollback must be owner-approved and should not be run casually. A rollback would need to consider whether any rows already rely on the new columns.

Potential rollback shape:

```sql
DROP INDEX CONCURRENTLY IF EXISTS "orders_idempotency_key_unique";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cart_fingerprint";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "idempotency_key";
```

Do not run this without owner approval and a verified backup.

## Launch Decision

Production DDL is NO-GO. The code-level idempotency path can pass local tests, but production checkout must not cut over until the additive DDL is applied and verified.

