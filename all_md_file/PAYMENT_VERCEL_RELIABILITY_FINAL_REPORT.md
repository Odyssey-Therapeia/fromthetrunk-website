# Payment Vercel Reliability — Final Report

Scope: harden `POST /api/v2/payments/create-order` against the Vercel `Status: 0`
abort/retry class of failures. No copy, routes (non-payment), pricing, stock rules,
shipping math, checkout UI copy, ownership, DB schema, or migrations were changed.
Nothing was deployed or pushed. Branch: `JP-Sprint`.

## 1. Root cause

`Status: 0` = the **client/browser closed the connection before the response** (an
abort, not a server crash). The create-order function ran fine (292 ms, "Response
finished"). The real risk is that create-order writes a **pending order + stock hold
before it responds**, so aborts/retries/double-clicks could create **duplicate
pending orders and stock holds**. There was **no idempotency** and **no client
double-submit lock**.

## 2. Files changed (implemented, no schema change)

| File | Purpose |
|---|---|
| `lib/checkout/checkout-attempt.ts` (new) | Client `checkoutAttemptId` + `cartFingerprint`; stored in `sessionStorage` keyed by cart/address/shipping/discount; reused on retry, reset on change, cleared on success. |
| `lib/checkout/use-checkout-payment.ts` | Sends `Idempotency-Key` header + `checkoutAttemptId`/`cartFingerprint` in the create-order body. |
| `components/checkout/checkout-page-client.tsx` | `submitLockRef` re-entry guard at the top of `handlePay` (covers the two awaited network phases before `isSubmitting` flips); clears the attempt on success. |
| `api/hono/schemas/payments.ts` | `createPaymentOrderSchema` extended with optional `checkoutAttemptId`/`cartFingerprint` (generic `createOrderSchema` untouched). |
| `db/queries/events.ts` | Added `getEventByEventId` reader. |
| `lib/payments/checkout-idempotency.ts` (new) | `findReusablePaymentOrder` + `recordPaymentAttempt` — idempotency via the existing `events` table (`checkout_attempt:<id>`). |
| `lib/payments/payment-host-guard.ts` (new) | `evaluatePaymentHost` — blocks LIVE payments on `*.vercel.app`/localhost. |
| `api/hono/routes/payments.ts` | Host guard + idempotent reuse (early return) + record-after-success + attempt id/fingerprint in Razorpay `notes`. |
| `tests/unit/{payment-host-guard,checkout-idempotency,checkout-attempt}.test.ts` (new) | 21 tests. |
| 7× `PAYMENT_*.md` (new) | Audit, env/domain, region, cleanup plan, migration proposal, validation checklist, this report. |

## 3. Idempotency behaviour

- **Client:** one stable `checkoutAttemptId` per cart/address/shipping/discount combo. A retry
  of the same checkout sends the same key; any payment-relevant change mints a new one.
- **Server:** on create-order, if a prior attempt with the same id produced a **still-pending,
  non-expired order with a live Razorpay link**, that order + link are returned — no new order,
  no new stock hold. The mapping is recorded in the existing `events` table **only after** the
  order + link are successfully created (safe by construction: a failed create leaves no marker;
  a paid/failed/expired order is never reused; owner + fingerprint must match).
- **Concurrency note:** two truly-simultaneous requests for the same attempt id can still both
  create (the atomic `stock_status` UPDATE blocks the second live hold on one-of-one items → its
  order is set `failed`; the pending cap bounds accumulation). The fully race-proof version needs
  a unique `orders.idempotency_key` column → `PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md` (approval-gated).

## 4. Double-submit protection

`submitLockRef` guards the entire `handlePay`, closing the window where `isSubmitting` had not
yet flipped (it only flips inside `startPayment`, after `recheckCheckoutAvailability` + address
saves). A rapid double-click now issues exactly one create-order POST. Visible copy unchanged.

## 5. Domain / env safety

Live-payment host guard added: `rzp_live_*` keys are refused (`403 PAYMENT_HOST_NOT_ALLOWED`) on
`*.vercel.app`/localhost; test keys and the real custom domain are unaffected; override via
`ALLOW_UNSAFE_LIVE_PAYMENTS=true`. Details + owner config actions (Vercel Production Branch,
prod env vars, webhook URL) in `PAYMENT_VERCEL_ENV_DOMAIN_REPORT.md`.

## 6. Region decision

No change made. The route runs in `iad1` (default); the Neon DB region is unverifiable from the
repo. Pinning `preferredRegion="bom1"` is **only** safe if Neon is in India/Singapore — otherwise
it slows the many sequential DB round-trips. Documented decision procedure in
`PAYMENT_VERCEL_REGION_REPORT.md`.

## 7. Pending cleanup status

Not implemented (cron/deploy config is approval-gated). Audit found the cleanup cron
(`/api/v2/cron/release-reservations`) is **not mounted on the served app** and there is **no
`vercel.json`**, and there is **no stale-pending-order expiry** at all. Plan in
`PAYMENT_PENDING_HOLD_CLEANUP_PLAN.md`. The shipped double-submit + idempotency changes reduce
*creation* of orphaned holds; cleanup handles the residual from true aborts.

## 8. Webhook idempotency status

Already correct (no change). Signature verify (raw body, `RAZORPAY_WEBHOOK_SECRET`, timing-safe) +
event-id dedup via `claimEvent` on `events` + exactly-once completion (`ne(paymentStatus,'paid')`).
Proposed-only hardening: claim-after-success / release-on-failure so a mid-handler failure doesn't
dedup away a legit Razorpay retry (webhook route is sensitive — left as a recommendation).

## 9. Tests added

`tests/unit/payment-host-guard.test.ts` (6), `tests/unit/checkout-idempotency.test.ts` (9),
`tests/unit/checkout-attempt.test.ts` (6) — covering: double-click/retry reuse, different
fingerprint → new attempt, expired not reused, paid/failed not reused, cross-user not reused, stock
not duplicated (reuse returns the existing order), live-payment blocked on unsafe host, and no PII
persisted in the attempt record.

## 10. Command results

| Command | Result |
|---|---|
| `pnpm run lint` | ✅ pass (exit 0) |
| `pnpm exec tsc --noEmit --pretty false` | ✅ pass (clean) |
| `pnpm run build` | ✅ pass (`.next/BUILD_ID` written) |
| `pnpm run test` | ✅ 137 files / 1703 tests passed (was 134/1682; +3/+21) |
| `pnpm audit` | ✅ no known vulnerabilities |
| `git diff --check` | ✅ clean |

(Local toolchain is node 25 / pnpm 10.28.0; the `-p node@22` pins only avoid the engine warning.)

## 11. Manual validation

See `PAYMENT_VERCEL_LAUNCH_VALIDATION_CHECKLIST.md` — double-click, refresh-during-create,
close-tab-and-retry, cart-change, webhook duplicate, host-guard, and reconciliation checks.

## 12. Remaining risks

1. **Concurrent** same-attempt race not fully closed without the `orders.idempotency_key` migration (proposal).
2. **Pending-order cleanup not running** (cron unmounted on served app, no `vercel.json`) — orphaned holds persist until the 30-min stock cron (also currently unwired) or manual action.
3. **Webhook** claims the event id before processing (retry-stuck edge) and does emails + a Razorpay fetch synchronously before the 200 ack (latency/timeout edge).
4. **Vercel Production Branch** was `Staging` in the log (should be `main`) — owner/project setting.
5. **Region** left at `iad1` pending Neon-region confirmation.

## 13. GO / NO-GO

**GO for Vercel production checkout — with two owner config actions first:**
- **GO** for the code: double-click and sequential-retry no longer create duplicate pending orders;
  live payments are blocked on unsafe hosts; webhook is idempotent; lint/tsc/build/test/audit all pass;
  no SEO/content/product-media changes; no unapproved migration.
- **Required before flipping live:** (a) point Vercel **Production Branch** to `main` and confirm prod
  env vars + Razorpay webhook URL (`PAYMENT_VERCEL_ENV_DOMAIN_REPORT.md`); (b) enable the pending-hold
  cleanup (`PAYMENT_PENDING_HOLD_CLEANUP_PLAN.md`) so residual aborted holds are reclaimed.
- **Recommended soon after:** approve the `orders.idempotency_key` migration (closes the concurrency
  race) and confirm the Neon region for the `bom1` decision.
