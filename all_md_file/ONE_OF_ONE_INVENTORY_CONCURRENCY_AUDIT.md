# One-Of-One Inventory Concurrency Audit

Status: Conditional NO-GO until DB schema is verified and staging concurrency tests pass.

## Current Business Behavior

FTT products are one-of-one. The code treats add-to-cart as a reservation hold, not final ownership. Final ownership is confirmed only after the paid-order completion path atomically moves reserved products to sold.

PDP copy currently says: "Adding this piece reserves the unique piece in your bag. Final ownership is confirmed at checkout." Evidence: `app/(site)/collection/[slug]/page.tsx:292-296`.

## Lifecycle Evidence

- Product stock fields: `db/schema.ts:156-179` (`stockStatus`, `reservedUntil`, `quantityAvailable`, `soldAt`).
- Reservations table: `db/schema.ts:848-879`; no unique product-level active reservation constraint.
- Inventory compatibility helpers: `db/inventory.ts:1-67`.
- Cart reservation token: `lib/cart/reservation-token.ts:21-90`.
- Cart hold policy: `lib/cart/reservation-policy.ts:1-31`.
- Cart reserve/release routes: `api/hono/routes/cart.ts`.
- Checkout/create-order: `api/hono/routes/payments.ts:301-879`.
- Webhook payment completion and cleanup: `api/hono/routes/webhooks.ts:206-408`.
- Paid completion: `lib/orders/complete-paid-order.ts:86-225`.
- Reservation v2 query layer: `db/queries/reservations.ts:1-126`.
- Cron release route exists in full app: `api/hono/routes/cron.ts:1-116`, but full cron mount is not in the deployed `site-app` handler.

## Winner Rule

The first request that wins the conditional product-row `UPDATE` wins the active hold. Later requests see unavailable/reserved state and should receive a conflict.

Evidence:

- Cart reserve uses atomic `UPDATE products SET stockStatus='reserved', reservedUntil=... WHERE id AND (available OR expired reserved) RETURNING`.
- Checkout create-order revalidates published product rows and performs an authoritative atomic product claim before returning a payment link.
- Paid completion first atomically claims the order as not already paid, then moves all order products from `reserved` to `sold`; if product claim count mismatches, it throws `PRODUCT_SOLD` and does not send confirmation emails.

## Questions Answered

1. If two users add the same product to cart, the first conditional reserve update wins; the second should get a reserved/sold conflict.
2. Add-to-cart does reserve stock for a limited hold using `reservedUntil` and a signed token.
3. If two users checkout/pay at the same time, the first successful atomic product-row claim wins.
4. The authoritative reservation claim is atomic at the product-row update level.
5. Two pending order rows can be created during races because the order is inserted before inventory claim, but the loser is marked failed when the claim loses.
6. Two active stock holds should not exist in the canonical product row. The separate `reservations` table is not authoritative and has no unique active product constraint.
7. Two payments should not sell the same product if paid completion runs through `completePaidOrder`, because the order payment claim and product sold update are guarded.
8. Webhook/callback completion is idempotent through event-id dedupe and the order paymentStatus guard.
9. Abandoned payment holds rely on release paths and cron/cleanup.
10. Late or duplicate Razorpay webhooks are deduped by event id and/or paymentStatus checks.
11. Browser abort after order creation can leave pending/failed order state depending on where abort occurs; cleanup/reporting needs staging validation.
12. Retry with same checkout attempt can reuse the correct pending payment link if same user/cart fingerprint.
13. Pending holds are released by cart release and release-expired routes, but operational cron mounting needs verification.
14. Stale pending order count can block future checkout because create-order caps live pending links per customer; cleanup behavior needs monitoring.
15. Inventory v1/v2 is hybrid. Product row remains canonical; reservation table is compatibility/pre-check and not authoritative.

## Race Windows

- Order creation occurs before inventory claim in `api/hono/routes/payments.ts:599-628`. The loser is marked failed, but the row exists.
- Payment-link creation failure rolls back product holds, but this depends on all cleanup paths completing.
- Pending payment-link cap has a noted race window around live pending counts (`api/hono/routes/payments.ts:574-597`).
- Webhook `releaseOrderReservation` releases product stock but the inspected path does not set `quantityAvailable=1`, creating a possible dual-write inconsistency with inventory v2 (`api/hono/routes/webhooks.ts:159-190`).
- Full cron `/api/v2/cron/release-reservations` is registered in `api/hono/app.ts:167-169`, but the deployed catch-all imports `api/hono/site-app` (`app/api/v2/[...route]/route.ts:1-12`), where cron is not mounted. Cart `/api/v2/cart/release-expired` is mounted and secret/admin protected.

## DB-Level Protections

- `orders_razorpay_order_id_unique` and `orders_payment_id_unique` unique indexes where not null are declared in schema.
- `events.event_id` is unique for idempotency/event dedupe.
- No unique active reservation constraint exists on `reservations.product_id`; this is acceptable only because the product row is the serialization point.
- DB actual state was not verified because `DATABASE_URL` is remote-unknown.

## Tests Found

- `tests/unit/cart-reservation-routes.test.ts`
- `tests/unit/payments-route.test.ts` includes one-winner create-order race.
- `tests/unit/complete-paid-order.test.ts` includes concurrent paid completion and product claim failure.
- `tests/unit/webhooks-route.test.ts` and `tests/unit/webhooks-signature.test.ts`
- `tests/unit/checkout-idempotency.test.ts`
- `tests/unit/product-stock-route.test.ts`
- `tests/unit/inventory-v2.test.ts`

## Missing Tests

- Integration test with a real test DB for two browser/users claiming the same product.
- Staging test for abort after order creation but before payment-link creation.
- Staging test for abandoned payment release and stale pending-order cap.
- Test proving deployed cron/cleanup route is reachable in the actual Next catch-all composition.
- Test covering webhook release dual-write of `quantityAvailable`.

## Risk Rating

Production risk: Medium-high until DB schema and deployment route surface are verified. The code-level atomic product-row pattern is strong, but launch readiness depends on actual DB schema, mounted cleanup routes, and staging concurrency proof.

## Approval-Required Fix Recommendations

1. Run read-only DB preflight against staging/local only.
2. Add integration tests with a disposable DB for same-product cart and checkout races.
3. Decide whether cron routes should be mounted in `site-app` or scheduled through cart cleanup route.
4. Repair any inventory v2 dual-write cleanup gaps only after owner approval.
5. Consider a dedicated checkout idempotency table/unique column if payment retry races become launch-blocking.
