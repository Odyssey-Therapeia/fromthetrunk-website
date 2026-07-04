# SERVER_RATE_LIMIT_FIX_FINAL_REPORT

_Applied the safe, **additive** rate-limit fixes + the test type fix from the validation audit. No checkout/payment/Razorpay/cart/order/wishlist/stock/pricing/DB/migration logic changed. No auth logic changed. No deploy/push. No secrets printed._

## Verdict: ✅ CLEAN GO for server validation & rate-limit readiness
Every clean-GO blocker from the audit is now addressed or documented. All verification commands pass.

## Files changed
| File | Change |
|---|---|
| `api/hono/routes/agent-chat.ts` | + per-admin rate limit on the LLM POST |
| `api/hono/routes/geo.ts` | + per-IP rate limit on `/search` (photon proxy) |
| `api/hono/routes/search.ts` | + per-IP limit on keyword GET; + stricter durable limit on semantic POST |
| `api/hono/routes/media.ts` | + light per-admin limit on `/upload` |
| `api/hono/routes/auth-otp.ts` | + per-IP dimension on OTP `/start` (additive to existing per-identifier limit) |
| `tests/unit/checkout-idempotency.test.ts` | type-only fix (mock call assertion) — **no production code** |

All changes are pre-handler guards using the existing `rateLimitResponse` helper — **no business behavior changed**.

## Routes protected + keying + thresholds
| Route | Prefix / keying (helper appends IP) | Limit / window | Durable | Notes |
|---|---|---|---|---|
| `agent-chat` POST (LLM) | `agent:chat:{adminUserId}` + IP | 30 / 60s | ✅ | admin-only; runaway/cost cap |
| `geo /search` | `geo:search` + IP | 30 / 60s | — (memory) | fail-open so checkout address autocomplete never hard-fails; edge-cached anyway |
| `search /` (keyword GET) | `search:keyword` + IP | 60 / 60s | — (memory) | public browsing resilient |
| `search /semantic` POST | `search:semantic` + IP | 10 / 60s | ✅ | expensive (embeddings) → stricter + durable |
| OTP `/start` (new IP cap) | `auth:otp:start:ip` + IP | 15 / 600s | ✅ | across ALL identifiers; blocks spraying |
| OTP `/start` (existing) | `…:{purpose}:{type}:{hash(identifier)}` + IP | 5 / 60s | ✅ | **unchanged** |
| `media /upload` | `media:upload:{adminId}` + IP | 60 / 60s | — (memory) | admin-gated; generous so bulk uploads pass |

Exceeded → existing helper returns **`429 RATE_LIMITED`** ("Too many requests. Please try again later.") + `Retry-After`. `requireDurable` fail-closes with **`503`** in production only when Upstash isn't configured (skipped on loopback → dev-safe), matching the existing OTP/payment pattern.

## Audit correction
The audit listed `agent-chat` as **"no auth."** That was **inaccurate** — the route already enforces `authUser.role === "admin"` (401 otherwise). So it was never public; the added rate limit is a **defense-in-depth cost/DoS cap**, not access control. (No auth logic was added or changed.)

## Threshold rationale / deviations
- **agent-chat 30/60s** (not the suggested 20/10min): it's an **admin-only interactive assistant**, so a 2/min cap would break normal use; 30/min still stops runaway loops and caps Anthropic cost. Keyed per admin user.
- **geo & keyword-search: memory-backed** (no `requireDurable`) so a limiter/Upstash hiccup can't 503 product browsing or checkout address entry. Semantic search is durable (expensive, worth fail-closed).
- **OTP IP cap 15/600s**: a real user touches ≤2 identifiers in 10 min; 15 blocks spraying without harming legitimate use. The existing per-identifier 5/60 is untouched.

## Deferred (documented low-risk — respecting the no-touch boundary)
- **`events/track`** — left **memory-only** (120/60s per IP). Making it durable would add an Upstash round-trip to **every analytics beacon** (latency/cost) for a non-sensitive endpoint. Accepted low-risk follow-up; not in the clean-GO exit criteria.
- **Admin product / order / import / discount mutations** — **not** rate-limited. They are **already admin-gated** (role or `ADMIN_API_SECRET`), and they operate inside the explicit **no-touch domains** (order / stock / pricing / import). Adding limits there risks (a) breaking legitimate rapid/bulk admin operations and (b) editing no-touch-domain files. Deferred with a recommended snippet: `rateLimitResponse(c.req.raw, \`admin:<op>:${adminId}\`, { limit: 30, windowSeconds: 60 })`. `media/upload` (outside no-touch) got the representative admin limit.

## Tests
- **Fixed:** `tests/unit/checkout-idempotency.test.ts` — `mock.calls[0][0]` cast to a fixed `[[ClaimEventArg]]` tuple (avoids the empty-tuple index + unknown-conversion errors) with an explicit `ClaimEventArg` type. Behavior of the test is unchanged.
- **Not added (to avoid fragility / secret dependence, per instructions):** route-level over-limit tests for `agent-chat` are impractical without mocking `ANTHROPIC_API_KEY` + an admin session and would hit the LLM for the sub-limit requests. The rate-limiter mechanism itself is already covered by existing limiter tests.
- **Recommended (non-fragile) follow-ups:** limiter-level tests asserting `checkRateLimit` returns `success:false` after N calls for the new prefixes; a harness test that `geo/search` returns 429 after 30 calls (public, no secrets) with limiter reset in `beforeEach`.

## tsc fix summary
`tests/unit/checkout-idempotency.test.ts:154` — the mock's `.mock.calls` was typed as an empty tuple (no declared params), so `calls[0][0]` triggered TS2493 (index on empty tuple) + TS2352 (unsafe `as` conversion). Fixed by casting `.mock.calls as unknown as [[ClaimEventArg]]` before indexing. **tsc now exits 0.**

## Command results (Part 7)
| Command | Result |
|---|---|
| `pnpm run lint` | ✅ exit 0 |
| `pnpm exec tsc --noEmit --pretty false` | ✅ **exit 0** (previously 2 test errors — now fixed) |
| `pnpm run build` | ✅ exit 0 (node 22) |
| `pnpm run test` | ✅ 137 files / **1703 tests** pass |
| `pnpm audit` | ✅ No known vulnerabilities |
| `git diff --check` | ✅ clean |

## Exit-criteria check
- agent-chat has a rate limit → ✅
- geo/search has a rate limit → ✅
- expensive search/semantic stricter → ✅ (semantic 10/60 durable vs keyword 60/60)
- OTP has IP dimension → ✅ (added; per-identifier limit preserved)
- admin mutation routes have light limits or documented reason → ✅ (media/upload limited; product/order/import documented deferral)
- tsc passes → ✅
- lint/build/test/audit/diff-check pass → ✅
- no payment/auth/cart/order/db/migration behavior changed → ✅ (only additive pre-handler rate guards + a test-type cast)

## Remaining accepted risks
- `events/track` memory-only (non-sensitive; documented).
- Admin product/order/import/discount mutations rely on admin-gating without a rate limit (documented; low risk given admin auth).
- Rate-limit durability depends on Upstash being configured in production (the `requireDurable` routes fail-closed to 503 if it isn't — verify Upstash env in prod).

**Server validation & rate-limit readiness: GO.**
