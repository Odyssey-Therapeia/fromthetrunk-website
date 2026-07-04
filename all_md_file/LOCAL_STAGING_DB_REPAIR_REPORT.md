# LOCAL_STAGING_DB_REPAIR_REPORT

_Task: make the existing `.env.local` database (owner-designated **staging/test**) compatible with `db/schema.ts` so `POST /api/v2/payments/create-order` stops 500-ing — **without** creating a new branch/DB, **without** changing app code, **without** dropping legacy tables/columns._

## Secret safety ✅
- **`DATABASE_URL` was never printed.** It was read at runtime inside a Node script directly from `.env.local` (regex-extracted, used only to open the Neon connection). No connection string, password, or Razorpay secret appears anywhere in this run or report.
- `.env.local` confirmed **git-ignored** (`.env*.local`) and **not tracked**.
- **⚠️ Owner action (unchanged):** the URL was previously exposed in a screenshot/paste — **rotate the Neon password** and update `.env.local` + Vercel envs.

## DB connection ✅
- `DATABASE_URL` loaded from `.env.local` (confirmed present; value not shown).
- `psql`/`pg_dump` are **not installed** on this host → used the repo's `@neondatabase/serverless` driver. A **schema snapshot of `orders`/`order_items`/`orders_items` was captured before any DDL** (`/tmp/ftt-orders-before.json`) as the backup, since the repair is fully additive/reversible (no `pg_dump` needed).

## Part 1 — Drift found (the DB was *more* migrated than the report assumed)
| Item | Before | Needed by `schema.ts` / app insert | Action |
|---|---|---|---|
| `orders.paid_at` | **MISSING** | present (`timestamptz`) | **ADD** ✅ |
| `orders.subtotal` (legacy numeric) | **NOT NULL**, no default | not written by app | **DROP NOT NULL + DEFAULT 0** ✅ |
| `order_items` table | exists, **missing `selected_options`** | needs `selected_options jsonb` (mig 0024) | **ALTER ADD** ✅ (the `CREATE TABLE IF NOT EXISTS` in the proposed SQL would have been a **no-op** since the table already exists) |
| `subtotal_paise` | present, NOT NULL | present | already OK |
| `shipping_name` … `shipping_email` (text) | **already present** | present | no-op |
| `is_gift`, `gift_from`, `gift_message` | **already present** | present | no-op |
| `reminder_sent_at`, `discount_id/code`, `refund_*`, `tracking_*`, `internal_note` | **already present** | present | no-op |
| idempotency unique indexes | not present | schema + mig 0025 | **CREATE (additive)** ✅ |
| `idempotency_key`, `cart_fingerprint` | absent | **NOT in `schema.ts`** — app handles idempotency in `lib/payments/checkout-idempotency.ts` + unique indexes | **SKIPPED** (adding them would reverse-drift from the source of truth) |
| Legacy `orders_items` (`_order`,`_parent_id`,`price`…) | present | — | **LEFT (not dropped)** |
| Legacy enums `enum_orders_status`, `enum_orders_payment_status`; `shipping_method` as enum; legacy `shipping_address_*`, `subtotal/shipping_cost/tax_*/total` numerics | present | — | **LEFT (not dropped)** |

Tables present: `events, order_events, order_items, orders_items, reservations`. Enums present: `order_status, enum_orders_status, payment_status, enum_orders_payment_status`.

## Part 2 — SQL applied (additive, idempotent, no drops)
```sql
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='orders' AND column_name='subtotal') THEN
    EXECUTE 'ALTER TABLE "orders" ALTER COLUMN "subtotal" DROP NOT NULL';
    EXECUTE 'ALTER TABLE "orders" ALTER COLUMN "subtotal" SET DEFAULT 0';
  END IF;
END $$;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "selected_options" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_payment_id_unique"
  ON "orders" ("payment_id") WHERE "payment_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_razorpay_order_id_unique"
  ON "orders" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL;
```
All 5 statements returned **OK**. The other `ADD COLUMN IF NOT EXISTS` lines from the proposed patch were intentionally **not re-run** — those columns already exist (verified no-ops). `idempotency_key`/`cart_fingerprint` were **skipped** (not in schema).

## Part 3 — Recheck ✅
- `orders.paid_at` → exists, nullable
- `orders.subtotal` → **nullable, default 0** (neutralized)
- `orders.subtotal_paise` → NOT NULL (unchanged)
- `order_items.selected_options` → `jsonb`, NOT NULL
- `orders_payment_id_unique`, `orders_razorpay_order_id_unique` → present

## Part 4 — Checkout insert test ✅ (schema-level, safe)
Ran a transaction-wrapped insert **mirroring the app's `createOrder`** (`orders` row incl. `paid_at`, `subtotal_paise`, `shipping_name`; then an `order_items` row incl. `selected_options`), then forced a **ROLLBACK**:
- **PASSED** — both inserts succeeded against the repaired schema.
- **0 rows persisted** (verified). No test data left in the DB.

This proves the exact DB operation that was 500-ing now works. The **full browser flow (login → add to cart → Pay → double-click idempotency, Part 4 steps 1–10)** should be run by you locally with **Razorpay test keys** (`rzp_test_*`, `ALLOW_UNSAFE_LIVE_PAYMENTS` empty) — the schema blocker is removed and the idempotency unique indexes are in place. I could not drive the authenticated UI/session from CLI.

## Part 5 — Verification (no app code changed by this task)
| Command | Result |
|---|---|
| `pnpm run test` | ✅ **1703/1703** passed (137 files) |
| `pnpm run lint` | ✅ exit 0 |
| `pnpm run build` (node 22) | ✅ exit 0 |
| `pnpm audit` | ✅ no known vulnerabilities |
| `git diff --check` | ✅ clean |
| `pnpm exec tsc --noEmit` | ⚠️ **2 errors in `tests/unit/checkout-idempotency.test.ts`** — **pre-existing in committed code, NOT caused by this DB repair** (0 code files changed). Type-only (`mock.calls[0][0] as {...}` under vitest 4 typings); does **not** affect `vitest run` (transpile-only) or `next build` (test files are outside the app build graph). Recommend fixing the test's type assertion separately. |

## Remaining drift (non-blocking; left intentionally per "do not drop")
The DB is now a **superset** of `schema.ts` — the app's insert works because every column/table it uses exists. Legacy Payload-era artifacts remain but are unused by the app:
- Legacy `orders_items` table (kept). Legacy numeric `subtotal` (neutralized), `shipping_cost`, `tax_rate`, `tax_amount`, `total`, and `shipping_address_*` columns (all nullable, unwritten).
- Legacy enum types `enum_orders_status` / `enum_orders_payment_status` still back the `status`/`payment_status` columns; `shipping_method` is a **USER-DEFINED enum** in the DB while `schema.ts` types it as `text`.
- **⚠️ Watch during the UI test:** if create-order writes a value to `shipping_method`, the legacy enum column could reject a non-enum string. My insert test left it `NULL` (nullable) and passed. If the real flow sets it and errors, tell me and I'll neutralize that column too (staging-only, additive).
- Full alignment (dropping legacy tables/columns/enums) is **not required** for checkout and was **not performed** (rules: no drops without explicit confirmation). A fresh Neon branch + `drizzle-kit push` remains the clean long-term path.

## Vercel staging & production
- **Vercel staging can use this same DB** now — checkout create-order is unblocked. Keep `rzp_test_*` keys and `ALLOW_UNSAFE_LIVE_PAYMENTS` empty (the `payment-host-guard` blocks live keys on `*.vercel.app`).
- **Production untouched:** this task operated **only** on the `.env.local`-designated staging DB via additive DDL. No other database was accessed, **no app code changed**, **no deploy, no push, no migrations run via drizzle-kit**, no product data modified.
