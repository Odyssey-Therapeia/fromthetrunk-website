# SERVER_ORIGIN_CSRF_CORS_AUDIT

_Audit-only (Part 6). Source: `api/hono/middleware/same-origin.ts`, `lib/payments/payment-host-guard.ts`, `lib/seo/site-url.ts`, `next.config.ts`._

## CSRF / same-origin (browser mutations)
- **`sameOriginMutationGuard`** runs globally on every `/api/v2/*` request. For `POST/PATCH/PUT/DELETE` it enforces:
  1. `Origin` must be an **allowed origin** — a configured origin (`NEXT_PUBLIC_SERVER_URL`, `NEXTAUTH_URL`) **or** `URL(origin).host === Host` header (covers localhost, LAN testing, prod-behind-proxy while rejecting true cross-site). Else `403 FORBIDDEN_ORIGIN`.
  2. `sec-fetch-site` (if present) must be `same-origin | same-site | none`. Else `403`.
  - **No-Origin requests pass** (`!origin → allowed`) → server-to-server **webhooks and cron are not blocked** by CSRF ✅ (they're independently protected by signature / secret).
- ✅ Every browser mutation route is behind this guard (mounted before all route registrations). No mutation route bypasses it.

## CORS
- **`sameOriginCors`** = `hono/cors` with `credentials: true` and an **origin allow-function** (echoes the request Origin only when `isAllowedBrowserOrigin` is true, else returns `null` → not allowed). **No wildcard** (`origin: "*"` / `origin: true`) anywhere — grep confirms none. ✅
- `allowHeaders`: Authorization, Content-Type, X-Requested-With. `allowMethods`: standard set. `maxAge: 600`. Exposes only safe headers (Retry-After, Server-Timing, cache flags, rate-limit remaining, request id).
- ✅ Not wildcard for credentialed routes (the required invariant).

## Payment host guard (live-key safety)
- `lib/payments/payment-host-guard.ts` → `evaluatePaymentHost(url)`: **blocklist** of `*.vercel.app` / `vercel.app` / localhost. When Razorpay keys are **live** (`rzp_live_`) on a blocked host → not allowed, unless `ALLOW_UNSAFE_LIVE_PAYMENTS === "true"`.
- Invoked in `create-order` (`payments.ts:315`) and the new `repay` route → returns **`403 PAYMENT_HOST_NOT_ALLOWED`** on unsafe hosts.
- Matches required behavior: **test keys allowed on `*.vercel.app`; live keys only on `www.fromthetrunk.shop`; live keys on `*.vercel.app` → 403**. `ALLOW_UNSAFE_LIVE_PAYMENTS` is **not** required for staging (staging uses test keys). ✅

## Canonical host / origin config
- `lib/seo/site-url.ts` → `DEFAULT_CANONICAL_ORIGIN = "https://www.fromthetrunk.shop"`; explicitly rejects `localhost` / `*.vercel.app` from becoming canonical (prevents preview hosts leaking into canonicals). `lib/seo/image-urls.ts` also rejects `*.vercel.app`. ✅
- `next.config.ts` security headers present on all routes (HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP report-only). CSP `frame-src`/`frame-ancestors` scoped to self + Razorpay.

## Flag checklist
| Flag | Result |
|---|---|
| Wildcard CORS with credentials | ✅ none |
| Mutation route without origin/CSRF guard | ✅ none (global guard) |
| Webhook without signature | ✅ none (`/razorpay` verifies HMAC) |
| Cron without secret | ✅ none (all 4 jobs verify `CRON_SECRET`) |
| Live payment on unsafe host | ✅ blocked (403) |

**Origin/CSRF/CORS/host: GO.** No findings.
