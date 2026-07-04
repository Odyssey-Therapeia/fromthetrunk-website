# Phase D Durable Limiter Fail-Closed Report

Date: 2026-07-03

## Code Behavior

`lib/http/rate-limit.ts` fails closed when all are true:

- `requireDurable` is true.
- Runtime is production.
- Request is not loopback.
- Durable limiter env pair is missing.

Fail-closed response:

- Status: 503
- Code: `RATE_LIMITER_UNAVAILABLE`
- `Retry-After`: 60

## Tests

Existing `tests/unit/rate-limit-production.test.ts` proves:

- Production non-loopback required durable limiter returns 503 when missing.
- Test/development can use in-memory limiter.
- Loopback production-start probes can use in-memory limiter.

Added `tests/unit/rate-limit-phase-d.test.ts` proves:

- Configured durable limiter allows a production required request.
- Configured durable limiter returns 429 with `Retry-After` and rate-limit headers when rejecting.
- High-risk routes remain wired with `requireDurable: true` for OTP, cart reserve, payment create, and semantic search.

## Protected Surfaces Confirmed

- OTP start and verify.
- Registration complete.
- Password auth.
- Cart reserve/release/release-expired.
- Payment create and repay.
- Semantic search.
- Address mutations.
- Wishlist mutations and restock notify.
- Contact/site-feedback/newsletter mutations.

## Result

Durable limiter behavior is GO for local Phase D validation. Production launch still requires confirming the durable limiter pair exists in the production deployment environment.
