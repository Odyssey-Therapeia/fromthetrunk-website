# SERVER_RATE_LIMIT_MATRIX

_Audit-only. Rate-limiter: `lib/http/rate-limit.ts` → port `lib/ports/rate-limiter.ts`, in-memory adapter by default, **durable Upstash adapter when configured** (`isDurableRateLimiterConfigured()`). Key = `getRateLimitKey(request, prefix)` = `prefix + last-hop x-forwarded-for` (last hop is hardest to forge behind Vercel). `requireDurable: true` forces the durable backend. Exceed → `429` + `Retry-After`._

| Route | Current limit | Keying | Window | Durable | Serverless-safe | Bypass risk | Recommended |
|---|---|---|---|---|---|---|---|
| **OTP start** (`auth-otp`) | 5 | `auth:otp:start:{purpose}:{type}:{hash(identifier)}` + IP | 60s | ✅ | ✅ | low (per hashed identifier) | keep; **add IP-only cap** (e.g. 20/10m) to stop identifier-spraying from one IP |
| **OTP verify** (`auth-otp`) | ✅ present (4 RL calls across start/verify/resend) | per-identifier + IP | short | ✅ | ✅ | low | keep; ensure verify caps failed attempts (lockout) |
| **contact submit** | 5 (IP) + per-identifier | `contact:submit:ip` + identifier | 10m | ✅ | ✅ | low | keep |
| **newsletter subscribe** | 3 | `newsletter:sub` + IP | 60s | ✅ | ✅ | low | keep |
| **discount validate** | 20 | `discount:validate` + IP | 60s | ✅ | ✅ | low | keep (anti brute-force) |
| **site-feedback** | ✅ durable | per-IP | — | ✅ | ✅ | low | keep |
| **cart reserve** | ✅ (4 RL calls) | per-IP | — | ✅ | ✅ | low | keep |
| **payment create-order** | 5 | `payment:create:{userId}` | 60s | ✅ (`requireDurable`) | ✅ | low (per user) | keep — **+ checkoutAttemptId/Idempotency-Key dedupe** |
| **payment repay** (new) | 10 | `payment:repay:{userId}` | 60s | ✅ | ✅ | low | keep |
| **events/track** | 120 | `events:track` + IP | 60s | ⚠️ **memory-only** | partial (per-instance) | medium | make **durable** (analytics abuse cap survives instances) — low priority, must not break UX |
| **geo /search** | ⚠️ **none** | — | — | — | edge-cached (`s-maxage=86400`) | medium | **add** per-IP limit (e.g. 30/60s) — proxy-cost/DoS |
| **search GET / semantic POST** | ⚠️ **none** | — | — | — | — | medium | **add** per-IP limit; stricter on semantic (embeddings/compute) e.g. 15/60s |
| **agent-chat POST** (LLM) | ⚠️ **none** + **no auth** | — | — | — | — | **HIGH** | **add** per-IP + per-session limit (LLM cost/DoS); consider requiring auth or a soft cap |
| **admin mutations** (`admin-*`, product/collection/page/theme writes) | ⚠️ none | — | — | — | admin-gated | low | add a modest per-admin limit (defense-in-depth) |
| **webhooks** `/razorpay` | none (by design) | n/a | n/a | n/a | ✅ | n/a | **do NOT IP-limit** — relies on HMAC + event-id dedupe ✅ |
| **cron** jobs | none (by design) | n/a | n/a | n/a | ✅ | n/a | rely on `CRON_SECRET` ✅ |

## Notes vs the audit's explicit requirements
- **OTP/login stricter per-phone/email + IP:** per-identifier + durable ✅; recommend adding an **IP-only** dimension to prevent one IP enumerating many identifiers.
- **create-order user/session + cart/attempt protection:** ✅ (`payment:create:{userId}` + `checkoutAttemptId`/`Idempotency-Key` reuse of the pending order).
- **events/track abuse protection without breaking UX:** ✅ present (120/60 per IP) — recommend durable, but generous limit already avoids UX breakage.
- **webhooks not blocked by generic IP limits:** ✅ (no IP limit; signature + idempotency).
- **cron via CRON_SECRET:** ✅.
- **admin mutation routes rate-limited + admin-protected:** admin-protected ✅; rate limit ⚠️ missing (low risk, recommend adding).

## Rate-limit gaps summary (all are **safe, additive** fixes — no payment/auth/cart logic change)
1. 🔴 **`agent-chat`** — unauthenticated LLM endpoint with no limit → cost/DoS. **Highest priority.**
2. 🟠 **`geo /search`** and **`search` (GET + semantic POST)** — no limit.
3. 🟡 **`events/track`** — durable-ize; **admin mutations** — add modest per-admin limit.
