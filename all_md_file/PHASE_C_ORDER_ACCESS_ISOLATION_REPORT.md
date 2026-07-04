# Phase C Order Access Isolation Report

## Routes/Helpers Covered

- `api/hono/routes/orders.ts`
- `api/hono/routes/payments.ts` `/status`
- `api/hono/routes/payments.ts` `/orders/{id}/repay`
- `lib/orders/order-access-token.ts`
- `lib/orders/viewable-order.ts`
- `app/(site)/checkout/confirmation/receipt/route.ts`

## API Proof Results

Synthetic proof result: PASS.

- Owner order detail: 200
- Wrong-user order detail: 403
- Admin order detail: 200
- Owner order history includes order: true
- Wrong-user order history includes order: false
- Owner payment status: 200
- Wrong-user payment status: 403
- Admin payment status: 200
- Valid access token payment status: 200
- Wrong access token payment status: 403
- Wrong-user repay: 403

## Receipt Isolation

Unit route test: `tests/unit/order-receipt-route-isolation.test.ts`

- Non-viewable receipt returns 404.
- Viewable unpaid order returns 409.
- Viewable paid order returns no-store, noindex HTML.

Direct Next route invocation from the standalone DB proof is not valid because Next request-scoped dynamic APIs are unavailable outside a Next request. The standalone proof therefore validates the same access-token helper and the dedicated unit route test covers the actual receipt route behavior.

## Guest/Email Claim

Existing and Phase C coverage preserve the rule that guest email claim only applies when `orders.userId` is null. Registered-user orders are not exposed by matching shipping email alone.

## Confirmation Page Trust

Receipt and payment status access do not trust client-only state. They require owner/admin/email-claim rules or a valid order access token.
