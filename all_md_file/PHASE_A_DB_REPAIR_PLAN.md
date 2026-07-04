# Phase A DB Repair Plan

Date: 2026-07-03

No persistent DB repair was applied in this phase.

Reason: the brief only permits applying additive repair if the owner explicitly approved repairing the existing `.env.local` staging DB. This request selected the DB for staging/testing, but did not explicitly approve persistent DDL or data updates. The core checkout insert blockers were also not present: `orders`, `order_items`, and required checkout columns already exist.

## Repair Mode Decision

Current mode: read-only schema preflight plus rollback-only DML sanity.

- `db:push`: not run
- production migration: not run
- destructive change: not run
- table/column drop: not run
- persistent test data: not created

## SQL Applied

None.

## Safe SQL Needed Immediately

None required for the specific `orders` and `order_items` insert compatibility tested in Phase A.

## Candidate Follow-Up Repairs

These are not applied. They require explicit owner approval before execution.

| Candidate | SQL class | Reason | Approval |
| --- | --- | --- | --- |
| Set `orders.placed_at` default to `now()` | non-destructive compatibility | aligns omitted create-order inserts with app schema expectation | required |
| Backfill null `orders.placed_at` from `created_at` | data update, non-destructive compatibility | allows future not-null enforcement | required |
| Set `orders.placed_at` not null after backfill | compatibility constraint | aligns with app schema, but can fail if nulls remain | required |
| Add `idempotency_key` / `cart_fingerprint` columns if final checkout implementation requires them | additive safe | supports durable retry/double-click reuse | required |
| Add missing indexes with `CREATE INDEX IF NOT EXISTS` if later checks find gaps | additive safe | performance and uniqueness support | required |
| Convert legacy enum-typed columns to current enum type names | risky compatibility migration | type conversion can lock tables and needs careful rollback plan | required |

## Candidate SQL Sketches

Not executed:

```sql
ALTER TABLE orders
  ALTER COLUMN placed_at SET DEFAULT now();
```

```sql
UPDATE orders
SET placed_at = created_at
WHERE placed_at IS NULL;
```

```sql
ALTER TABLE orders
  ALTER COLUMN placed_at SET NOT NULL;
```

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS cart_fingerprint text;
```

```sql
CREATE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders (idempotency_key);
```

## Explicitly Deferred

- dropping `orders_items`
- dropping legacy numeric money columns on `orders`
- destructive `db:push`
- enum type conversion
- production migration

