# Payment Completion Transaction/Outbox Design

Status: design only for Phase 4.3. Current code already has an atomic paid-order winner guard and focused idempotency tests, but a full transaction/outbox migration should be rolled out separately.

## Goal

Make payment completion one durable transaction for:

- order paid transition
- product sold claim
- reservation release
- discount usage increment
- idempotency record for Razorpay payment or webhook event
- outbox rows for email, analytics, and follow-up events after commit

## Proposed Schema

`payment_idempotency_keys`

- `id uuid primary key defaultRandom()`
- `provider text not null`
- `eventKey text not null`
- `orderId uuid not null references orders.id`
- `paymentId text not null`
- `source text not null`
- `status text not null` with app values `processing`, `completed`, `failed`
- `metadata jsonb`
- `createdAt timestamptz not null default now()`
- `updatedAt timestamptz not null default now()`
- unique index on `(provider, eventKey)`

`outbox_events`

- `id uuid primary key defaultRandom()`
- `type text not null`
- `aggregateType text not null`
- `aggregateId uuid not null`
- `idempotencyKey text not null`
- `payload jsonb not null`
- `status text not null default 'pending'`
- `attempts integer not null default 0`
- `lastError text`
- `availableAt timestamptz not null default now()`
- `processedAt timestamptz`
- `createdAt timestamptz not null default now()`
- `updatedAt timestamptz not null default now()`
- unique index on `idempotencyKey`
- index on `(status, availableAt)`

## Transaction Flow

1. Verify Razorpay signature before the transaction.
2. Start transaction.
3. Insert idempotency key with `processing`.
   - If unique conflict and existing status is `completed`, return already-paid success.
   - If conflict and `processing`, return safe retry/review response.
4. Load order `FOR UPDATE`.
5. If order is already paid with the same payment id, mark idempotency completed and return already-paid.
6. Update order to paid/confirmed only if current payment status is not paid.
7. Claim products as sold with conditional update:
   - `where id in (...) and stock_status <> 'sold'`
   - if row count mismatches, add order event and fail transaction with `PRODUCT_SOLD`
8. Release reservation rows for the order.
9. Increment discount usage using the existing conditional cap guard.
10. Insert outbox events:
    - customer order confirmation email
    - internal purchase notification email
    - `payment_completed` analytics event
    - order status event
11. Mark idempotency key `completed`.
12. Commit.
13. A worker or route-tail dispatcher processes pending outbox rows after commit.

## Rollout Plan

1. Add migration for the two tables.
2. Add query helpers with transaction support.
3. Create `completePaidOrderTx()` alongside the current `completePaidOrder()`.
4. Backfill tests from current `complete-paid-order` coverage:
   - duplicate callback exactly one outbox email set
   - duplicate webhook replay returns already-paid
   - sold product conflict rolls back order paid transition
   - discount usage increments once
5. Gate behind `PAYMENT_OUTBOX_ENABLED=false` in staging.
6. Run Razorpay test-mode success, failure, callback, webhook, and duplicate replay.
7. Enable on staging, then production after observing no stuck `processing` rows.

## Reason Not Implemented In Phase 4.3

This touches order state, inventory state, email side effects, analytics fan-out, and Razorpay callback/webhook behavior. The current release-gate cleanup added/verified idempotency and concurrency tests without changing the payment side-effect architecture. The outbox migration should be its own deployable phase with rollback and observability.
