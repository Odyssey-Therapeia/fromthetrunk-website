# Phase C Browser Test Setup Report

## Browser Strategy

Playwright was available and used. The Browser plugin skill was attempted first, but the required runtime tool was not callable in this session, so repo Playwright was used as fallback.

## Session Model

- Browser tests use mocked NextAuth session responses.
- No OTP route was used.
- No OTP/email was sent.
- Two independent Playwright browser contexts represent separate users.
- Cart state is seeded through `ftt-cart-v2` localStorage.

## Synthetic Checkout Boundary

- Product stock endpoint is mocked at `/api/v2/products/*/stock`.
- Address API is mocked at `/api/v2/addresses`.
- Payment creation is not called from browser tests.
- Razorpay is not loaded in browser tests.

## Synthetic DB/API Proof

`scripts/phase-c-order-isolation-proof.ts` creates synthetic users/products/orders only after `--allow-synthetic-db` is passed and refuses live Razorpay key ids or production env mode.

The proof script:

- uses Razorpay test mode only
- suppresses external analytics sinks during the proof
- never prints payment links, tokens, secrets, emails, phone numbers, or addresses
- cleans up synthetic rows in `finally`

## Screenshots

Phase C screenshots were captured outside the repo:

- `/tmp/ftt-phase-c-screenshots/phase-c-reserved-conflict.png`
- `/tmp/ftt-phase-c-screenshots/phase-c-sold-conflict.png`
