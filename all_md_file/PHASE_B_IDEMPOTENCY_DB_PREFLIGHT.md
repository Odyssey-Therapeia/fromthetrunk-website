# Phase B Idempotency DB Preflight

## Scope

Read-only schema inspection was run before applying Phase B DDL. `DATABASE_URL` was not printed.

## Read-Only SQL

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'orders'
ORDER BY indexname;
```

## Before DDL

Phase B preflight found:

- `orders.idempotency_key`: missing
- `orders.cart_fingerprint`: missing
- `orders_idempotency_key_unique`: missing
- existing order index count: 18
- existing order column count: 53

## After DDL Verification

Current verified additive fields:

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| `cart_fingerprint` | text | YES | null |
| `idempotency_key` | text | YES | null |

Current verified index:

- `orders_idempotency_key_unique`: partial unique index, non-null idempotency keys only.

## Conclusion

The local/staging DB now has the required Phase B idempotency columns and partial unique index. No secret values were printed.
