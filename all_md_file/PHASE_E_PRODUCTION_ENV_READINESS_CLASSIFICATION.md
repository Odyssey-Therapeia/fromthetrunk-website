# Phase E Production Env Readiness Classification

## Classification

Production env readiness is NOT VERIFIED from this machine.

Reason: `vercel` was not installed globally, `npx vercel@latest env ls` reached the Vercel CLI flow, but the local checkout is not linked to a Vercel project. No production Vercel env values were inspected.

## Local Env Presence Check

Values were not printed.

| Variable | Local status |
| --- | --- |
| SITE_URL | missing |
| NEXT_PUBLIC_SERVER_URL | present |
| NEXTAUTH_URL | present |
| NEXTAUTH_SECRET | present |
| AUTH_OTP_SECRET | present |
| AUTH_OTP_TOKEN_SECRET | present |
| DATABASE_URL | present |
| KV_REST_API_URL | present |
| KV_REST_API_TOKEN | present |
| UPSTASH_REDIS_REST_URL | missing |
| UPSTASH_REDIS_REST_TOKEN | missing |
| RESEND_API_KEY | present |
| RESEND_FROM_EMAIL | present |
| SMTP_HOST | missing |
| SMTP_USER | missing |
| SMTP_PASSWORD | missing |
| SMTP_FROM | missing |
| RAZORPAY_KEY_ID | present |
| NEXT_PUBLIC_RAZORPAY_KEY_ID | present |
| RAZORPAY_KEY_SECRET | present |
| RAZORPAY_WEBHOOK_SECRET | present |
| CRON_SECRET | missing |
| NEXT_PUBLIC_GTM_ID | missing |
| NEXT_PUBLIC_GA_ID | missing |
| NEXT_PUBLIC_CLARITY_PROJECT_ID | missing |
| NODE_ENV | missing in .env.local |
| VERCEL_ENV | missing in .env.local |

## Derived Local Classification

- Durable rate limiter: present through KV env pair.
- Email provider: Resend-capable locally.
- Razorpay public/private key ID pair: present and matching locally.
- Analytics provider envs: missing locally.

## Production Owner Actions

- Link this checkout to the Vercel project or run `vercel env ls` from a linked checkout.
- Verify production, preview, and development env presence by name only.
- Confirm production `NEXTAUTH_URL` and public server URL use the final HTTPS domain.
- Confirm all auth, OTP, Razorpay, email, rate-limit, database, and cron secrets exist in production.
- Do not expose values in logs, screenshots, reports, or chat.

## Launch Classification

NO-GO for production launch until production envs are verified on the actual Vercel project.

