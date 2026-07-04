# Phase B Concurrency HTTP Proof Report

## Scope

The proof ran through the Hono `POST /create-order` route with synthetic users/products, local/staging DB, localhost origin, and Razorpay test mode. Returned payment links were not printed. Secrets, customer identifiers, DB URL, keys, tokens, phone numbers, and addresses were not printed.

Customer notifications were disabled for the local/test run.

## Result

PASS.

## Scenario 1 - Same User, Same Product, Same Attempt, Concurrent Double-Click

Responses:

- request A: `409 CHECKOUT_IN_PROGRESS`, no payment link, `Retry-After` present
- request B: `200`, payment link returned to caller but not printed

DB/result counts:

- order rows: 1
- failed rows: 0
- payment link rows: 1
- active holds: 1

Conclusion: strict idempotency fixed the Phase A.1 extra failed loser row for same-attempt double-click.

## Scenario 2 - Sequential Retry Same User/Cart/Attempt

Response:

- `200`
- existing order reused
- payment link returned to caller but not printed

Counts:

- order rows after retry: 1

Conclusion: same-attempt retry reuses the existing order/link.

## Scenario 3 - Changed Cart With New Attempt

Response:

- `200`
- independent order created
- payment link returned to caller but not printed

Counts:

- order rows: 1
- payment link rows: 1
- active holds: 1

Conclusion: a new checkout attempt for a different cart creates its own order/link and does not reuse the old link incorrectly.

## Scenario 4 - Cross-User Same Idempotency Key

Owner setup response:

- `200`
- payment link returned to owner but not printed

Other user response:

- `409 CHECKOUT_IN_PROGRESS`
- no payment link
- `Retry-After` present

Other user counts:

- order rows: 0
- payment link rows: 0
- active holds: 0
- link leaked: false

Conclusion: same idempotency key cannot be used to fetch another user's link.

## Scenario 5 - Different Users, Same Product, Concurrent Checkout

Responses:

- one request: `200`, payment link returned to caller but not printed
- one request: `409 PRODUCT_RESERVED`, no payment link

Counts:

- order rows: 2
- failed rows: 1
- pending rows: 1
- payment link rows: 1
- active holds: 1

Conclusion: the one-of-one rule still holds. A different-user conflict can still produce an audit failed row through the existing stock-loss path, but only one buyer gets a hold/link and the loser cannot pay.

## Customer Message Classification

The loser state `PRODUCT_RESERVED` maps to:

- title: `This saree is currently reserved`
- message includes: `You have not been charged`
- reserved copy does not say `bought`
- raw backend code is not rendered by the UI mapper

## Cleanup Verification

Synthetic cleanup returned to zero:

- synthetic order rows: 0
- synthetic product rows: 0
- synthetic user rows: 0
- synthetic checkout-attempt events: 0
- synthetic order-payload events: 0
