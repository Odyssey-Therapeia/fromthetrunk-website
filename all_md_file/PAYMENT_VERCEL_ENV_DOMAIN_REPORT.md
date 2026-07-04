# Payment Vercel Env / Domain Report

Read-only audit of environment, domain, and Razorpay-mode safety for the payment
path, plus the host guard implemented in this change set. **No secret values are
printed** — only variable names and how they are used.

## Findings

### Canonical origin resolution
- `lib/seo/site-url.ts:41-62` `getCanonicalOrigin()` = `SITE_URL ?? NEXT_PUBLIC_SERVER_URL`,
  falling back to `DEFAULT_CANONICAL_ORIGIN = "https://www.fromthetrunk.shop"`. In
  `NODE_ENV=production` it rejects unsafe origins (non-https, localhost, `*.vercel.app`) and
  **warns + substitutes the default** (does not throw).
- **Payment route uses a different precedence:** `getServerOrigin()` (`api/hono/routes/payments.ts:237-238`)
  = `NEXT_PUBLIC_SERVER_URL || NEXTAUTH_URL || <request origin>`. It does **not** consult
  `SITE_URL` and falls back to the raw request host. This builds the Razorpay `callback_url`
  (`:730`) and confirmation redirects (`:240-250`). If `NEXT_PUBLIC_SERVER_URL`/`NEXTAUTH_URL`
  are unset on the deployment serving payments, the callback inherits whatever host the
  function saw.

### Razorpay key mode
- Server keys: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; webhook: `RAZORPAY_WEBHOOK_SECRET`;
  client-exposed: `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
- **No explicit test/live flag** — mode is implicit in the key prefix (`rzp_test_` / `rzp_live_`).

### Host / origin validation (before this change)
- **None.** Only a generic same-origin CSRF guard (`api/hono/middleware/same-origin.ts`) that
  checks Origin==Host internal consistency; it does **not** require the production domain.
  `create-order` had no host/domain check.

### Production vs preview detection
- Ad hoc: `NODE_ENV === "production"` in several places; `VERCEL_ENV` used only in
  `lib/cart/reservation-policy.ts`. No shared `isProduction()`/`isPreview()` helper.
  `process.env.VERCEL` is never read.

### Documented production values (names only)
- `.env.production.example:12-16` documents `SITE_URL`, `NEXT_PUBLIC_SERVER_URL`, `NEXTAUTH_URL`
  all = `https://www.fromthetrunk.shop`. `AGENTS.md:24` confirms production = `www.fromthetrunk.shop`.

## Rules (target state)

1. Production checkout should run on **https://www.fromthetrunk.shop**.
2. Preview/staging must use **Razorpay test keys** only.
3. **Live** Razorpay keys must not be used on preview/staging/`vercel.app` unless explicitly approved.
4. The payment API should **reject** live-mode payments on unsafe hosts.
5. Never print secret values (respected).

## Host guard — implemented

`lib/payments/payment-host-guard.ts` + wired into `create-order` (`api/hono/routes/payments.ts`,
right after body parse):

- **Test mode** (`rzp_test_*` or no live key): allowed on every host (test money is safe).
- **Live mode** (`rzp_live_*`): **blocked** on `*.vercel.app`, `localhost`, `127.0.0.1`,
  `0.0.0.0`, `*.local` → `403 PAYMENT_HOST_NOT_ALLOWED` (logs only the reason code, no secrets).
- Design is a **targeted blocklist**, not an allowlist, so it never breaks live checkout on the
  real custom domain even if env vars drift.
- Escape hatch: `ALLOW_UNSAFE_LIVE_PAYMENTS=true` re-allows (for the "unless explicitly approved"
  case).

Tests: `tests/unit/payment-host-guard.test.ts` (test-mode-anywhere, live-blocked-on-vercel/localhost,
live-allowed-on-custom-domain, override, host classification, mode detection).

## Owner action items (config, not code)

1. **Vercel Production Branch mismatch.** The production log showed `Branch: Staging` while repo
   policy (`AGENTS.md:26`, `docs/branch-policy.md`) says production = `main`. Confirm/repoint the
   Vercel **Production Branch** to `main` (project setting; not representable in-repo).
2. **Confirm production env vars** on the production deployment: `SITE_URL`,
   `NEXT_PUBLIC_SERVER_URL`, `NEXTAUTH_URL` all = `https://www.fromthetrunk.shop`; a `rzp_live_*`
   key pair; `RAZORPAY_WEBHOOK_SECRET` set; Razorpay dashboard **webhook URL** =
   `https://www.fromthetrunk.shop/api/v2/webhooks/razorpay`.
3. **Preview/staging** deployments must carry `rzp_test_*` keys (the guard blocks live there
   regardless, but tests keys are the correct config).
4. Optionally set `NEXT_PUBLIC_SERVER_URL`/`NEXTAUTH_URL` on every payment-serving deployment so
   the Razorpay `callback_url` never falls back to the raw request host.
