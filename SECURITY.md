# SECURITY.md

Audit date: 2026-06-27  
Repo state inspected: dirty working tree at git `79abca1`  
Scope: current From the Trunk Next.js ecommerce code, OTP/auth reports, commerce auth reports, performance report, source inspection, dependency audit, and local release gates. Generated `.next` output was used only for build/bundle checks, not for source-code conclusions.

No production payment endpoints were hit. No live OTP/email was sent. No source code, migrations, checkout logic, auth logic, payment logic, product logic, account logic, or admin logic was changed for this audit.

## Executive summary

Top 10 risks ranked:

| Rank | Severity | Risk |
| --- | --- | --- |
| 1 | Critical | Authenticated user APIs return full user rows that include `passwordHash`. |
| 2 | High | `/api/v2/payments/create-order` is unauthenticated and still derives order owner from submitted shipping email despite the new inline checkout auth requirement. |
| 3 | High | Error logging and error tracking can serialize raw Drizzle errors, stacks, request metadata, and customer PII. |
| 4 | High | Dependency audit reports high-severity issues, including `nodemailer <=9.0.0` and `tmp <0.2.6` through LHCI. |
| 5 | Medium/High | Legacy password credentials login is still callable and has no app-level rate limit. |
| 6 | Medium | Wishlist/address/profile mutation abuse gaps remain: several authenticated mutations have no rate limit, and wishlist merge accepts an unbounded array. |
| 7 | Medium | Admin media completion accepts an arbitrary URL and server-fetches it for compression, creating SSRF/resource-exhaustion risk if admin access or bearer secret is compromised. |
| 8 | Medium | Admin CSV import reads and caches whole files with no explicit file-size, row, column, or cache-owner cap. |
| 9 | Medium | No Content-Security-Policy is configured, while the app has inline JSON-LD, inline theme styles, and receipt inline handlers/styles. |
| 10 | Medium | Performance/release gates are not clean: `tsc`, unit tests, `agent:check`, dependency audit, and Node engine compatibility fail. |

## Current release recommendation

**DO NOT SHIP** the customer account/checkout/payment release to production until the Critical and High findings are fixed and the release gates are green on the supported Node line.

The OTP and commerce UI work is substantially improved, but the server-side payment and user-data boundaries still have release-blocking issues. UI checkout auth blocks are not a security boundary; the backend must enforce the same rule.

## Attack surface map

| Surface | Entry points | Main assets at risk | Notes |
| --- | --- | --- | --- |
| NextAuth session/auth | `app/api/auth/[...nextauth]/route.ts`, `lib/auth/options.ts`, `/api/auth/callback/credentials`, `/api/auth/callback/email-otp` | Sessions, account takeover, admin access | OTP provider is real and customer-only; legacy password provider remains callable. |
| OTP API | `api/hono/routes/auth-otp.ts`, `db/queries/auth-otp.ts`, `lib/auth/otp.ts` | OTP code, login ticket, registration token, account enumeration | HMAC hashing, generic responses, attempt caps, and one-time tickets are in place. |
| Hono API shell | `api/hono/site-app.ts`, `api/hono/app.ts`, `api/hono/middleware/*` | API data, CSRF, CORS, admin routes | Same-origin mutation guard and auth middleware are applied globally. |
| Checkout UI | `app/(site)/checkout/page.tsx`, `components/checkout/*`, `lib/checkout/use-checkout-payment.ts` | Checkout flow, saved addresses, payment initiation | UI blocks payment pre-auth, but backend create-order does not. |
| Payments/orders | `api/hono/routes/payments.ts`, `api/hono/routes/webhooks.ts`, `lib/payments/razorpay.ts`, `lib/orders/complete-paid-order.ts` | Order ownership, payment status, product inventory, Razorpay signatures | Amount calculation and signature checks are mostly server-side; create-order auth/ownership is the major gap. |
| Cart/reservations | `lib/store/cart-store.ts`, `api/hono/routes/cart.ts`, `lib/cart/reservation-token.ts` | Inventory holds, reservation release | Guest cart is expected; signed reservation tokens are used. |
| Wishlist | `components/product/wishlist-button.tsx`, `components/wishlist/wishlist-merge-on-login.tsx`, `api/hono/routes/wishlist.ts` | User wishlist ownership, demand signals | Client no longer creates new guest wishlist items; server is auth scoped. Rate/cap gaps remain. |
| Account/address/orders | `api/hono/routes/users.ts`, `api/hono/routes/addresses.ts`, `api/hono/routes/orders.ts` | PII, address ownership, order ownership | Address and order IDOR protections are good; user serializer is unsafe. |
| Admin | `api/hono/routes/admin*`, `api/hono/routes/pages.ts`, `api/hono/routes/theme.ts`, `api/hono/routes/navigation.ts` | Product/catalog/admin data, imports, media | Admin routes use `requireAdmin`, including session role or admin bearer secret. Some resource caps are missing. |
| Media/uploads | `api/hono/routes/media.ts`, `lib/media/blob-upload.ts`, `next.config.ts` | Public media, server fetch, sharp processing | Upload URL generation exists; complete route trusts URL/pathname/size. |
| External integrations | Resend, SMTP/Nodemailer, Razorpay, GA4, Meta CAPI, Photon geo, Vercel Blob, OpenAI embeddings | API keys, PII, SSRF, rate abuse | Most secrets are server-only by name; no secret env names found in `.next/static`. |
| Public content/XSS | CMS blocks, policy pages, JSON-LD, receipt HTML, theme styles | Stored XSS, CSP bypass | JSON-LD escaping and CMS sanitizer exist, but CSP missing and theme value validation is weak. |

## Findings table

| Finding | Severity | Evidence | File(s) | Exploit scenario | Recommended fix | Test needed |
| --- | --- | --- | --- | --- | --- | --- |
| Full user rows including `passwordHash` are returned by API routes. | Critical | `users.passwordHash` exists at `db/schema.ts:52`; `getUserById` and `getUserByEmail` select full rows at `db/queries/users.ts:71-91`; `/users/me` returns `user` at `api/hono/routes/users.ts:236-242`; signup/admin/profile routes return created/updated rows at `api/hono/routes/users.ts:107`, `190`, `215`, `443`. | `db/schema.ts`, `db/queries/users.ts`, `api/hono/routes/users.ts` | A logged-in customer fetches `/api/v2/users/me` and receives their bcrypt/random password hash. An XSS, browser extension, proxy log, or support screenshot turns this into offline cracking material. | Add a `serializeUser`/safe select that excludes `passwordHash` and sensitive metadata. Use it on every user response and admin list response unless a privileged internal path explicitly needs hashes. | Unit/integration tests asserting user APIs never include `passwordHash`. |
| Payment create-order is unauthenticated and owner comes from shipping email. | High | Create-order route has no `requireAuth` at `api/hono/routes/payments.ts:87-117`; it lowercases submitted email at `284-285`, calls `getOrCreateCheckoutCustomer` at `310-314`, and creates order with `userId: customer?.id ?? null` at `316-337`. UI blocks unauthenticated payment at `components/checkout/checkout-page-client.tsx:360-365` and shows auth gate at `452-458`. | `api/hono/routes/payments.ts`, `components/checkout/checkout-page-client.tsx`, `db/queries/users.ts` | An attacker bypasses the browser UI and posts directly to `/api/v2/payments/create-order`, creating pending Razorpay links and orders against arbitrary shipping emails or checkout-shell users. | Require authenticated session on create-order. Set order `userId` from `authUser.id`; keep shipping email only as contact/invoice data. Reject shipping email mismatches or require explicit account-owned email policy. | Route tests: unauth create-order returns 401; authenticated create-order owns order by session user even when shipping email differs; payment verify still requires owner. |
| Raw logging/error tracker can leak PII and sensitive query params. | High | `onUncaughtError` captures raw error and logs `{ err: error }` at `lib/http/on-uncaught-error.ts:7-16`; logger serializes Error message/name/stack and arbitrary meta at `lib/log.ts:54-103`, then forwards meta to tracker at `138-145`; product PATCH logs full payload at `api/hono/routes/products.ts:734-740`. Terminal output already showed Drizzle failed-query params containing name/address/phone/email. | `lib/http/on-uncaught-error.ts`, `lib/log.ts`, `api/hono/routes/products.ts`, `app/api/chat/route.ts` | A failed insert/update emits customer address, phone, email, payment identifiers, or admin product payload into logs/Sentry-like systems. | Central redaction for email, phone, address, Authorization, cookies, OTP/ticket/token names, Razorpay secrets, SQL params, and request bodies. Log stable error codes/request IDs instead of raw errors for known DB failures. Remove full-body product debug logs. | Logger tests with representative Drizzle error and route body proving PII is redacted. |
| Dependency audit has high/moderate vulnerabilities. | High | `pnpm audit` found 14 vulnerabilities: 3 high, 8 moderate, 3 low. High findings include `nodemailer <=9.0.0` and `tmp <0.2.6`; moderate includes `postcss <8.5.10`, `esbuild <=0.24.2` via drizzle-kit path, `js-yaml <=4.1.1`, and `uuid <11.1.1` through LHCI. `pnpm outdated` shows `nodemailer` current `7.0.13`, latest `9.0.1`. | `package.json`, `pnpm-lock.yaml` | SMTP fallback or dev tooling paths carry known vulnerabilities; even if not directly exploitable in the storefront path, this blocks a clean security release. | Upgrade vulnerable direct dependencies first (`nodemailer`, `postcss` if direct override needed), then refresh/transitively upgrade LHCI path or add a documented override if safe. | `pnpm audit` must return zero high vulnerabilities or documented accepted risk with compensating controls. |
| Legacy password provider lacks rate limiting. | Medium/High | Credentials provider does direct lookup and bcrypt compare at `lib/auth/options.ts:44-89`; no `rateLimitResponse` or NextAuth-compatible limiter is used. OTP routes are rate-limited at `api/hono/routes/auth-otp.ts:211-218`, `366-374`, `503-510`. | `lib/auth/options.ts`, `api/hono/routes/auth-otp.ts` | Attackers can password-spray `/api/auth/callback/credentials` even though the password UI is hidden behind `?mode=password`. | Add durable rate limit inside credentials `authorize`, keyed by IP and normalized email. Log password auth failures without revealing account existence. Fail closed in production if durable limiter is unavailable. | Tests for rate limit, lockout behavior, and no enumeration on credentials provider. |
| Authenticated wishlist/address/profile mutations lack broad abuse controls. | Medium | Wishlist add/delete/merge have no limiter at `api/hono/routes/wishlist.ts:67-173`, `269-293`; merge schema accepts unlimited `productIds` at `31-42`; address POST/PATCH/DELETE have no limiter at `api/hono/routes/addresses.ts:37-235`; password change has no limiter after auth at `api/hono/routes/users.ts:245-316`. | `api/hono/routes/wishlist.ts`, `api/hono/routes/addresses.ts`, `api/hono/routes/users.ts` | Compromised session or scripted customer account can fan out DB writes/events, spam addresses, or brute-force current password. | Add per-user durable limits and payload caps; make wishlist merge `.max(100)` or lower, dedupe before insert, and reject unknown product IDs intentionally. | Mutation rate-limit tests and max-array tests. |
| Admin media complete route can SSRF/fetch arbitrary URLs. | Medium | Complete upload schema accepts `url`, `pathname`, and `size` at `api/hono/routes/media.ts:14-21`; admin route passes body directly to `createMediaFromUpload` at `87-93`; compression path fetches `input.url` at `lib/media/blob-upload.ts:82-90`, buffers it, and processes with sharp at `93-96`. | `api/hono/routes/media.ts`, `lib/media/blob-upload.ts` | If an admin session or admin bearer secret is compromised, attacker can make the server fetch internal/private or huge external URLs and process them as images. | Bind complete calls to a generated upload token/path. Validate host as Vercel Blob, enforce pathname prefix, content type, size cap, timeout, and max pixels before buffering. | Tests rejecting non-Blob URL, mismatched pathname, oversized size, non-image content, and slow fetch timeout. |
| Admin import lacks file size/row caps and owner scoping. | Medium | Parse reads full `file.text()` at `api/hono/routes/admin-import.ts:58-65`; stores all rows/headers for 30 minutes in module `fileCache` at `21-32`, `74-80`; import schemas have arrays with no max at `api/hono/schemas/admin-import.ts:3-22`. | `api/hono/routes/admin-import.ts`, `api/hono/schemas/admin-import.ts` | Admin or leaked bearer secret uploads a very large CSV and causes memory pressure, or reuses a `fileId` across admin contexts in the same process. | Enforce content-length/file size, row count, column count, field length, and per-admin cache namespace. Evict on execute and after validation failure. | Tests for oversized file, too many rows/columns, and fileId not reusable across admins. |
| No CSP is configured. | Medium | Headers include HSTS, frame options, nosniff, referrer, DNS prefetch, and permissions policy at `next.config.ts:48-90`; no `Content-Security-Policy`. Inline JSON-LD appears in `app/(site)/layout.tsx`, `app/(site)/collection/[slug]/page.tsx`, and `app/(site)/faqs/page.tsx`; theme inline style at `components/layout/theme-styler.tsx:41-47`; receipt inline style and print handler at `lib/orders/receipt-html.ts:112-294`, `371-373`. | `next.config.ts`, `app/(site)/layout.tsx`, `components/layout/theme-styler.tsx`, `lib/orders/receipt-html.ts` | Any future stored/reflected injection has no CSP backstop; payment/analytics/script allowlists are undefined. | Add report-only CSP first with nonce/hash strategy for JSON-LD and theme style, then enforce. Allowlist Razorpay checkout, GA/GTM, Vercel Blob, Photon/OpenStreetMap if needed. | Header tests and Playwright smoke with Razorpay test script loading. |
| Admin theme token renderer accepts arbitrary CSS values. | Medium | `ThemeStyler` injects DB tokens via `dangerouslySetInnerHTML` at `components/layout/theme-styler.tsx:35-47`; `formatThemeCssVariables` only checks key prefix `--` and stringifies values at `lib/content/theme-tokens.ts:32-41`; editable color token allowlist exists at `64-72` but render helper does not enforce it. | `components/layout/theme-styler.tsx`, `lib/content/theme-tokens.ts`, `lib/content/theme-settings.schema.ts` | Compromised admin can store CSS custom property values that alter UI, hide warnings, or break CSP hardening. | Enforce editable token allowlist and color syntax at save and render. Reject values containing `;`, `{`, `}`, `</style`, or non-color syntax. | Unit tests for unsafe token keys/values and CSP compatibility. |
| Order item schema allows quantities up to 50 and unbounded item arrays while UI/cart is one-of-one. | Medium | `orderItemSchema.quantity` allows `1..50` at `api/hono/schemas/orders.ts:3-7`; `createOrderSchema.items` has `.min(1)` with no `.max()` at `23-37`; cart UI enforces quantity 1 at `lib/store/cart-store.ts:79-108`. | `api/hono/schemas/orders.ts`, `api/hono/routes/payments.ts`, `api/hono/routes/orders.ts`, `lib/store/cart-store.ts` | Direct API caller creates nonsensical multi-quantity orders for unique sarees or sends very large item arrays causing server work. | Set quantity max to 1 for one-of-one inventory and cap items array. Reject duplicate product IDs in order/payment routes. | Schema tests for quantity >1, duplicate product IDs, and array over max. |
| Shared secret fallbacks increase blast radius. | Low/Medium | Reservation tokens fall back to `NEXTAUTH_SECRET`/`AUTH_SECRET` at `lib/cart/reservation-token.ts:9-13`; order access tokens fall back to `NEXTAUTH_SECRET`, `PAYLOAD_SECRET`, or `ADMIN_API_SECRET` at `lib/orders/order-access-token.ts:3-13`; email verification and preview tokens also fall back to admin/payload secrets. | `lib/cart/reservation-token.ts`, `lib/orders/order-access-token.ts`, `lib/users/email-verification-token.ts`, `lib/content/preview-token.ts` | One leaked shared secret compromises multiple token classes and complicates rotation. | Require dedicated production secrets for reservation, order access, email verification, preview, and OTP token classes. Document rotation. | Startup/env validation tests in production mode. |
| Public docs/debug route exposure needs hardening review. | Low/Medium | `/api/v2/openapi.json` and `/api/v2/docs` are exposed in both Hono apps at `api/hono/site-app.ts:44-52` and `api/hono/app.ts:53-61`; debug DB ping exists but is 404 in production unless explicitly enabled and bearer-authenticated at `app/api/debug/db-ping/route.ts:17-30`. | `api/hono/site-app.ts`, `api/hono/app.ts`, `app/api/debug/db-ping/route.ts` | Public API docs aid recon. Debug route appears guarded, but it should be excluded from production unless needed. | Disable docs/debug in production or require admin for docs. Keep debug endpoint feature flag off by default. | Production route tests for docs/debug availability policy. |

## Auth and OTP findings

Passes and good controls:

- `email-otp` provider is a real provider object with id `email-otp` at `lib/auth/options.ts:91-179`.
- Existing password credentials provider remains separate at `lib/auth/options.ts:44-89`.
- OTP login tickets are consumed atomically in `db/queries/auth-otp.ts:230-264`.
- Admin/staff OTP login is explicitly rejected by role check at `lib/auth/options.ts:107-124`, with `otp_admin_rejected` event.
- OTP tokens and codes are generated with Node crypto, not `Math.random`, in `lib/auth/otp.ts:33-42`.
- OTP and token hashes use HMAC and timing-safe comparison at `lib/auth/otp.ts:56-87`.
- OTP start/verify/complete routes use durable-required rate limits in production at `api/hono/routes/auth-otp.ts:211-218`, `366-374`, and `503-510`.
- Start/verify responses remain generic; unknown accounts do not reveal existence in the normal sign-in path.
- `buildClientCallbackUrl` normalizes external callback URLs back to same-origin path/search/hash at `lib/auth/client-callback-url.ts:20-30`.
- UI stores `challengeToken`, `registrationToken`, and `loginTicket` in React state only in `components/account/otp-auth-panel.tsx`; no localStorage/sessionStorage token storage was found in OTP UI search.

Risks:

- Legacy password callback remains callable and unthrottled at the app layer.
- `/api/v2/users/me` and related user responses leak `passwordHash`, which undermines password fallback safety.
- Test gate for `authMiddleware` currently fails, so session extraction behavior has an unverified regression surface.

## Wishlist/cart/checkout findings

Wishlist:

- Logged-out wishlist button opens auth dialog and stores pending product only in component state (`components/product/wishlist-button.tsx:40-43`, `121-125`).
- On OTP success it saves the pending product through authenticated `/api/v2/wishlist` and invalidates wishlist queries (`components/product/wishlist-button.tsx:128-138`).
- Server uses `requireAuth` and session user id for add/delete/merge (`api/hono/routes/wishlist.ts:90-117`, `153-160`, `286-292`); client does not send userId.
- Legacy guest merge remains supported through `WishlistMergeOnLogin`, reading localStorage and POSTing `/api/v2/wishlist/merge` after session (`components/wishlist/wishlist-merge-on-login.tsx:43-73`).
- Remaining risk: merge has no rate limit and no array cap.

Cart:

- Guest cart persists under `ftt-cart-v2` localStorage only with product/cart/reservation data (`lib/store/cart-store.ts:121-126`).
- Reservation token is signed and release requires matching token for active reservations (`lib/cart/reservation-token.ts:18-73`, `api/hono/routes/cart.ts:204-230`).
- Reserve/release routes are rate-limited (`api/hono/routes/cart.ts:51-56`, `175-180`).
- Remaining risk: reservation secret fallback should be dedicated in production.

Checkout:

- Guests with cart stay on `/checkout`; `app/(site)/checkout/page.tsx` renders client without redirect.
- Checkout UI blocks payment before auth (`components/checkout/checkout-page-client.tsx:360-365`, `452-458`).
- Auth success refetches addresses and refreshes router (`components/checkout/checkout-page-client.tsx:427-432`).
- Remaining blocker: backend create-order does not enforce auth, so direct API calls bypass this UI gate.

## Payment/order findings

Good controls:

- Product prices, subtotal, shipping, GST, and discounts are computed server-side in `api/hono/routes/payments.ts:185-272`.
- Razorpay payment signature verification uses HMAC/timing-safe comparison in `lib/payments/razorpay.ts:124-143`.
- Razorpay payment-link callback verifies signature and order link match before completion at `api/hono/routes/payments.ts:698-714`.
- Webhook route verifies `x-razorpay-signature` over raw body at `api/hono/routes/webhooks.ts:113-146`.
- `completePaidOrder` is idempotent on `paymentStatus != paid` at `lib/orders/complete-paid-order.ts:81-109`; emails/events are winner-branch only.
- `/api/v2/payments/verify` requires auth and checks order owner at `api/hono/routes/payments.ts:605-617`.

Release blockers:

- `/api/v2/payments/create-order` is unauthenticated and creates orders from shipping email.
- Create-order pending cap is by shipping email at `api/hono/routes/payments.ts:287-307`; this is not enough after inline auth requirement.
- Order item schema does not reflect one-of-one inventory.

## Account/address/order IDOR findings

Good controls:

- Address list, update, and delete are scoped by `addresses.userId = authUser.id` (`api/hono/routes/addresses.ts:26-31`, `129-150`, `207-215`).
- Setting default address verifies the address belongs to the current user (`api/hono/routes/users.ts:407-428`).
- Order list includes current user's owned orders and only null-user guest orders by matching shipping email (`db/queries/orders.ts:92-103`).
- Order detail allows admin, owner, or null-user guest order with matching session email (`api/hono/routes/orders.ts:84-104`).
- Confirmation/receipt path uses signed order access token or owner session through `lib/orders/viewable-order.ts:6-28`.

Risks:

- User profile and admin user responses expose password hash.
- Authenticated address/profile mutations need rate limits.
- Guest order email-claim rule becomes less desirable if all checkout orders must be authenticated; after create-order is fixed, phase out new null-user payment orders.

## Admin findings

Good controls:

- Full admin app registers admin route groups under `/api/v2/admin/*` (`api/hono/app.ts:135-169`).
- Admin route search shows `requireAdmin` applied across admin dashboard, imports, orders, discounts, pages, theme, navigation, redirects, and conversations.
- Admin bearer secret comparison is timing-safe (`lib/http/verify-secret.ts:9-27`).
- Admin OTP is rejected by the OTP provider.

Risks:

- `requireAdmin` accepts `ADMIN_API_SECRET` bearer in addition to admin session (`api/hono/middleware/auth.ts:51-64`); this is useful for automation but high blast radius if leaked.
- Admin import and media routes need resource and URL caps.
- Admin create user returns full user row including password hash.
- Admin mutation audit logging appears inconsistent; some routes emit events/logs, but there is no universal admin audit trail in the inspected paths.

## Rate-limit/abuse findings

Good controls:

- Rate limiter supports durable Upstash/KV adapter and fails closed in production when `requireDurable` is true and durable env is missing (`lib/http/rate-limit.ts:86-105`, `lib/ports/rate-limiter.ts:47-72`).
- OTP, cart reservation/release, payment create, discount validation, newsletter, events, restock notify, signup, and email-change routes use `rateLimitResponse` in inspected code.

Gaps:

- Legacy NextAuth password provider lacks rate limit.
- Wishlist add/delete/merge, address mutations, profile patch, and password change need per-user rate limits.
- Production durable limiter test currently fails TypeScript because the test assigns readonly `process.env.NODE_ENV` (`tests/unit/rate-limit-production.test.ts:16-20`).

## CSRF/CORS findings

Good controls:

- Hono app applies same-origin CORS and mutation guard before auth middleware (`api/hono/site-app.ts:40-42`, `api/hono/app.ts:49-51`).
- Mutation guard rejects cross-origin `Origin` and cross-site `Sec-Fetch-Site` for POST/PATCH/PUT/DELETE (`api/hono/middleware/same-origin.ts:84-127`).
- CORS origin callback returns only allowed same-origin/configured origins with credentials enabled (`api/hono/middleware/same-origin.ts:65-82`).
- NextAuth callback routes are outside Hono and rely on NextAuth CSRF.
- Razorpay webhook/callback security is signature-based rather than browser CSRF-based.

Gaps:

- Because `/api/auth/callback/credentials` is outside Hono, add password-specific brute-force/abuse controls inside provider logic.
- Add regression tests proving cross-origin direct POSTs to payment/create-order remain blocked and same-origin auth is still required after create-order fix.

## XSS/content injection findings

Good controls:

- JSON-LD serializer escapes `<` to prevent `</script>` breakout (`lib/seo/json-ld.ts:71-80`).
- CMS rich text sanitizer strips script/embed/form/base elements, event handlers, and `javascript:`/`data:` URLs (`lib/content/sanitize-html.ts:23-47`).
- Email templates and receipt HTML escape user/order fields (`lib/email/templates.ts`, `lib/orders/receipt-html.ts:70-76`).

Risks:

- Missing CSP reduces defense-in-depth.
- Admin theme tokens are only weakly validated at render helper level.
- Receipt HTML includes inline styles and an inline `onclick` print button, which will complicate CSP enforcement.

## SSRF/external integration findings

Good controls:

- Geo search/reverse call fixed Photon hosts, validate inputs, cache responses, and use `AbortSignal.timeout(3500)` (`app/api/v2/geo/search/route.ts:21-34`, `app/api/v2/geo/reverse/route.ts:25-49`).
- Razorpay and analytics external calls are fixed-host integrations in inspected source.

Risks:

- Admin media compression fetches user-supplied `input.url` without host/path validation.
- `app/api/debug/db-ping/route.ts` parses `DATABASE_URL` but does not print it; production access is gated by feature flag and bearer token. Keep it disabled in production unless actively debugging.

## Secrets/logs findings

Good controls:

- Search of `.next/static` for server secret env names returned no hits.
- `RESEND_API_KEY`, Razorpay secret, OTP secrets, GA4 API secret, database URL, NextAuth secret, and admin secret are referenced only in server-side code paths by env name in the inspected source.
- OTP security events store hashed IP/user-agent and challenge ids, not raw OTPs/tickets in the inspected code.

Risks:

- Logger serializes raw errors and meta.
- Dev email fallback logs recipient and subject when no provider is configured (`lib/email/send.ts:80-84`); acceptable for dev but should never be enabled as a production behavior.
- Several token classes share fallback secrets.

## Security headers findings

Present:

- `X-Frame-Options: DENY` globally, with `/checkout` set to `SAMEORIGIN`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

Missing:

- No Content-Security-Policy.
- No `frame-ancestors` CSP replacement for `X-Frame-Options`.
- No report-only CSP collection endpoint.

## Media/upload findings

Good controls:

- Upload path uses safe basename normalization (`lib/media/blob-upload.ts:30-43`).
- Upload token limits client content type to the requested content type (`lib/media/blob-upload.ts:45-49`).
- Alt text required before media record creation (`api/hono/routes/media.ts:14-21`, `lib/media/blob-upload.ts:66-72`).

Risks:

- Complete route trusts `url`, `pathname`, `mimeType`, and `size` from the client.
- Server fetches and buffers URL for files over 1MB with no host/path/size/pixel/time enforcement beyond `response.ok`.
- Next image remote patterns allow Vercel Blob, Unsplash, Behold, and Instagram CDN; these are expected, but keep remote domain list tight.

## Performance/lag findings

Source-backed current state:

- `/collection` is dynamic in the build output and has a large server-rendered product/filter path. Source now uses `revalidate = 60` and catalog cache helpers at `app/(site)/collection/page.tsx:13-30`, but build still marks `/collection` as dynamic.
- Neon HTTP Drizzle client uses module-level Neon HTTP with undici IPv4 agent at `db/index.ts:1-19`; there is no pooled Postgres client in this runtime path.
- `orders.shipping_email` is queried for account order surfacing and payment pending caps (`db/queries/orders.ts:92-103`, `api/hono/routes/payments.ts:287-299`), but schema indexes include `orders_user_idx`, `orders_status_idx`, and `orders_payment_status_idx` only (`db/schema.ts:437-439`); no `orders_shipping_email_idx` was found.
- `SessionProvider` no longer refetches on focus (`components/providers.tsx:14`), so earlier focus-refetch concern appears fixed.
- Cart localStorage and wishlist merge are bounded by normal use, but wishlist merge body still needs server cap.

Performance blockers:

- Local `pnpm run agent:check` cannot reach Lighthouse because the test phase fails first.
- Live performance validation on supported Node and production-like data is still required.

## Dependency findings

Commands run:

- `pnpm audit`: failed with 14 vulnerabilities: 3 high, 8 moderate, 3 low.
- `pnpm outdated`: failed because packages are outdated and Node engine is unsupported.

Notable outdated/vulnerable packages:

- `nodemailer` current `7.0.13`, latest `9.0.1`; audit reports multiple Nodemailer advisories including high severity.
- `@lhci/cli` dependency path includes vulnerable `tmp` and `uuid`.
- `postcss` audit reports moderate vulnerability through Next's dependency path.
- `resend` current `6.12.4`, latest `6.16.0`.
- `hono` current `4.12.25`, latest `4.12.27`.
- `sharp` current `0.33.5`, latest `0.35.2`.

## Build/test gate findings

Environment:

- Node: `v25.4.0`.
- Package engine requires Node `>=20.9 <25`.
- pnpm: `10.28.0`.

Commands run:

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm run lint` | Pass with warning | One hook dependency warning in `app/(site)/our-story/page.tsx:256`. |
| `pnpm run build` | Pass | Next 16.2.9 build completed; route output still marks `/collection`, `/checkout`, API routes, and PDPs dynamic. |
| `pnpm exec tsc --noEmit --pretty false` | Fail | `.next/dev/types/app/(site)/collection/page.ts` PageProps mismatch; `tests/unit/rate-limit-production.test.ts` readonly `NODE_ENV`. |
| `pnpm run test` | Fail | Basic reporter: 10 failed files, 24 failed tests, 107 passed files, 1477 passed tests. JSON reporter counted 18 failed suites due to import/setup accounting, but actionable failing files are listed below. |
| `pnpm run agent:check` | Fail | Stops in `pnpm run verify` because tests fail; LHCI matrix did not run. |
| `pnpm audit` | Fail | 14 vulnerabilities. |
| `pnpm outdated` | Fail | Outdated packages and Node engine warning. |

Failing test files from JSON/basic reports:

- `tests/unit/auth-middleware.test.ts`: 2 failed assertions.
- `tests/unit/checkout-estimate.test.ts`: 1 failed assertion.
- `tests/unit/order-charge-totals-route.test.ts`: 4 failed assertions.
- `tests/unit/packing-slip-render.test.ts`: 5 failed assertions.
- `tests/unit/site-feedback-fixes.test.ts`: 12 failed assertions.
- `tests/unit/bulk-edit-collection-tag-routes.test.ts`: import/setup failure, `DATABASE_URL is required`.
- `tests/unit/bulk-edit-routes.test.ts`: import/setup failure, `DATABASE_URL is required`.
- `tests/unit/csv-export.test.ts`: import/setup failure, `DATABASE_URL is required`.
- `tests/unit/product-api-public-visibility.test.ts`: import/setup failure, `DATABASE_URL is required`.
- `tests/unit/product-stock-route.test.ts`: import/setup failure, `DATABASE_URL is required`.

## Immediate fixes

No-risk or low-risk fixes:

1. Add safe user serializer/select and remove `passwordHash` from every API JSON response.
2. Remove full payload `console.error` in product PATCH and replace with request id plus validation summary.
3. Add max lengths/counts to wishlist merge and order items schemas.
4. Add `orders.shipping_email` index after migration review.
5. Fix local Node version to a supported runtime (`>=20.9 <25`) before release gates.
6. Update test env mutation to use `vi.stubEnv`/`vi.unstubAllEnvs` without assigning readonly `NODE_ENV`.
7. Disable production API docs/debug endpoints unless intentionally enabled.

## Medium-risk fixes

Require targeted testing:

1. Add durable rate limits to legacy password provider, wishlist add/delete/merge, address mutations, profile patch, and password change.
2. Add CSP in report-only mode and iterate on nonce/hash compatibility for JSON-LD, theme CSS, Razorpay, GTM/GA, Blob, maps, and receipt.
3. Harden admin media complete URL/path/content validation and sharp processing limits.
4. Add admin import size/row/column caps and per-admin cache scoping.
5. Require dedicated production secrets for reservation/order/email/preview token classes.
6. Upgrade vulnerable dependencies and verify mail sending paths with Resend and SMTP disabled/enabled as intended.

## High-risk fixes

Require careful rollout:

1. Change `/api/v2/payments/create-order` to require auth and derive `userId` only from the authenticated session.
2. Migrate away from new checkout shell creation in payment create-order if checkout is now auth-required.
3. Reconcile guest/null-user order email-claim behavior with the new auth-required checkout policy.
4. Re-run Razorpay test-mode create-order, payment-link callback, webhook, duplicate callback, failed payment, and refund event tests after auth ownership changes.

## Payment-specific hardening

Before production checkout is trusted:

1. `create-order` must reject unauthenticated requests.
2. `create-order` must set `userId` from session and must not use shipping email to choose owner.
3. Client must send no trusted price/total/tax/shipping amount; server calculation remains source of truth.
4. Discount validation and usage increment must stay server-side and idempotent.
5. Razorpay order/payment-link id must be bound to the local order and checked before completion.
6. Webhook and callback signature tests must cover invalid, duplicate, missing, and mismatched IDs.
7. Product stock/reservation update must remain atomic under concurrent create-order/payment completion.
8. Payment error logs must never include full customer address, phone, email, Razorpay secrets, or raw query params.

## OTP-specific hardening

Before OTP login is trusted:

1. Keep `email-otp` provider id assertion in tests.
2. Keep admin/non-customer OTP rejection tests.
3. Add rate-limit regression tests for start/verify/complete with durable production mode on supported Node.
4. Verify reused login tickets and registration tokens fail exactly once.
5. Verify unknown email/phone responses remain generic in UI and API.
6. Run one live Resend OTP smoke test to a release inbox before launch.
7. Confirm OTP/login/registration tokens never enter localStorage/sessionStorage or logs after minified production build.
8. Keep password fallback hidden from normal customer flow until password provider has rate limiting.

## Manual test plan

1. Fresh customer signs up with OTP from `/account/sign-up`, completes details/address, lands on profile.
2. Existing customer signs in with email OTP from `/account/sign-in`, lands on profile.
3. Existing customer signs in with phone OTP; OTP is delivered to registered email and no account existence leak appears.
4. Unknown email and unknown phone receive the same generic response shape and UI message.
5. Admin email OTP is rejected and does not create a customer session.
6. Password fallback at `/account/sign-in?mode=password` still works for a customer/admin path after password rate limiting is added.
7. Logged-out wishlist click opens dialog, completes OTP, saves only the clicked product, and does not write new guest wishlist localStorage.
8. Logged-out add-to-cart works without auth and persists in `ftt-cart-v2`.
9. Logged-out checkout with cart stays on `/checkout`, shows auth gate, and cannot call payment from UI before auth.
10. Direct unauthenticated POST to `/api/v2/payments/create-order` returns 401 after the fix.
11. Authenticated checkout creates order owned by session user even if shipping email differs.
12. User A cannot view/update User B address/order/wishlist.
13. Receipt download works for order owner or signed receipt access key only.
14. Razorpay test-mode successful, failed, duplicate callback, webhook replay, and refund flows behave idempotently.
15. Logs for failed DB insert/payment/email/OTP flows contain no raw OTPs, tickets, secrets, full addresses, or phone/email values.

## Automated tests to add

Unit/integration:

- User serializer excludes `passwordHash` from `/users/me`, signup, profile patch, admin list/create.
- Payment create-order requires auth and session-owned userId.
- Shipping email cannot override order owner.
- Credentials provider rate limits and logs safely.
- Wishlist merge max count/dedupe/unknown product behavior.
- Address/profile/password mutation rate limits.
- Media complete rejects non-Blob URL/path/content type/oversize.
- Admin import rejects oversized CSV, too many rows, too many columns, and cross-admin fileId.
- Logger redacts PII/secrets in raw Error, Drizzle error, route body, and tracker extras.
- CSP headers present in report-only/enforced mode once configured.
- Order schema rejects quantity >1, duplicate productIds, and oversized arrays.

Playwright:

- OTP sign-in/sign-up from account, wishlist dialog, and checkout gate.
- Wishlist pending action applies only after current authenticated session and clears on cancel.
- Checkout cannot show payment CTA or call create-order while unauthenticated.
- Authenticated checkout keeps cart intact and refetches saved addresses.
- External callbackUrl is normalized to same-origin.
- Mobile 390px OTP dialog/gate does not overflow and CTA remains tappable.

## Live smoke tests required

Do not execute without explicit approval and test credentials:

1. Live Resend OTP to release test inbox.
2. Live wishlist OTP popup sign-in and pending product save.
3. Live checkout OTP sign-in and saved-address refetch.
4. Razorpay test-mode create-order, payment success callback, and confirmation page.
5. Razorpay webhook signature validation using test event/replay.
6. Production-like durable rate limiter test with Upstash/KV env configured.
7. Production-like supported Node version test.
8. Error tracker/log sink redaction test in staging.
9. Lighthouse/LHCI matrix after `agent:check` can reach the LHCI stage.

## Re-audit checklist

After fixes:

1. Re-run source search for `passwordHash` in API responses.
2. Re-run unauthenticated direct payment create-order route test.
3. Re-run `rg "console\\.log|console\\.error|logger" app api lib components` and review every remaining raw error/body log.
4. Re-run `rg "dangerouslySetInnerHTML|innerHTML|sanitize|html" app components lib api`.
5. Re-run `rg "fetch\\(|new URL\\(|http://" app api lib components` and verify no new user-controlled server fetch.
6. Re-run `pnpm audit` and `pnpm outdated`.
7. Re-run `pnpm run lint`.
8. Re-run `pnpm run build`.
9. Re-run `pnpm exec tsc --noEmit --pretty false`.
10. Re-run `pnpm run test`.
11. Re-run `pnpm run agent:check`.
12. Re-run OTP Phase 3.5 and Commerce Auth Phase 3.8 smoke tests.
13. Run live Resend/Razorpay smoke tests only with approved test credentials.
14. Review `SECURITY.md` findings and mark each fixed with commit evidence before changing release recommendation.
