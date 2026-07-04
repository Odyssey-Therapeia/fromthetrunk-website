# Phase D OTP Rate Limit Test Report

Date: 2026-07-03

## Tests Added

`tests/unit/auth-otp-phase-d.test.ts` adds rate-limit and abuse coverage using synthetic identifiers and mocked email/rate-limit providers.

Covered cases:

- Repeated OTP starts for the same identifier.
- OTP start spray from the same IP across different identifiers.
- Email provider failure during OTP start.
- Wrong OTP verify increments attempts and does not create a login ticket.
- Consumed challenge replay is rejected.
- Concurrent correct OTP verify produces only one login ticket.

Existing related tests also cover:

- Expired OTP verification rejection.
- Unknown sign-in generic response.
- Registration completion account collision behavior.
- OTP expiry/ticket query predicates.

## Results

Targeted command:

`npx -y -p node@22 -p pnpm@10.28.0 pnpm exec vitest run tests/unit/auth-otp-phase-d.test.ts tests/unit/rate-limit-phase-d.test.ts tests/unit/email-send-phase-d.test.ts`

Result: pass, 3 files, 11 tests.

Full command:

`npx -y -p node@22 -p pnpm@10.28.0 pnpm run test`

Result: pass, 144 files, 1745 tests.

## Findings

- Per-identifier OTP start throttling is wired and uses a hashed identifier rate key.
- Per-IP OTP start throttling is wired before per-identifier throttling.
- Verify attempts are capped by both route rate limit and challenge max-attempt query behavior.
- Wrong OTP does not issue a login ticket.
- Consumed OTP cannot replay.
- Errors are generic and do not expose account existence.
- No real email was sent.

## Gaps

- There is no separate resend endpoint. Resend spam is currently represented by repeated `/start` calls plus `resendAvailableAt`.
- Production Upstash/KV behavior was mocked locally; production env values were not live-tested.
