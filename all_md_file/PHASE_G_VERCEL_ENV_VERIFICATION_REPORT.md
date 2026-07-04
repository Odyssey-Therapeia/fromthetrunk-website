# Phase G Vercel Environment Verification Report

Date: 2026-07-03
Decision: NO-GO.

## What Was Verified

Local Vercel linkage:

- `.vercel/project.json`: absent.
- Global `vercel` CLI: not found in shell.
- Result: the local checkout cannot verify or manage Vercel env vars through the linked-project CLI path.

Vercel connector metadata:

- Team observed: Odyssey Therapeia.
- Project observed: `fromthetrunk-website`.
- Project id observed: `prj_F3PAf1IjAV1mCDBPNI0B7rIbWRt4`.
- Framework: Next.js.
- Project Node version setting: `24.x`.
- Latest connector-visible production deployment: `READY`.
- Connector-visible production deployment URL: `fromthetrunk-website-2e0p5okgf-odyssey-therapeia.vercel.app`.
- Connector-visible domains did not list `www.fromthetrunk.shop`.

Public HTTP probe:

- `https://www.fromthetrunk.shop/`: HTTP 200.
- `https://www.fromthetrunk.shop/robots.txt`: HTTP 200.
- `https://www.fromthetrunk.shop/sitemap.xml`: HTTP 200.
- `https://fromthetrunk-website-2e0p5okgf-odyssey-therapeia.vercel.app/robots.txt`: HTTP 302 to Vercel SSO and `x-robots-tag: noindex`.

Interpretation:

- The public custom domain is reachable.
- The connector-visible production deployment URL is SSO-protected.
- The connector-visible project metadata did not prove that `www.fromthetrunk.shop` is attached to the inspected Vercel project.
- Environment variable presence and classification remain unverified.

## Required Production Environment Variables

No values were printed or inspected. Status below means whether Phase G could verify safe presence/classification.

| Variable / Class | Production status | Notes |
| --- | --- | --- |
| `SITE_URL` | UNKNOWN | Must resolve to `https://www.fromthetrunk.shop`. |
| `NEXT_PUBLIC_SERVER_URL` | UNKNOWN | Must match the production public origin. |
| `NEXTAUTH_URL` | UNKNOWN | Must match the production auth callback origin. |
| `NEXTAUTH_SECRET` | UNKNOWN | Required for production auth/session integrity. |
| `AUTH_OTP_SECRET` | UNKNOWN | Required for OTP token safety. |
| `AUTH_OTP_TOKEN_SECRET` | UNKNOWN | Required for OTP token safety. |
| `DATABASE_URL` | UNKNOWN | Must point to the intended production Neon database. |
| KV / Upstash limiter vars | UNKNOWN | Durable rate limiting must be present and fail closed. |
| Resend/email provider vars | UNKNOWN | Email provider readiness not verified in production. |
| Razorpay live key vars | UNKNOWN | Presence and live/test classification not verified. |
| `CRON_SECRET` | UNKNOWN | Required if production cron endpoints are enabled. |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` | UNKNOWN | Must be absent, empty, or false in production. |

## Required Preview/Staging Environment Variables

| Variable / Class | Preview/staging status | Notes |
| --- | --- | --- |
| Approved staging URL | UNKNOWN | Connector-visible branch deployment is SSO-protected. |
| Razorpay mode | UNKNOWN | Must be test-only outside production. |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` | UNKNOWN | Must be absent, empty, or false. |
| Staging `DATABASE_URL` | UNKNOWN | Must not point to production unless explicitly intended. |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_SERVER_URL` | UNKNOWN | Must match approved staging origin. |
| KV / Upstash limiter vars | UNKNOWN | Must be present for deployed auth/OTP rate limiting. |

## Hard Blockers

- Production env var presence cannot be verified from this checkout because the Vercel CLI is unavailable and the repo is not locally linked.
- The available connector metadata does not prove ownership of `www.fromthetrunk.shop` by the inspected project.
- Razorpay live/test classification is unknown.
- Production database target is unknown.
- Durable limiter environment is unknown.
- Auth and OTP secrets are unknown.
- `ALLOW_UNSAFE_LIVE_PAYMENTS` classification is unknown.

## Required Next Action

Before cutover, an owner with Vercel access must verify the production and preview/staging env vars in Vercel without exposing values, then record:

- present/missing,
- environment scope,
- live/test/safe classification where applicable,
- exact project and domain ownership,
- whether each blocking var is safe for deploy.
