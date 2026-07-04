# Phase C Login Session Isolation Smoke

## Method

Playwright browser contexts were used with mocked sessions. OTP/email login was not exercised because Phase C forbids sending real OTP/email.

## Results

Spec: `tests/e2e/phase-c-checkout-isolation.spec.ts`

- Two browser contexts held independent mocked sessions.
- User A cart did not appear in User B checkout.
- User B cart did not appear in User A checkout.
- Address API was mocked per context and did not leak rows across contexts.
- Wishlist was not mutated in Phase C.
- Logout/login with real OTP was not executed in this phase.

## Existing Protections

Existing unit coverage for OTP/auth route protections remains part of the full Vitest suite, which passed.
