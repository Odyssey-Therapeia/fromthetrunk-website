# Phase A One-Of-One Sanity Report

Date: 2026-07-03

Scope: minimal local/staging DB proof only. No live payment, no real product sale, and no persisted test data.

## Method

A rollback-only transaction created synthetic users, a synthetic product, synthetic orders, and order items. It then attempted two reservation claims for the same product.

Expected result:

- one winner
- one loser/conflict
- one active hold
- loser order cannot proceed as payable
- no synthetic data persists

## Result

```json
{
  "orderInsert": "pass",
  "orderItemsInsert": "pass",
  "firstClaimRows": 1,
  "secondClaimRows": 0,
  "activeHoldCount": 1,
  "loserOrderStatus": "failed",
  "rollback": "complete",
  "persistedAfterRollback": {
    "products": 0,
    "orders": 0,
    "users": 0
  }
}
```

## Interpretation

- The first claimant won the product-row reservation predicate.
- The second claimant affected 0 rows and did not create a second active hold.
- The loser order was marked `failed`.
- The transaction was rolled back and follow-up checks found 0 persisted synthetic products, orders, or users.

## Limits

This is a DB-level sanity proof, not a full staging load or browser race test.

Still needed before production confidence:

- independent concurrent sessions instead of one rollback transaction
- HTTP `create-order` path coverage
- checkout idempotency/double-click coverage
- test-only Razorpay public key
- notification-safe payment-link testing

Phase A one-of-one DB predicate sanity: PASS.

