# Database Schema Drift Risk Audit

Status: NO-GO until read-only DB preflight confirms schema match.

No DB introspection was run because `DATABASE_URL` was classified as `remote-unknown` and secrets/URLs must not be printed. No migrations, ALTER, CREATE, DROP, `db:push`, or `db:migrate` were run.

## Evidence Reviewed

- App schema: `db/schema.ts`
- Migrations: `drizzle/*.sql`
- Drizzle journal: `drizzle/meta/_journal.json`
- DB connection: `db/index.ts:1-147`
- Inventory v2 migration file: `drizzle/0004_inventory_v2.sql:1-55`
- Order item selected options: `drizzle/0024_order_item_selected_options.sql:1-7`
- Payment hardening: `drizzle/0025_payment_hardening.sql:1-10`

## Schema Expectations From Code

- `products`: `stock_status`, `reserved_until`, `sold_at`, `quantity_available`.
- `orders`: payment fields, `paid_at`, totals, owner/customer fields, unique non-null Razorpay/order/payment indexes.
- `order_items`: current table name, `selected_options`.
- `reservations`: reservation rows for inventory v2 compatibility.
- `events`: unique `event_id` for idempotency/webhook dedupe.
- `auth_otp_challenges`: attempt/send/expiry/verified/consumed fields.
- `discounts`: usage/limit fields for checkout.

## Drift Blockers Found In Files

- `drizzle/meta/_journal.json` only lists migrations through `0009_tags`, while later SQL files through `0025_payment_hardening.sql` exist. This makes migration state unreliable until verified.
- `drizzle/0004_inventory_v2.sql` is hand-authored and says not to run directly.
- Known risk from the audit brief remains unverified: old `orders.subtotal numeric NOT NULL`, missing `orders.paid_at`, old `orders_items` table, current app expecting `order_items`, and missing `order_items.selected_options`.
- Actual DB environment is unknown. Running `db:push` or migrations against this connection could be destructive.

## Questions Answered

1. Does DB match `db/schema.ts`? Unknown. Must verify read-only against local/staging first.
2. Is create-order blocked by schema drift? Possible if actual DB lacks expected order/payment/item/inventory columns.
3. Are migrations complete? File set is not journal-consistent; actual DB unknown.
4. Is Drizzle journal reliable? Not currently enough. Journal does not list all present migration files.
5. Is `db:push` destructive on this DB? Potentially yes, especially if DB is production or hybrid old schema.
6. Is this DB staging or production? Unknown from safe classification.
7. What SQL is needed if repairing local/staging? Must be generated only after read-only introspection.
8. What must never run on production? Blind `db:push`, unreviewed migrations, hand-authored ALTERs, DROP/rename of legacy tables, or schema repair without backup and owner approval.

## Safe Read-Only Preflight

Run only after confirming the URL is local/staging and not production:

```text
SELECT current_database(), current_schema();
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'order_items' ORDER BY ordinal_position;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'reservations' ORDER BY ordinal_position;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('orders','order_items','products','reservations','events') ORDER BY tablename,indexname;
```

## Safe Repair Plan

1. Confirm DB identity and environment with owner.
2. Take backup/snapshot before any mutation.
3. Run read-only preflight and compare to `db/schema.ts`.
4. Generate exact migration SQL for staging/local only.
5. Run tests against the repaired staging/local DB.
6. Promote to production only through reviewed migration, backup, maintenance window, and rollback plan.

## Verdict

DB/schema status: NO-GO. The code may be correct, but actual schema drift is the highest launch blocker until proven otherwise.
