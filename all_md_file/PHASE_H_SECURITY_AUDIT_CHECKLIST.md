# Phase H Security Audit Checklist

Date: 2026-07-03
Result: PARTIAL source-level GO, production NO-GO

## Codex Security Scan Limitation

The Codex Security `security_scan` config preflight was run. It returned incomplete because delegated workers / active multi-agent mode were not available in this context. Therefore this file is a parent-agent source checklist, not a delegated exhaustive repository security scan.

No secrets were printed. No destructive command was run.

## Checklist

| Area | Source status | Production status | Evidence |
| --- | --- | --- | --- |
| Live Razorpay unsafe-host block | GO | UNKNOWN | `lib/payments/payment-host-guard.ts:2-72` blocks live keys on localhost, `.vercel.app`, and similar unsafe hosts unless explicit escape hatch is set. |
| Razorpay customer notifications | GO | UNKNOWN | `lib/payments/razorpay.ts:120-154` only enables customer notifications for live HTTPS on `www.fromthetrunk.shop`. |
| Razorpay signature checks | GO | UNKNOWN | `lib/payments/razorpay.ts:34` and `api/hono/routes/webhooks.ts:229` use timing-safe comparisons. |
| Webhook dedupe | GO | UNKNOWN | `api/hono/routes/webhooks.ts:241` calls `claimEvent`. |
| Webhook secret requirement | GO | UNKNOWN | `api/hono/routes/webhooks.ts:206` requires webhook secret config. |
| Same-origin mutation guard | GO | UNKNOWN | `api/hono/middleware/same-origin.ts:36-114` checks Origin and `sec-fetch-site`. |
| CORS posture | GO | UNKNOWN | Same-origin middleware is mounted in `api/hono/app.ts`. |
| API docs exposure | GO | UNKNOWN | `api/hono/app.ts:67` and `lib/http/api-docs-policy.ts:1` expose docs only when policy allows. Public preview returned 404 for docs in prior live check. |
| Security headers | PARTIAL | PARTIAL | `next.config.ts:75-100` sets frame, nosniff, referrer, permissions, HSTS, and CSP report-only. CSP is not enforcing. |
| Checkout frame allowance | GO | UNKNOWN | `next.config.ts:110` relaxes checkout frame policy for Razorpay modal only. |
| Durable rate limits | GO | UNKNOWN | `lib/http/rate-limit.ts:22-87` can fail closed in production; many sensitive routes set `requireDurable: true`. |
| Durable adapter selection | GO | UNKNOWN | `lib/ports/rate-limiter.ts:38-49` selects Upstash/Vercel KV-style REST credentials when present. |
| OTP/rate-limited auth paths | GO | UNKNOWN | `api/hono/routes/auth-otp.ts` has multiple `requireDurable: true` call sites. |
| Payment create/repay rate limits | GO | UNKNOWN | `api/hono/routes/payments.ts:507` and `api/hono/routes/payments.ts:1175`. |
| Cart reserve/release limits | GO | UNKNOWN | `api/hono/routes/cart.ts:52`, `:176`, `:313`. |
| Contact/newsletter/site feedback limits | GO | UNKNOWN | `api/hono/routes/contact.ts`, `newsletter.ts`, and `site-feedback.ts` use durable-required limits. |
| Secret redaction in logs | GO | UNKNOWN | `lib/log.ts` redacts known sensitive keys and string patterns. |
| Account order/address/wishlist isolation | GO local | UNKNOWN deployed | Source routes require auth and scope by user/admin ownership; browser tests pass locally. |
| JSON-LD/XSS handling | GO | UNKNOWN | SEO JSON-LD uses `safeJsonLd`; CMS rich text uses sanitizer. Theme token injection remains acceptable only if admin input stays trusted and monitored. |
| Tracked env files | GO local | UNKNOWN deployed | `.env.local` is not tracked; only `.env.production.example` appeared tracked in prior check. |

## Production Blockers

- Production env values cannot be verified in this environment.
- Production DB identity and DDL are not verified.
- Deployed HTTPS auth/cookie behavior is not verified.
- Razorpay live/test mode separation is not verified in Vercel production.
- CSP is report-only, so enforcing CSP is a post-launch hardening decision unless owner requires it before launch.

## Launch Decision

Security source posture is materially improved, but production security readiness is NO-GO until env, DB, deployed auth, Razorpay, and DDL checks are owner-verified.

