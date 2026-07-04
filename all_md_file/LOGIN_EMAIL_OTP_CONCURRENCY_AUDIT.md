# Login Email OTP Concurrency Audit

Status: Conditional GO if durable rate limiter and email provider are configured; otherwise fail-closed can make login unavailable.

## Evidence Reviewed

- OTP start/verify: `api/hono/routes/auth-otp.ts:241-668`
- OTP DB queries: `db/queries/auth-otp.ts:82-296`
- OTP hashing/timing-safe verify: `lib/auth/otp.ts:92-103`
- NextAuth provider consume-login-ticket flow: `lib/auth/options.ts:136-233`
- Password credential durable rate limit: `lib/auth/options.ts:41-56`
- Rate limiter fail-closed policy: `lib/http/rate-limit.ts:86-105`
- Rate limiter port/adapters: `lib/ports/rate-limiter.ts:47-72`, `lib/adapters/upstash-rate-limiter.ts:1-50`
- Email send path: `lib/email/send.ts:38-90`, `lib/email/resend.ts:1-17`
- Newsletter/contact email routes: `api/hono/routes/newsletter.ts:31-75`, `api/hono/routes/contact.ts:110-170`

## Current Rate Limits

- OTP start IP: 15 per 10 minutes, durable required.
- OTP start identifier+purpose: 5 per 60 seconds, durable required.
- OTP verify challenge token: 8 per 60 seconds, durable required.
- Password credential login: 5 attempts per 5 minutes per IP+email, durable required in production.
- Newsletter subscribe: 3 per 60 seconds, durable required.
- Contact submit: 5 per 10 minutes per IP and 3 per hour per email hash, durable required.

Durable provider is selected when Upstash Redis or Vercel KV REST URL/token envs exist. In production, `requireDurable: true` fails closed with `503 RATE_LIMITER_UNAVAILABLE` for non-loopback requests if durable limiter envs are absent.

## Questions Answered

1. If 20 users request OTP at the same time, allowed requests proceed until IP and identifier windows are hit; extra requests get rate-limited or 503 if durable limiter is absent in production.
2. If one user clicks resend repeatedly, identifier and IP limits throttle them. A fresh challenge is created for allowed starts; there is no separate email queue/backpressure.
3. If many users login together, email sends happen synchronously through provider abstractions. Provider latency/failure can affect UX.
4. OTP is rate-limited by IP and identifier/purpose.
5. OTP verify is attempt-limited by challenge token and max attempts.
6. Old OTP cannot be reused once expired/consumed; active challenge query requires unconsumed, unexpired, and below attempts.
7. Concurrent verification is guarded by conditional `verifiedAt IS NULL` and login ticket consumption; replay should be blocked.
8. Email failure returns safe generic behavior in some flows and logs non-secret error information; no raw secret is printed.
9. No direct raw OTP logging was found. Dev email mock may log recipients/subject when no provider is configured.
10. Durable limiter fails closed in production when required and missing.
11. Upstash/KV env presence was not printed. It must be verified in the deployment environment.
12. Missing durable limiter can break production login by returning 503 on required routes. This is safe but user-visible.

## Provider And Abuse Risks

- No email queue was found for OTP bursts. Resend/SMTP provider limits can become the bottleneck.
- Allowed repeated OTP starts create multiple challenges; UX and provider cost rely on rate limits.
- If Upstash/KV is down or missing, critical login/signup/payment/cart limits fail closed. This prevents abuse but can block legitimate users.
- Contact/newsletter routes also send emails synchronously.

## Tests Found

- `tests/unit/auth-otp-route-expiry.test.ts`
- `tests/unit/auth-otp-expiry.test.ts`
- `tests/unit/auth-otp-registration-complete.test.ts`
- `tests/unit/auth-options-security.test.ts`
- `tests/unit/rate-limit-production.test.ts`
- `tests/unit/email-send.test.ts`
- `tests/unit/contact-review-capture.test.ts`

## Tests Needed

- Concurrent verify of same OTP challenge against real test DB.
- Email provider failure during OTP start and newsletter/contact flows.
- Burst start test for same identifier and same IP with durable test limiter.
- Deployment env smoke: durable limiter configured and reachable.

## Verdict

Login/email/OTP concurrency: Conditional GO with durable limiter and email provider configured. NO-GO if production lacks Upstash/KV or if email provider quota/latency is not verified before launch.
