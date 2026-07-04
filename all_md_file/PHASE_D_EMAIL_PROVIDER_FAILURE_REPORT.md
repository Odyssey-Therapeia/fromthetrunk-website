# Phase D Email Provider Failure Report

Date: 2026-07-03

## Email Path Audited

`lib/email/send.ts` selects provider in this order:

1. Resend when Resend key is configured.
2. SMTP when SMTP host/user/password are configured.
3. Development mock log when no transport is configured.

`api/hono/routes/auth-otp.ts` awaits `sendEmail` during OTP start.

## Tests Added

`tests/unit/auth-otp-phase-d.test.ts`:

- OTP start remains generic and non-throwing when the email sender returns `false`.
- No `otp_sent` security event is written when provider send fails.

`tests/unit/email-send-phase-d.test.ts`:

- Dev mock email log redacts synthetic recipient strings.
- Provider exception returns `false`.
- Provider exception output redacts synthetic recipient strings and token-like fragments.

`lib/log.ts`:

- Redaction now includes generic `token=` labels in free-form strings.

## Behavior Under Failure

- Provider unavailable: `sendEmail` catches and returns `false`.
- Provider rejects/rate-limits: Resend error returns `false`; caught exceptions return `false`.
- OTP start response: remains generic 200 after the challenge is created.
- Secrets/PII in logs: synthetic test proved redaction for recipient-like strings and token-like fragments.
- Queue/backpressure: no queue exists; OTP email is synchronous.
- Provider latency: OTP start waits for provider latency.
- Duplicate emails under concurrent starts: start rate limits reduce duplicate sends, but there is no queue-level dedupe.

## 50-User Burst Assessment

If 50 users request OTP at once:

- Same IP traffic is throttled by the 15 per 600 seconds IP cap.
- Distinct IP traffic can still create concurrent provider calls.
- Without a queue, provider latency and quota limits can directly affect OTP start latency and delivery.

## Launch Recommendations

- Keep durable limiter configured in production.
- Monitor provider send failure rate, latency, and quota utilization.
- Add queue/backpressure if OTP volume increases beyond small-launch expectations.
- Do not use real customer email for future smoke tests unless a provider sandbox or explicit safe test sink is configured.

## Result

Email failure behavior is safe for Phase D because it fails without leaking secrets or throwing. Throughput remains a scaling risk due to synchronous provider calls.
