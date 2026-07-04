# Phase B Strict Idempotency Options

## Option 1 - Accept Current Behavior

- One winner.
- One active hold.
- One usable payment link.
- One failed loser row during concurrent same-attempt race.
- No DB migration.
- Fastest launch path.
- Admin/reporting cleanup deferred.

Assessment: payment-safe but not strict. It leaves noisy failed rows for one customer intent.

## Option 2 - DB-Backed `orders.idempotency_key` Unique Claim

- Add nullable `orders.idempotency_key`.
- Add nullable `orders.cart_fingerprint`.
- Add partial unique index on non-null `orders.idempotency_key`.
- Claim the checkout attempt at order insert before stock/payment/Razorpay side effects.
- Unique conflict loads the existing order by idempotency key.
- Same user plus same server cart fingerprint can receive the existing pending link or `CHECKOUT_IN_PROGRESS`.
- User/cart mismatch is rejected without link leakage.
- Same-attempt double-click creates no extra failed loser order row.
- Requires additive local/staging DDL now and a production migration proposal before launch.

Assessment: chosen for Phase B. It directly fixes the strict idempotency requirement with the smallest durable schema change.

## Option 3 - Separate `checkout_attempts` Table

- Cleaner long-term state machine.
- Better if checkout orchestration grows beyond order/link creation.
- Heavier schema and code change.
- More moving parts for the current launch.

Assessment: not needed for the current launch unless checkout state grows more complex.

## Decision

Option 2 was implemented.
