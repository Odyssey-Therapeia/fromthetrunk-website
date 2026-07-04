# Phase E HTTPS Cookie Auth Deployment Checklist

## Local Code Evidence

- Auth route: `app/api/auth/[...nextauth]/route.ts`.
- Auth config: `lib/auth/options.ts`.
- Auth config uses NextAuth defaults for cookies and does not define a custom `cookies` block.
- Session strategy is JWT.
- Password login fails closed in production if durable rate limiting is not configured.
- OTP secrets are required by `lib/auth/otp.ts`.

## Deployment Checklist

- Production `NEXTAUTH_URL` must be `https://www.fromthetrunk.shop` or the approved final HTTPS canonical host.
- Production public server URL must also be HTTPS and match the deployed storefront host strategy.
- `NEXTAUTH_SECRET` must be present in production.
- `AUTH_OTP_SECRET` must be present in production.
- `AUTH_OTP_TOKEN_SECRET` must be present in production.
- Durable rate-limit env pair must be present in production before password and OTP auth are considered launch-ready.
- Confirm auth cookies are emitted with secure behavior over the HTTPS production domain.
- Confirm sign-in, OTP login, account pages, checkout session reads, and sign-out over the deployed HTTPS preview/custom domain.
- Confirm cross-domain redirects do not downgrade from HTTPS or localhost.
- Confirm no callback URL permits open redirect or localhost in production.

## Verification Status

Not verified on production HTTPS. Local CLI could not inspect linked Vercel production envs, and no production browser auth flow was run.

## Launch Classification

NO-GO for production auth/cookie readiness until the HTTPS deployed-domain checklist above is run against the actual deployment.

