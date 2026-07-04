# Phase F Production Env Verification Checklist

Status: NO-GO until owner verifies actual Vercel Production and Preview/Staging environment variables.

## Local Vercel Access

Result:
- `.vercel/project.json`: absent
- global `vercel` CLI: not found

Because this checkout is not linked and no global Vercel CLI exists, `vercel env ls` was not run. Running an env command in this state would prompt for linking/login and would not provide reliable production evidence.

## Production Checklist

Do not print values. Verify names, environment, and high-level classification only.

| Variable | Expected production classification | Status |
| --- | --- | --- |
| `SITE_URL` | `https://www.fromthetrunk.shop` | UNKNOWN - owner action |
| `NEXT_PUBLIC_SERVER_URL` | `https://www.fromthetrunk.shop` | UNKNOWN - owner action |
| `NEXTAUTH_URL` | `https://www.fromthetrunk.shop` | UNKNOWN - owner action |
| `NEXTAUTH_SECRET` | present | UNKNOWN - owner action |
| `AUTH_OTP_SECRET` | present | UNKNOWN - owner action |
| `AUTH_OTP_TOKEN_SECRET` | present | UNKNOWN - owner action |
| `DATABASE_URL` | present and production DB | UNKNOWN - owner action |
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | present | UNKNOWN - owner action |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | present | UNKNOWN - owner action |
| `RESEND_API_KEY` or approved email provider | present | UNKNOWN - owner action |
| `RESEND_FROM_EMAIL` | present and approved sender | UNKNOWN - owner action |
| `RAZORPAY_KEY_ID` | live key | UNKNOWN - owner action |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | matching live public key | UNKNOWN - owner action |
| `RAZORPAY_KEY_SECRET` | present | UNKNOWN - owner action |
| `RAZORPAY_WEBHOOK_SECRET` | present | UNKNOWN - owner action |
| `CRON_SECRET` | present if cron enabled | UNKNOWN - owner action |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` | empty or false | UNKNOWN - owner action |
| Analytics envs | only if approved | UNKNOWN - owner action |

## Preview/Staging Checklist

| Item | Expected staging classification | Status |
| --- | --- | --- |
| URL | `https://fromthetrunk-website.vercel.app` or approved staging URL | UNKNOWN - owner action |
| Razorpay keys | test keys only | UNKNOWN - owner action |
| Live Razorpay key | absent from preview/staging | UNKNOWN - owner action |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` | empty or false | UNKNOWN - owner action |
| `DATABASE_URL` | intentionally staging/local-test DB | UNKNOWN - owner action |
| `NEXTAUTH_URL` | exactly matches staging URL | UNKNOWN - owner action |

## Launch Classification

Production env readiness: NO-GO.

Required owner action:
1. Link the Vercel project locally or verify through Vercel dashboard.
2. Confirm each Production and Preview/Staging variable by name and environment without sharing values.
3. Confirm preview/staging cannot use live Razorpay keys.
4. Confirm `ALLOW_UNSAFE_LIVE_PAYMENTS` is not enabled anywhere public.
