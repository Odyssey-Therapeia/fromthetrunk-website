# Payment Vercel Launch Validation Checklist

Manual validation for payment reliability. Run against each environment with the
correct Razorpay key mode. Do not use live keys on preview/staging.

## Environments & keys
- [ ] **Localhost** (`pnpm dev`) — Razorpay **test** keys. Checkout completes end to end.
- [ ] **Vercel preview** — Razorpay **test** keys only. Checkout completes with test card.
- [ ] **Production** (`https://www.fromthetrunk.shop`) — Razorpay **live** keys; env vars
      `SITE_URL`/`NEXT_PUBLIC_SERVER_URL`/`NEXTAUTH_URL` = the production domain.

## Host guard
- [ ] With **live** keys on a `*.vercel.app` host, `POST /api/v2/payments/create-order` returns
      `403 PAYMENT_HOST_NOT_ALLOWED` (no order/hold created).
- [ ] With **test** keys on a `*.vercel.app` preview, checkout proceeds normally.
- [ ] With **live** keys on `https://www.fromthetrunk.shop`, checkout proceeds normally.

## Double-submit / retry (the core fix)
- [ ] **Double-click Pay** rapidly → exactly **one** pending order is created (not two). Verify in DB.
- [ ] **Refresh during create-order**, then click Pay again → the **same** order/payment link is
      returned (no duplicate pending order). Verify the `orderId` is unchanged.
- [ ] **Close the tab after create-order**, reopen checkout, click Pay → same attempt reused (no
      duplicate) while the cart is unchanged.
- [ ] **Change the cart** (add/remove item, change size, change shipping method, apply/remove a
      discount, change address) → a **new** attempt id is used and a new order is created.
- [ ] **Complete a payment**, then start a fresh checkout → a new attempt id (old one cleared).

## Webhook
- [ ] Trigger a Razorpay webhook (test event) → order marked paid once.
- [ ] Re-deliver the **same** webhook event id → returns `200 { duplicate: true }`, order state
      unchanged, no second email / no double stock-sold / no double discount usage.

## Pending-hold expiry (after cleanup plan is enabled)
- [ ] After the hold window (30 min) a never-paid pending order's stock hold is released
      (`GET /api/v2/cron/release-reservations` with `CRON_SECRET`), and (if step 3 enabled) the
      stale pending order is marked failed/expired. Paid orders are untouched.

## Reconciliation
- [ ] In the DB, a completed checkout has one `pending`→`paid` order (no duplicate pendings).
- [ ] In the Razorpay Dashboard, the payment link `notes` include `orderId`, `checkoutAttemptId`,
      and `cartFingerprint`, and `reference_id = ftt_<orderId>` — reconcilable to the internal order.

## Domain safety
- [ ] Checkout with **live** keys is not reachable on the wrong `*.vercel.app` host (guard blocks it).
- [ ] Vercel **Production Branch** points at `main` (not `Staging`).
- [ ] No secret values appear in any function log during the above.
