# Phase D OTP Concurrency Test Report

Date: 2026-07-03

## Concurrency Cases

Added in `tests/unit/auth-otp-phase-d.test.ts`:

- 20 concurrent OTP start requests from one IP across different synthetic identifiers.
- 20 concurrent OTP verify requests for the same challenge with the correct code.

Verified by architecture review:

- `markOtpChallengeVerified` atomically requires `verified_at is null`.
- `consumeOtpLoginTicket` atomically requires `consumed_at is null`.
- `auth_otp_challenges.challenge_token_hash` is unique.
- `auth_otp_challenges.login_ticket_hash` is unique when present.

## Results

- Same-IP OTP start spray: only the configured first 15 requests passed; the remaining 5 were rate-limited.
- Concurrent correct verify: exactly one request returned success and exactly one login ticket was set; 19 replay/race attempts returned generic 400.
- Wrong OTP verify never issued a ticket.
- Consumed challenge replay never issued a ticket.

## Login Ticket Consumption

The NextAuth email-OTP provider consumes login tickets through `consumeOtpLoginTicket`. The query predicate requires the ticket to be verified, unused, unexpired, and purpose-matched. That is the durable guard against duplicate login-ticket consumption.

## Session Context Isolation

Browser-session isolation was separately covered by `tests/e2e/auth-session-isolation.spec.ts` using two browser contexts with synthetic NextAuth JWT cookies and mocked account APIs.

## Result

OTP concurrency is GO for Phase D local/staging validation.
