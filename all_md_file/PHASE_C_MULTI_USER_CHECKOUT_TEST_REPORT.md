# Phase C Multi-User Checkout Test Report

## Method

Primary proof used `scripts/phase-c-order-isolation-proof.ts` against local/staging test-mode configuration. Browser UI proof used Playwright with mocked session/cart/stock boundaries.

## Results

| Scenario | Result |
| --- | --- |
| Same user, same product, rapid double-click | PASS: statuses 200/409; order rows 1; failed rows 0; payment link rows 1; active hold 1; retry returned same order/link. |
| Same user, refresh/retry checkout | PASS: same order/link reused; no duplicate order or hold. |
| Two users, same product, concurrent checkout | PASS: one 200, one 409 `PRODUCT_RESERVED`; one payment link; one active hold; loser has no payment link. |
| Cross-user same idempotency key | PASS: first user 200; second user 409; no payment link leak; order rows 1. |
| Changed cart/fingerprint | PASS: second changed attempt created a new independent order/link and did not reuse the old one. |
| Sold product cannot be paid again | PASS: 409 `PRODUCT_SOLD`; no order row; no payment link. |

## Counts From Synthetic Proof

- Same-attempt double-click: order rows 1, failed rows 0, payment link rows 1, active holds 1.
- Two users same product: order rows 2, failed rows 1, payment link rows 1, active holds 1.
- Cross-user same key: order rows 1, payment link rows 1, no link leak.
- Sold product: order rows 0, payment link rows 0.

## Cleanup

Synthetic cleanup returned zero for users, products, orders, order items, reservations, events, addresses, and wishlist rows.
