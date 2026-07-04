# SERVER_VALIDATION_RATE_LIMIT_AUDIT

_Audit-only, read-only. **No code changed** by this pass. Covers Parts 1–3 (route inventory, validation, auth/ownership)._

## Global middleware chain (applies to ALL `/api/v2/*`)
`api/hono/site-app.ts` mounts, in order: perf timer → **`sameOriginCors`** (credentialed CORS, non-wildcard — echoes Origin only if it's a configured origin or Origin-host == Host) → **`sameOriginMutationGuard`** (CSRF: POST/PATCH/PUT/DELETE require an allowed Origin **and** `sec-fetch-site ∈ {same-origin, same-site, none}`; no-Origin server-to-server requests pass, so webhooks/cron aren't blocked) → **`authMiddleware`** (populates `authUser`). API docs (`/docs`, `/openapi.json`) gated by `shouldExposeApiDocs()`.

Auth helpers (`api/hono/middleware/auth.ts`): `requireAuth` → 401 if no session; `requireAdmin` → admin role **or** constant-time `ADMIN_API_SECRET` bearer, else 403.

Next handlers: `app/api/auth/[...nextauth]` (NextAuth), `app/api/preview` (draft-mode), `app/api/v2/[...route]` (Hono catch-all).

## Route inventory (by file; public reads omitted where trivial)
Legend — Auth: ✅required / — public / A=admin. RL=rate-limited. Own=ownership. Val=schema-validated.

| Route file | Sensitive routes | Auth | Own | RL | Val | CSRF | Risk |
|---|---|---|---|---|---|---|---|
| `payments.ts` | create-order, verify, **repay**, link/callback | ✅ (user) | ✅ | ✅ | ✅ | ✅ + host-guard + sig | core |
| `webhooks.ts` | `/razorpay` | — (sig) | n/a | rely on sig | raw HMAC | skip (no Origin) | core |
| `cron.ts` | 4 jobs (release-reservations, metrics, reminders, digest) | CRON_SECRET | n/a | n/a | — | skip (no Origin) | core |
| `auth-otp.ts` | start, verify, resend | — (pre-auth) | n/a | ✅ durable, per-identifier | ✅ | ✅ | high |
| `orders.ts` | GET `/{id}`, GET `/`, **`/{id}/reorder-preview`** | ✅ | ✅ (admin\|owner\|email) | reads | ✅ param | ✅ | med |
| `wishlist.ts` | list/add/remove | ✅ | ✅ | ✅ | ✅ | ✅ | med |
| `addresses.ts` | CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | med |
| `users.ts` | profile/account | ✅/A | ✅ | ✅ | ✅ | ✅ | med |
| `cart.ts` | `/reserve`, release | — (guest ok) | reservation-token | ✅ durable | ✅ | ✅ | med |
| `contact.ts` | submit | — | n/a | ✅ IP+identifier durable | ✅ | ✅ | med |
| `newsletter.ts` | subscribe/confirm | — | n/a | ✅ durable 3/60 | ✅ | ✅ | low |
| `discounts.ts` | validate | — | n/a | ✅ durable 20/60 | ✅ | ✅ | med |
| `site-feedback.ts` | submit | — | n/a | ✅ durable | ✅ | ✅ | low |
| `events.ts` | track | — | n/a | ⚠️ 120/60 **memory** | ✅ | ✅ | low |
| `search.ts` | GET search, POST semantic | — | n/a | ⚠️ **none** | ✅ | ✅ | **med (gap)** |
| `geo.ts` | GET `/search` (photon proxy) | — | n/a | ⚠️ **none** (edge-cached) | partial | ✅ | **med (gap)** |
| `agent-chat.ts` | POST `/` (Anthropic LLM) | ⚠️ **none** | n/a | ⚠️ **none** | zod (manual) | ✅ | **HIGH (gap)** |
| `admin-*.ts` (dashboard/discounts/import/orders) | mutations | A | n/a | ⚠️ none (admin-gated) | ✅ | ✅ | low |
| `products/collections/pages/theme/media/tags/product-types/redirects/navigation/globals/conversations` | admin writes; public reads | A on writes | n/a | mostly none | ✅ | ✅ | low |
| `admin-debug.ts` | `/db-ping` | prod-gated (debug token/admin) | n/a | none | — | ✅ | low |
| `security.ts` | `/csp-report` | — | n/a | none (204 sink) | ignores body | ✅ | low |
| `social.ts` / `feeds.ts` / `health.ts` | public reads | — | n/a | none | — | ✅ | low |

## Part 2 — Validation findings
- **Schemas present** for all validated mutation routes via `@hono/zod-openapi` + `c.req.valid()` and dedicated schema files under `api/hono/schemas/`. Path params use `idParamSchema` (uuid).
- **Server recomputes money/stock** ✅ — `payments.ts` uses `calculateOrderTotals` (server) and server-side availability via the concurrency-safe stock UPDATE + reservations; client totals are never trusted.
- **Bounded strings/emails** ✅ — e.g. OTP `emailSchema = z.string().trim().email().max(320)`; contact/newsletter schemas trim+bound.
- **Enums validated** ✅ (order status filters, discount type, model ids in agent-chat via `refine`).
- **Gaps flagged:**
  - `agent-chat` accepts `messages: z.array(z.unknown())` (validated later by `safeValidateUIMessages`) — acceptable, but the route is **unauthenticated + unlimited** (see auth/RL).
  - `geo` validates `q` (trim, min 3) but no explicit max length — add `.max()` (minor).
  - No route was found trusting client-computed totals, accepting arbitrary unbounded JSON on a sensitive route, or letting a customer route mutate admin-only fields.

## Part 3 — Auth & ownership findings
- **Account/orders/wishlist/addresses/users** → `requireAuth` + ownership (orders/reorder/repay use the `admin | userId | guest-email-claim` rule; wishlist/addresses owner-scoped). ✅
- **Admin routes** → `requireAdmin` (role or `ADMIN_API_SECRET`). ✅
- **Checkout/payments** → `requireAuth` + host guard; repay is owner-scoped + status-guarded. ✅
- **Cart/reservation** → reservation-token proof prevents mutating another client's hold. ✅
- **Payment status/receipt** → order fetch is owner-guarded (no cross-user leak). ✅
- **Webhooks** → no user auth (correct) but require signature. ✅
- **Cron** → require `CRON_SECRET`. ✅
- **No private route found accidentally public.** `admin-debug` is prod-gated; `agent-chat` is intentionally public (chat) but should be **rate-limited** (see matrix).

**No auth/ownership gaps found. The only material findings are the missing rate limits on `agent-chat`, `geo`, `search` (Part 4).**
