# Payment Pending-Hold Cleanup Plan (APPROVAL REQUIRED for cron/deploy config)

Status: **PLAN ONLY.** No cron, `vercel.json`, or deployment config was created.

## Current state (audited)

- **Stock-hold cleanup exists but is likely not running from this repo.**
  - Handler: `GET /api/v2/cron/release-reservations` (`api/hono/routes/cron.ts:24-116`) —
    flips expired `stock_status='reserved'` products back to `available`, clears `reserved_until`,
    emits `reservation_expired`, and `DELETE`s expired `reservations` rows. Protected by
    `CRON_SECRET` (`verifyBearerSecret`).
  - **Gap 1:** `registerCronRoutes` is mounted only in `api/hono/app.ts:167`, **not** in
    `api/hono/site-app.ts` (the app served by `app/api/v2/[...route]/route.ts`). So on the
    website deployment `/api/v2/cron/*` is not routed.
  - **Gap 2:** there is **no `vercel.json`** in the repo → no cron schedule is committed.
- **Pending-order cleanup does not exist.** No code transitions a stale `pending` order to
  `failed`/`expired`/cancelled on a timer. Orphaned pending orders (from aborts/retries) remain
  `pending` indefinitely and count against the 3-per-30-min cap.

## Proposed (owner-approved only)

### 1. Mount the cron routes on the served app
In `api/hono/site-app.ts`, register the cron routes (as `api/hono/app.ts` already does) so
`/api/v2/cron/release-reservations` is reachable on the website deployment. Small code change,
but it enables scheduled cleanup — treat as part of cron enablement (approval-gated).

### 2. Add the Vercel cron schedule
Create `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/v2/cron/release-reservations", "schedule": "*/10 * * * *" }
  ]
}
```
Vercel Cron sends the request; protect with `CRON_SECRET` (already enforced by the handler).
Confirm the schedule also matches the prod-cutover runbook (`docs/internal/prod-cutover-runbook.md:120-135`).

### 3. Add stale-pending-order expiry (new, small, additive)
Extend the release-reservations cron (or add a sibling) to also mark stale pending orders:
```
UPDATE orders SET payment_status = 'failed', status = 'pending', updated_at = now()
WHERE payment_status = 'pending'
  AND created_at < now() - interval '30 minutes'   -- past the payment-link hold window
  AND paid_at IS NULL;                             -- never touch paid/completed orders
```
- **Never** alter `paid`/`refunded`/`confirmed` orders (guarded by `payment_status='pending' AND paid_at IS NULL`).
- Emit a single summary log line: counts only, **no PII** (no email/name/address).
- Optional: use a dedicated status value if the team prefers `expired` over `failed` (schema enum
  change → separate migration approval).

### 4. Protection & observability
- Keep `CRON_SECRET` bearer auth (missing → 500, wrong → 401), as today.
- Log `{ releasedProducts, expiredReservations, expiredPendingOrders }` — numbers only.

## Notes
- Steps 1–2 are **deployment/cron enablement** → require approval per task constraints.
- Step 3's `UPDATE ... SET payment_status='failed'` uses the existing enum (no schema change);
  switching to a new `expired` enum value would need a migration (separate approval).
- Until this is enabled, the **client double-submit lock + server idempotency reuse** shipped in
  this change set already prevent the *creation* of duplicate pending holds for the common
  abort/retry/double-click cases; cleanup addresses the *residual* orphaned holds from true aborts.
