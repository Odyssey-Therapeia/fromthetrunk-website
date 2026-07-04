# Phase G Production DDL Owner Gate

Date: 2026-07-03
Decision: NO-GO until owner approval and production DB verification.

## Required Artifact

Artifact found:

- `drizzle/0026_orders_idempotency_key.sql`

The file contains the required additive statements:

```sql
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "cart_fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique"
ON "orders" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
```

Source-level schema and code references also include the idempotency fields and unique partial index:

- `db/schema.ts`
- `db/queries/orders.ts`
- `api/hono/routes/payments.ts`

## Journal / Migration State

- Drizzle SQL files exist through `0026_orders_idempotency_key.sql`.
- `drizzle/meta/_journal.json` still stops at `0009_tags`.
- Because the journal is not reconciled with the later SQL files, Phase G must not run broad `db:push`, `db:migrate`, or unrelated migration commands against production.

## Owner Gate Status

| Gate | Status |
| --- | --- |
| Owner explicitly approved production DDL during Phase G | NO |
| Production database identity confirmed | NO |
| DDL applied | NO |
| Post-DDL verification SQL run | NO |
| Rollback needed | NO, because no DDL was applied. |

## Allowed DDL If Owner Approves Later

Only the three additive statements above are approved by the Phase G brief. Do not run broad schema sync commands while the migration journal remains unreconciled.

After application, verify with read-only catalog queries:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('idempotency_key', 'cart_fingerprint')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders'
AND indexname = 'orders_idempotency_key_unique';
```

## Verification Report Status

`PHASE_G_PRODUCTION_DDL_VERIFICATION_REPORT.md` was intentionally not created because production DDL was not owner-approved, applied, or verified in Phase G.
