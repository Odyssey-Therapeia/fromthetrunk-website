# Phase B Current Race Analysis

## Why The Failed Loser Row Appeared

Before Phase B, checkout attempt reuse was recorded only after a payment link was created. The create-order path inserted an order row before the authoritative one-of-one stock claim. Two rapid same-user, same-cart, same-attempt requests could both pass the initial product read while the product still looked available.

After that pre-read:

1. Both requests inserted an order row.
2. One request won the atomic stock claim.
3. The winner created exactly one Razorpay payment link and one active hold.
4. The loser failed the stock claim and was marked `payment_status = failed`.
5. Because the attempt marker did not exist until after payment-link creation, the loser could not reuse the winner in time.

## Safety Before Phase B

Inventory was safe: the atomic stock update allowed only one active hold.

Payment link isolation was safe: only the stock-claim winner created a usable payment link.

Order-row cleanliness was not strict: the loser could leave a failed audit row for a double-click that was really the same checkout attempt.

## Operational Impact

Pending caps could be affected indirectly because noisy failed rows and extra write traffic make checkout history harder to interpret, even though the cap itself filters pending rows.

Admin/support reporting could be confusing because a customer double-click could appear as one pending checkout plus one failed checkout, even though only one real customer intent existed.

The old UX could surface technical-looking conflict/error states unless every create-order error was mapped before rendering. Phase B centralizes customer copy so raw codes like `PRODUCT_RESERVED`, `CHECKOUT_IN_PROGRESS`, or `409` are not rendered to the buyer.
