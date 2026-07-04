# Payment Vercel Abort/Retry Audit

Scope: `POST /api/v2/payments/create-order` reliability on Vercel. Read-only audit
of the current flow, followed by the hardening implemented in this change set.
Branch: `JP-Sprint`. No copy, pricing, stock rules, schema, or migrations changed.

## Root cause of the observed `Status: 0`

`Status: 0` is not an HTTP status — in Vercel logs it means the **client closed
the connection before the response was returned** (browser/network abort). The
function itself ran (292 ms, "Response finished", firewall allowed, no timeout).
So the create-order function executed successfully; the browser just didn't
receive the reply. The reliability risk is not a crash — it's that create-order
performs **DB + stock-hold writes before it responds**, so an abort/retry can
leave orphaned pending orders and temporary stock holds.

## Flow map (create-order) — `api/hono/routes/payments.ts`

Handler `:274-814`, mounted via `app/api/v2/[...route]/route.ts` → `api/hono/site-app.ts:144`.

Side-effecting steps, all **before** the `200` response:

1. `requireAuth` (`:296`).
2. Durable rate-limit write, 5/60s (`:299-304`).
3. Reads: products, product types, pending-count.
4. **Pending order insert** — `createOrder(...)` (`:558`) → `db/queries/orders.ts:244-284`
   inserts `orders` (`status="pending"`, `paymentStatus="pending"`, `razorpayOrderId=NULL`)
   + `order_items` + `order_events`. **No wrapping transaction.**
5. Fire-and-forget `order_created` analytics.
6. Reservation-row insert(s) — flag `isInventoryV2()` only (`:626`).
7. **Authoritative stock claim** — `UPDATE products SET stock_status='reserved',
   reserved_until=now()+30min` (`:653-683`). This is the oversell guard.
8. **Razorpay Payment Link create** (external) (`:728`); `reference_id = ftt_<orderId>`,
   `notes = { orderId, userId }`.
9. `UPDATE orders SET razorpay_order_id = link.id` (`:785`).
10. `addOrderEvent` "Razorpay payment link created" (`:793`).
11. Response 200 with `orderId`, `paymentLinkUrl`, `orderAccessToken`, etc. (`:798`).

Hold window: `RAZORPAY_PAYMENT_LINK_HOLD_MINUTES = 30` (`lib/payments/razorpay.ts:9`).

## Audit answers

| Question | Finding |
|---|---|
| Where is the pending order created? | `createOrder` `orders.ts:244-284`, status/paymentStatus `pending`. |
| Where is stock reserved? | After order insert, before Razorpay: reservation insert (`:626`, flag) + authoritative `stock_status` UPDATE (`:653`). |
| Where is Razorpay link created? | `:728` via `createRazorpayPaymentLink`; receipt-analog is `reference_id=ftt_<orderId>`; notes `{orderId,userId}`. |
| Client abort after DB writes? | Handler still runs to completion; leaves an orphaned `pending` order (+ items/events) and a 30-min stock hold. |
| Retry behaviour (before this change)? | Every POST created a brand-new order; **no idempotency**. Duplicate order rows always creatable; duplicate *active holds* on the same one-of-one item blocked by the atomic stock UPDATE (2nd → 409, order set `failed`). |
| Duplicate pending orders possible? | Yes (bounded by the pending cap). |
| Pending-order cap? | Yes — `:533-556`: ≥3 live pending orders per **user** in the last 30 min → `429 TOO_MANY_PENDING_ORDERS`. Non-atomic read (documented race). |
| Expired holds released? | Stock holds: yes via cron `GET /cron/release-reservations` (`api/hono/routes/cron.ts:24-116`). **Pending orders: never** transitioned by any timer. **Wiring gap:** cron routes are mounted only in `api/hono/app.ts`, **not** `site-app.ts` (the served app), and there is **no `vercel.json`** → cleanup effectively not running from this repo (see `PAYMENT_PENDING_HOLD_CLEANUP_PLAN.md`). |
| Webhook idempotency? | Already correct — see §Webhook. |

## Webhook (already idempotent) — `api/hono/routes/webhooks.ts`

- HMAC-SHA256 over the **raw** body with `RAZORPAY_WEBHOOK_SECRET`, timing-safe (`:206-237`).
- Event-id dedup via `claimEvent` on the `events` table (unique `event_id`), namespaced
  `razorpay_webhook:<id>` (`:239-250`).
- Exactly-once completion: `completePaidOrder` conditional UPDATE `ne(paymentStatus,'paid')`
  (`lib/orders/complete-paid-order.ts:101-133`) — stock→sold, reservation release,
  discount usage, emails all in the winner branch only.
- Observations (not defects): the event id is **claimed before processing** (a mid-handler
  failure + Razorpay retry can dedup away a legit retry); completion + emails + (for
  `order.paid`) an external Razorpay fetch run **synchronously before the 200 ack**. See
  the final report's "remaining risks".

## Idempotency storage options

- `orders` has **no** column usable for cart idempotency (no receipt/idempotencyKey/metadata;
  `razorpayOrderId`/`paymentId` are unique but populated late/null at insert).
- The **existing `events` table** (unique `event_id`) is already used for webhook idempotency
  and is reused here (namespace `checkout_attempt:<id>`) — **no migration required** for the
  implemented interim. The robust, fully race-proof version needs a new column and is written
  up (approval-gated) in `PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md`.

## Changes implemented (this change set)

| File | Change |
|---|---|
| `lib/checkout/checkout-attempt.ts` (new) | Client `checkoutAttemptId` + `cartFingerprint`, persisted in `sessionStorage` keyed by cart/address/shipping/discount; reused on retry, minted on change, cleared on success. |
| `lib/checkout/use-checkout-payment.ts` | Sends `Idempotency-Key` header + `checkoutAttemptId`/`cartFingerprint` body fields to create-order. |
| `components/checkout/checkout-page-client.tsx` | `submitLockRef` ref lock at the top of `handlePay` (covers the pre-startPayment awaited phases) → no double-submit; clears the attempt on success. |
| `api/hono/schemas/payments.ts` | `createPaymentOrderSchema` extended with optional `checkoutAttemptId`/`cartFingerprint` (generic `createOrderSchema` untouched). |
| `db/queries/events.ts` | Added `getEventByEventId` reader. |
| `lib/payments/checkout-idempotency.ts` (new) | `findReusablePaymentOrder` (reuse a still-valid pending order+link) + `recordPaymentAttempt` (claim `checkout_attempt:<id>` after success). |
| `lib/payments/payment-host-guard.ts` (new) | Blocks LIVE payments on `*.vercel.app`/localhost. |
| `api/hono/routes/payments.ts` | Host guard + idempotent reuse (early return) + record-after-success + `checkoutAttemptId`/`cartFingerprint` in Razorpay `notes`. |

## Files that still require owner approval (proposals only)

- `PAYMENT_IDEMPOTENCY_DB_MIGRATION_PROPOSAL.md` — `orders.idempotency_key` + partial unique index (fully race-proof server idempotency).
- `PAYMENT_PENDING_HOLD_CLEANUP_PLAN.md` — mount cron on `site-app`, add `vercel.json` cron, add stale-pending-order expiry.
- Webhook claim-after-success / release-on-failure hardening (webhook route change — sensitive).
- Region pinning (`preferredRegion="bom1"`) — gated on confirming the Neon DB region (see `PAYMENT_VERCEL_REGION_REPORT.md`).
