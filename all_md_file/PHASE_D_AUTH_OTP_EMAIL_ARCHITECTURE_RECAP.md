# Phase D Auth/OTP/Email Architecture Recap

Date: 2026-07-03

## OTP Start Flow

`POST /api/v2/auth/otp/start` is registered in `api/hono/routes/auth-otp.ts`.

- Identifier is detected as email or normalized phone.
- Sign-up only accepts email identifiers.
- Request IP and user-agent are hashed before storage.
- Per-IP rate limit runs first: `auth:otp:start:ip`, limit 15 per 600 seconds, `requireDurable: true`.
- Per-identifier rate limit runs second: purpose plus identifier type plus hashed normalized identifier, limit 5 per 60 seconds, `requireDurable: true`.
- Existing user lookup decides whether a challenge can be delivered.
- Challenge is stored through `createOtpChallenge`.
- Email OTP is sent through `sendEmail(otpEmail(...))`.
- Client response is generic and does not reveal account existence.

## OTP Verify Flow

`POST /api/v2/auth/otp/verify`:

- Uses a hashed challenge token rate-limit key: limit 8 per 60 seconds, `requireDurable: true`.
- Audits expired challenges first to return the explicit expired-code message.
- Active challenge lookup excludes consumed, expired, and max-attempted rows.
- Wrong OTP increments attempts through `incrementOtpChallengeAttempt`.
- Correct OTP calls `markOtpChallengeVerified`.
- For email sign-in/checkout, a customer row is created or loaded after verification.
- A short-lived login ticket is generated through `setOtpLoginTicket`.

## Login Ticket and Session Flow

`lib/auth/options.ts` defines NextAuth providers.

- Session strategy is JWT.
- Password credentials are rate-limited by hashed IP plus hashed email.
- In production, password auth fails closed if the durable limiter is missing.
- Email OTP credentials consume a login ticket with `consumeOtpLoginTicket`.
- Ticket consumption is atomic on unused, verified, unexpired ticket rows.
- Non-customer OTP login is rejected.
- Account pages are server-protected by `proxy.ts` using `getToken`.

## Email Send Path

`lib/email/send.ts`:

- Uses Resend when `RESEND_API_KEY` is configured.
- Falls back to SMTP when SMTP host/user/password are configured.
- Falls back to a development mock log when no transport is configured.
- Returns `true` or `false`; provider exceptions are caught.
- Provider errors are logged through `createLogger`, which redacts email-like strings, phone-like strings, auth tokens, OTP labels, challenge/login/registration tokens, generic token labels, secrets, passwords, cookies, authorization headers, and raw body fields.

## Challenge Storage and Replay Protection

`db/queries/auth-otp.ts` and `db/schema.ts` provide:

- `auth_otp_challenges.challenge_token_hash` unique index.
- `auth_otp_challenges.login_ticket_hash` unique index when not null.
- `attempts` and `maxAttempts`, default max attempts 5.
- `verifiedAt`, `consumedAt`, challenge expiry, login ticket expiry.
- `markOtpChallengeVerified` requires `verifiedAt is null`, `consumedAt is null`, unexpired challenge, and attempts below max.
- `consumeOtpLoginTicket` requires unused, verified, unexpired ticket and challenge.

## Expiry and Limits

- OTP code expiry: 5 minutes.
- Max challenge expiry: 10 minutes.
- Login ticket expiry: 3 minutes.
- Registration ticket expiry: 5 minutes.
- OTP start per IP: 15 per 600 seconds.
- OTP start per identifier: 5 per 60 seconds.
- OTP verify per challenge token hash: 8 per 60 seconds.
- Challenge max attempts: default 5.
- Registration complete per token hash: 5 per 60 seconds.
- Password auth: 5 per 5 minutes per hashed IP plus hashed email.

## Failure Modes

- Missing durable limiter in production non-loopback routes with `requireDurable` returns 503.
- Local/test loopback may use in-memory limiter.
- Provider email failure returns `false`; OTP start remains generic 200 but no `otp_sent` security event is written.
- Security-event write failures are swallowed and do not break auth responses.
- Email provider latency currently blocks the OTP start response because email sending is synchronous.

## Logging and Masking

- Route responses never include raw OTP values.
- Challenge tokens and login tickets are returned only to the client flow that requested them.
- Tests proved provider-error logs redact synthetic recipient strings and token-like fragments.
- Security-event DB rows intentionally store normalized identifiers for audit; these were not printed in Phase D.
