# Payment Idempotency — DB Migration Proposal (APPROVAL REQUIRED)

Status: **PROPOSAL ONLY — not applied.** No migration file was created. Do not run
`drizzle-kit generate`/`push`/`migrate` without owner approval.

## Why

The interim idempotency shipped in this change set reuses the existing `events`
table (`checkout_attempt:<id>`) and fully handles the reported case — a
**sequential** abort→retry reuses the first order instead of duplicating it. It is
recorded *after* successful creation, so it is safe by construction.

Its one gap is the **concurrent** race: two simultaneous requests for the same
attempt id can both pass the "no existing attempt" read before either records one,
so both create an order (the atomic `stock_status` UPDATE still blocks a second
live hold on a one-of-one item → the loser's order is set `failed`, and the pending
cap bounds accumulation). To close the race **atomically** we want a unique
constraint that fails the second insert before any side effects.

## Proposed change (owner-approved only)

Add an idempotency key to `orders` and enforce uniqueness:

```ts
// db/schema.ts — orders table additions
idempotencyKey: text("idempotency_key"),          // = client checkoutAttemptId
cartFingerprint: text("cart_fingerprint"),        // audit/reconciliation

// index (partial unique — nulls allowed for non-idempotent callers)
ordersIdempotencyKeyUnique: uniqueIndex("orders_idempotency_key_unique")
  .on(table.idempotencyKey)
  .where(sql`idempotency_key IS NOT NULL`),
```

Generated migration (illustrative — **do not apply without approval**):

```sql
ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;
ALTER TABLE "orders" ADD COLUMN "cart_fingerprint" text;
CREATE UNIQUE INDEX "orders_idempotency_key_unique"
  ON "orders" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
```

## Server logic once approved

Replace the interim events-based reuse with a claim-first insert:

1. `INSERT INTO orders (... , idempotency_key, cart_fingerprint) VALUES (...)
   ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`.
2. If a row is returned → this request owns the attempt; proceed to reserve stock +
   create the Razorpay link (unchanged).
3. If **no** row is returned (conflict) → another request already owns this attempt.
   Load that order by `idempotency_key`; if it is still `pending` with a live link,
   return its payment data; if its link isn't ready yet, return `409 CHECKOUT_IN_PROGRESS`
   (client retries after a short delay).

This makes create-order idempotent **before** any stock hold or Razorpay call, fully
eliminating duplicate pending orders under concurrency — the strongest form of the
Part 4 requirement.

## Migration safety

- Both columns are **nullable** and additive → backward compatible; existing rows/callers unaffected.
- Partial unique index only constrains rows that set the key → no impact on legacy/admin order creation.
- No data backfill required. Reversible (`DROP INDEX` / `DROP COLUMN`).
- Apply via the repo's normal flow (`pnpm db:generate` then reviewed `pnpm db:migrate`) — **after approval only.**

## Rollback

`DROP INDEX orders_idempotency_key_unique;` then `ALTER TABLE orders DROP COLUMN idempotency_key, DROP COLUMN cart_fingerprint;`.
The interim `events`-based reuse continues to function without these columns.
