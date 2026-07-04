# Server Safety Recheck For 5 Risks

Status: Conditional GO.

## API Surface

The deployed Next catch-all imports `api/hono/site-app`:

- `app/api/v2/[...route]/route.ts:1-12`
- `api/hono/site-app.ts:41-178`

The broader `api/hono/app.ts` registers additional cron/admin routes:

- Cron: `api/hono/app.ts:167-169`
- Admin orders: `api/hono/app.ts:187-189`
- Admin discounts/contact/site-feedback/pages/theme/navigation/redirects: `api/hono/app.ts:191-221`

Those broader routes are not proven mounted through the deployed catch-all in this audit.

## Clean Findings

- Same-origin CORS and mutation guard are global in `site-app` before route registration.
- Credentialed CORS does not use wildcard origin.
- Auth middleware runs globally for `/api/v2/*`.
- Admin routes inspected use `requireAdmin` or admin role checks.
- Agent chat requires admin and durable rate limit: `api/hono/routes/agent-chat.ts:50-80`.
- Create-order is auth-only and durable rate-limited.
- OTP start/verify use IP and identifier/challenge durable limits.
- Contact/newsletter/site-feedback public mutations use durable limits.
- Webhooks verify Razorpay HMAC and dedupe event ids.
- Cart reserve/release and release-expired use rate limits and token/secret/admin checks.
- Live Razorpay host guard blocks localhost/vercel preview unless explicitly overridden.
- Security headers and CSP report-only are configured in `next.config.ts:1-113`.

## Conditional Or Gap Findings

- Public keyword search is memory rate-limited by design (`api/hono/routes/search.ts:41-56`), not durable. Risk is DB/search load during bot traffic.
- Geo search is memory rate-limited and uses external Photon with CDN cache and timeout (`api/hono/routes/geo.ts:36-90`).
- Events track is memory rate-limited and writes analytics events (`api/hono/routes/events.ts:46-95`).
- Cron routes in `api/hono/routes/cron.ts` require `CRON_SECRET`, but cron mount through the deployed `site-app` is not present. Cart cleanup route is mounted separately.
- Durable limiter absence in production causes fail-closed 503 for required mutation routes. Safe for abuse, risky for availability.
- Admin back-office routes in full `app.ts` may be unreachable if UI expects `/api/v2/admin/*` routes not registered in `site-app`.

## Upstash/KV Dependency

Critical routes with `requireDurable: true` depend on Upstash Redis or Vercel KV REST envs. If absent in production, these routes fail closed:

- cart reserve/release
- payment create/repay
- OTP start/verify
- contact/newsletter/site-feedback
- semantic search
- agent chat

## Remaining Rate-Limit Gaps

- Consider durable limiting for public keyword search if bot search traffic becomes a real risk.
- Consider durable limiting or batching for `events/track` if analytics write volume is high.
- Consider CDN or internal cache for repeated catalog search/facet calls.

## Verdict

Server safety: Conditional GO. Security posture is strong for mutation routes, webhook verification, CSRF/same-origin, and durable limiter fail-closed behavior. Launch readiness depends on confirming durable limiter envs and clarifying the `site-app` versus full `app.ts` route surface.
