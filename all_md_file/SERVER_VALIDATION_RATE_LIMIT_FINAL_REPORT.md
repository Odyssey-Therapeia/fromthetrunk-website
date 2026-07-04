# SERVER_VALIDATION_RATE_LIMIT_FINAL_REPORT

_Audit-first backend safety pass. **No code was changed** by this audit (read-only). No migrations, no deploy, no push, no secrets printed._

## Executive verdict: 🟡 CONDITIONAL GO
The **core server-safety backbone is production-ready**: every sensitive mutation route validates input, auth/ownership is enforced, CSRF+CORS+host-guard are correct, payments are idempotent/rate-limited/server-authoritative, webhooks verify signatures and dedupe, cron requires secrets, and no secrets are logged. **The only thing blocking a clean GO** is the audit's "rate limits exist for abuse-prone routes" gate: **`agent-chat` (an unauthenticated LLM endpoint) has no rate limit** (cost/DoS), and `geo`/`search` have none either. These are **safe, additive** fixes (no payment/auth/cart logic touched). Fix `agent-chat` before/at launch; `geo`/`search` shortly after.

## 1. Route inventory
See `SERVER_VALIDATION_RATE_LIMIT_AUDIT.md`. 37 Hono route files + 3 Next handlers, all behind global CSRF + non-wildcard credentialed CORS + auth middleware.

## 2. Validation gaps
- None on money/stock/ownership-bearing routes (server recomputes totals & availability; params/bodies validated via zod).
- Minor: `geo.q` lacks a max length; `agent-chat.messages` is `array(unknown)` (validated downstream) — acceptable, but the route needs auth/limits.

## 3. Auth / ownership gaps
- **None.** `requireAuth` on account/orders/wishlist/addresses/users/checkout; ownership = `admin | userId | guest-email-claim`; admin routes via `requireAdmin` (role or `ADMIN_API_SECRET`); cart uses reservation-token proof. `admin-debug` prod-gated. No private route accidentally public.

## 4. Rate-limit gaps
See `SERVER_RATE_LIMIT_MATRIX.md`. Present + durable: OTP (per-hashed-identifier), payment create-order (per-user) + repay, contact (IP+identifier), newsletter, discount-validate, cart-reserve, site-feedback. **Gaps:**
- 🔴 `agent-chat` POST (LLM) — no auth + no limit.
- 🟠 `geo /search`, `search` GET + semantic POST — no limit.
- 🟡 `events/track` memory-only (not durable); `admin-*` mutations no limit (admin-gated).
- Recommend adding an **IP-only** cap to OTP-start alongside the per-identifier one.

## 5. Payment-specific recheck (audit-only — no payment logic changed)
| Check | Result |
|---|---|
| create-order validates body (`createPaymentOrderSchema`) | ✅ |
| recomputes totals server-side (`calculateOrderTotals`) | ✅ |
| checks availability server-side (concurrency-safe stock UPDATE + reservations) | ✅ |
| create-order rate limit (`payment:create:{userId}` 5/60 durable) | ✅ |
| checkoutAttemptId / Idempotency-Key support | ✅ (`findReusablePaymentOrder`, `recordPaymentAttempt`) |
| retry reuses same pending order when safe | ✅ (dedupe at `payments.ts:330`) |
| duplicate requests don't duplicate stock holds | ✅ (attempt reuse + reservation UPDATE) |
| live keys blocked on localhost/`*.vercel.app` | ✅ (`evaluatePaymentHost` → 403) |
| `ALLOW_UNSAFE_LIVE_PAYMENTS` not required for staging | ✅ (staging uses test keys) |
| Razorpay `notes` free of sensitive PII | ✅ (orderId/userId/attemptId only) |
| webhook verifies raw-body HMAC (`timingSafeEqual`) | ✅ |
| webhook dedupes event id (`razorpay_webhook:{id}`) | ✅ |
| webhook idempotent (skips already-paid orders) | ✅ (`webhooks.ts:161`) |
| webhook returns quickly | ✅ (synchronous coded response) |
| pending-hold cleanup documented | ✅ cron `/release-reservations` (+ expiry reminders) |

## 6. CSRF / origin / CORS
See `SERVER_ORIGIN_CSRF_CORS_AUDIT.md`. **GO** — global mutation CSRF guard, non-wildcard credentialed CORS, payment host guard (test-on-vercel / live-only-on-prod / 403 on unsafe host), canonical host rejects preview origins. No flags.

## 7. Webhook / cron
- Webhook `/razorpay`: raw-body HMAC + `timingSafeEqual` + event-id dedupe + idempotent. ✅
- Cron (release-reservations, refresh-channel-metrics, send-reservation-expiry-reminders, weekly-ops-digest): each requires `CRON_SECRET` + constant-time `verifyBearerSecret`. ✅

## 8. Logging / security
See `SERVER_ERROR_LOGGING_AUDIT.md`. **GO** — no secret/`DATABASE_URL`/token/full-PII logging; masked email + redacted phone + hashed identifiers; coded, user-safe error responses; generic 500 via `onUncaughtError`; `X-Request-Id`.

## 9. Tests
**Existing coverage (verified passing):** `webhooks-signature.test.ts`, `webhooks-route.test.ts`, `payments-route.test.ts`, `order-charge-totals-route.test.ts`, `order-selected-options.test.ts`, `security-phase-4-2-policy.test.ts`, `site-origin.test.ts`, `customer-accounts-p6-01.test.ts`, `app-api-surface.test.ts`, `migrated-hono-routes.test.ts`.
**Recommended to add** (no real secrets required):
- invalid body / unknown field / bad enum / overlong string rejected (per schema).
- unauthenticated private route → 401; non-owner order/address/wishlist → 403; non-admin admin mutation → 403.
- OTP + create-order rate-limit exceed → 429; create-order duplicate `checkoutAttemptId` reuses order.
- live-key on `*.vercel.app` → 403 `PAYMENT_HOST_NOT_ALLOWED`.
- webhook bad signature → reject; duplicate event id → ignored.
- cron without secret → 401.
- **New:** once limits added, `agent-chat` / `geo` / `search` rate-limit exceed → 429.

## 10. Commands (Part 9)
| Command | Result |
|---|---|
| `pnpm audit` | ✅ No known vulnerabilities |
| `pnpm run lint` | ✅ exit 0 |
| `pnpm run test` | ✅ 137 files / **1703 tests** pass |
| `pnpm run build` | ✅ exit 0 (last run this session on unchanged code) |
| `git diff --check` | ✅ clean |
| `pnpm exec tsc --noEmit` | ⚠️ **2 type-only errors in `tests/unit/checkout-idempotency.test.ts`** — pre-existing/committed, not from this audit, does **not** affect `vitest run` or `next build` (test files are outside the build graph). Blocker: **no**. Fix: correct the `mock.calls[0][0] as {...}` assertion. |

> Note: uncommitted `.ts` changes in the tree (`orders.ts`, `payments.ts`, order pages, `order-payment-actions.tsx`, etc.) are from **prior feature work** (repay/reorder), not this audit.

## Final gate table
| Gate | Verdict |
|---|---|
| Sensitive mutation routes validate input | ✅ GO |
| Auth / ownership enforced | ✅ GO |
| Rate limits for abuse-prone routes | 🟡 **PARTIAL** — OTP/payment/contact/etc ✅; **`agent-chat`/`geo`/`search` missing** |
| Payment create-order idempotent + rate-limited | ✅ GO |
| Webhooks verify signature + dedupe | ✅ GO |
| Cron requires secrets | ✅ GO |
| CSRF / CORS / host guard | ✅ GO |
| No secrets logged | ✅ GO |
| lint / typecheck / build / tests pass or documented | ✅ (tsc test-file error documented) |
| **Server validation & rate-limit readiness** | 🟡 **CONDITIONAL GO** |

### Blockers / risks / fixes
- **High (blocks clean GO):** `agent-chat` LLM endpoint — no auth, no rate limit → cost/DoS. **Safe quick fix:** add `rateLimitResponse(c.req.raw, "agent:chat", { limit: 20, windowSeconds: 60, requireDurable: true })` (+ optionally require auth / per-session cap). Approval required to edit the route.
- **Medium:** add per-IP limits to `geo /search` and `search` (GET + semantic POST).
- **Low:** durable-ize `events/track`; add per-admin limit to admin mutations; add IP dimension to OTP-start; add `.max()` to `geo.q`; fix the `checkout-idempotency.test.ts` type assertion.
- **No blockers** in auth/ownership/payment/webhook/cron/CSRF/logging.

**Recommendation:** approve the small additive rate-limit fixes (starting with `agent-chat`) → then this flips to a clean **GO**. All fixes are outside the no-touch boundary (payments/auth/cart/order logic unchanged).
