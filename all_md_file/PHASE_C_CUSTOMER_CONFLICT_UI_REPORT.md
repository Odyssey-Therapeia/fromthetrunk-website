# Phase C Customer Conflict UI Report

## Browser Evidence

Playwright spec: `tests/e2e/phase-c-checkout-isolation.spec.ts`

- Reserved conflict passed.
- Sold conflict passed.
- Screenshots captured outside the repo under `/tmp/ftt-phase-c-screenshots`.

## Reserved

- Title: `This saree is currently reserved`
- Includes: `You have not been charged`
- Does not say `bought`
- Links to `/collection`
- No raw `PRODUCT_RESERVED` or `409` visible
- `aria-live="polite"` present

## Sold

- Title: `This saree has just been bought`
- Includes: `You have not been charged`
- Links to `/collection`
- No raw `PRODUCT_SOLD` visible
- `aria-live="polite"` present

## Checkout In Progress

- Unit coverage confirms title: `We’re preparing your checkout`
- Retry guidance is customer-facing.
- Raw `CHECKOUT_IN_PROGRESS` is not exposed in customer copy.

## Too Many Pending

- Unit coverage confirms user-friendly pending checkout copy.
- Raw `TOO_MANY_PENDING_ORDERS` is not exposed in customer copy.

## Generic Failure

- Unit coverage confirms interrupted-before-payment copy.
- Includes `You have not been charged`.
- Raw backend code is not exposed.

## Phase C UI Fix

When a reserved/sold conflict removes the final cart item, checkout now preserves the friendly conflict notice above the empty-cart state instead of losing the message.
