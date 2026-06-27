# From the Trunk OTP Auth Discovery

Audit date: 2026-06-26  
Scope: discovery only before OTP implementation. No application code, migrations, payment logic, or Razorpay logic was changed.

Commands run for discovery:

```sh
rg "CredentialsProvider|authorize\(|signIn\(|signOut\(" app components lib api
rg "customerSignUp|sign-up|createUser|getUserByEmail|getUserById|updateUser" app api lib db
rg "Resend|resend|sendEmail|sendVerification|welcome" app api lib
rg "rateLimit|withRateLimit|too many|429|Upstash|in-memory" app api lib
rg "callbackUrl|buildClientCallbackUrl|redirect" app components lib
rg "address|addresses|line1|postalCode|phone|isDefault" app components lib api db
rg "cart|reserve|release|reservation|removeItem|clearCart" app components lib api db
rg "wishlist|merge" app components lib api db
rg "razorpay|create-order|verify|payment|discount" app api lib db
rg "session|JWT|token|adapter|accounts|authSessions" app api lib db types
```

## 1. Current auth flow

The project uses NextAuth at `app/api/auth/[...nextauth]/route.ts`, backed by `lib/auth/options.ts`.

Current providers:

- OAuth providers are enabled only when env pairs exist:
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  - `AZURE_AD_CLIENT_ID` + `AZURE_AD_CLIENT_SECRET`
  - `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET`
- Credentials auth is always registered as `credentials`.

Credentials sign-in:

- `app/(site)/account/sign-in/page.tsx` calls `signIn("credentials", { redirect: false, email, password, callbackUrl })`.
- `lib/auth/options.ts` normalizes the email, loads the user with `getUserByEmail()`, requires `passwordHash`, and checks the password with `bcrypt.compare()`.
- On success, the returned user includes `id`, `role`, `email`, `name`, and `image`.

Session model:

- `lib/auth/options.ts` sets `session.strategy = "jwt"`.
- NextAuth JWT callback stores `token.id` and `token.role`.
- Session callback writes `session.user.id` and `session.user.role`.
- `types/next-auth.d.ts` extends `Session`, `User`, and `JWT` with `id` and optional `role`.
- Hono auth middleware in `api/hono/middleware/auth.ts` reads the NextAuth JWT cookie using `getToken({ secret: process.env.NEXTAUTH_SECRET })`.

Signup:

- UI: `app/(site)/account/sign-up/page.tsx`.
- API: `POST /api/v2/users/sign-up` in `api/hono/routes/users.ts`.
- Validation: `api/hono/schemas/users.ts`.
- Password rules: 8-128 chars, uppercase, lowercase, number.
- API hashes password with `bcrypt.hash(..., 12)`.
- If the email already exists as a checkout shell row, `claimCheckoutShell()` upgrades that existing user in place instead of creating a new user. This preserves already-linked checkout orders.
- After signup, the page signs in with `signIn("credentials", ...)`.

OAuth account creation:

- `lib/auth/drizzle-adapter.ts` creates users for OAuth via the custom `DrizzleAdapter`.
- OAuth-created users get a generated random `passwordHash`, not a real customer password.
- The adapter sends a welcome email after user creation.

Redirect/callback behavior:

- `lib/auth/client-callback-url.ts` sanitizes callback URLs so external origins are converted to same-origin paths.
- Checkout page `app/(site)/checkout/page.tsx` redirects unauthenticated users to `/account/sign-in?callbackUrl=/checkout`.

Current OTP status:

- There is no OTP auth provider, OTP API route, OTP DB table, or OTP email template currently implemented.

## 2. Current DB schema relevant to OTP

Primary schema file: `db/schema.ts`.

Relevant tables:

- `users`
  - `id uuid primary key defaultRandom()`
  - `email text not null`, unique index `users_email_unique`
  - `role user_role not null default "customer"`
  - `name`, `image`, `phone`
  - `passwordHash`
  - `emailVerified`
  - `defaultAddressId` references `addresses.id` with `onDelete: set null`
  - `metadata jsonb`
  - `createdAt`, `updatedAt`
- `auth_accounts`
  - OAuth account links.
  - Unique index on `(provider, providerAccountId)`.
  - `userId` cascades to users.
- `auth_sessions`
  - Present for adapter compatibility, but app auth uses JWT sessions.
- `auth_verification_tokens`
  - NextAuth verification token table with `(identifier, token)` primary key.
  - Currently not used by an email provider in `authOptions`.
- `addresses`
  - Auth-owned by `userId`.
- `wishlist_items`
  - Composite primary key `(userId, productId)`.
- `orders`
  - `userId` is nullable.
  - Guest/email ownership is also represented through `shippingEmail`.
  - Payment fields include `paymentStatus`, `paymentGateway`, `paymentMethod`, `paymentId`, `razorpayOrderId`.
- `reservations`
  - Product hold rows keyed to `orderId` and `productId`.

Migration state:

- Drizzle config is in `drizzle.config.ts`.
- Migrations are in `drizzle/`, currently through `0018_orders_gift.sql`.
- DB client is `db/index.ts`, using Neon HTTP SQL via `drizzle-orm/neon-http`.

Existing token helpers:

- `lib/users/email-verification-token.ts` creates HMAC email-change links using `NEXTAUTH_SECRET` with fallbacks to `PAYLOAD_SECRET` or `ADMIN_API_SECRET`.
- `lib/orders/order-access-token.ts` creates order access tokens.
- `lib/cart/reservation-token.ts` creates reservation tokens using `RESERVATION_TOKEN_SECRET`, then `NEXTAUTH_SECRET`, then `AUTH_SECRET`.

## 3. Current API map

API runtime:

- `app/api/v2/[...route]/route.ts` forwards HTTP methods to `api/hono/site-app.ts`.
- `api/hono/site-app.ts` registers the storefront API under `/api/v2`.
- `api/hono/app.ts` registers a broader API including admin routes, but the app route currently imports `site-app`.
- All `/api/v2/*` requests pass through same-origin CORS, same-origin mutation guard, and auth middleware.

Relevant current routes:

- Auth / users
  - `GET /api/v2/users/` admin list
  - `POST /api/v2/users/admins` admin create
  - `POST /api/v2/users/sign-up`
  - `GET /api/v2/users/me`
  - `PATCH /api/v2/users/me/password`
  - `PATCH /api/v2/users/{id}/password` admin reset, admin targets only
  - `PATCH /api/v2/users/me`
  - `POST /api/v2/users/me/email`
  - `GET /api/v2/users/me/verify-email`
- Addresses
  - `GET /api/v2/addresses/`
  - `POST /api/v2/addresses/`
  - `PATCH /api/v2/addresses/{id}`
  - `DELETE /api/v2/addresses/{id}`
- Cart reservations
  - `POST /api/v2/cart/reserve`
  - `POST /api/v2/cart/release`
  - `POST /api/v2/cart/release-expired`
- Payments
  - `POST /api/v2/payments/create-order`
  - `POST /api/v2/payments/verify`
  - `GET /api/v2/payments/payment-link/callback`
- Orders
  - `GET /api/v2/orders/`
  - `GET /api/v2/orders/{id}`
  - `POST /api/v2/orders/`
- Wishlist
  - `GET /api/v2/wishlist/`
  - `POST /api/v2/wishlist/`
  - `DELETE /api/v2/wishlist/`
  - `POST /api/v2/wishlist/notify`
  - `POST /api/v2/wishlist/merge`
- Discounts
  - `POST /api/v2/discounts/validate`
- Newsletter
  - `POST /api/v2/newsletter/subscribe`
  - `GET /api/v2/newsletter/confirm`

There is no current `/api/v2/auth/*` route group.

## 4. Current email system

Email code:

- `lib/email/resend.ts`
- `lib/email/send.ts`
- `lib/email/templates.ts`

Transport selection:

1. If `RESEND_API_KEY` exists, `sendEmail()` uses Resend.
2. Else if SMTP env is configured, `sendEmail()` dynamically imports `nodemailer`.
3. Else in development it logs a mock email notice.

Env names used by email code:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

Existing templates:

- `orderConfirmationEmail()`
- `orderPurchaseNotificationEmail()`
- `welcomeEmail()`
- `reservationExpiryReminderEmail()`
- `emailChangeVerificationEmail()`

Current email send callers relevant to auth:

- Signup route sends `welcomeEmail()`.
- OAuth adapter sends `welcomeEmail()`.
- Email-change route sends `emailChangeVerificationEmail()`.

OTP fit:

- Add an OTP-specific template to `lib/email/templates.ts`.
- Send through `sendEmail()`.
- Do not add a new email transport unless there is a product requirement.

## 5. Current rate-limit system

Rate-limit facade:

- `lib/http/rate-limit.ts`

Port and adapters:

- `lib/ports/rate-limiter.ts`
- `lib/adapters/in-memory-rate-limiter.ts`
- `lib/adapters/upstash-rate-limiter.ts`

Durable adapter selection:

- Uses Upstash Redis when either env pair is present:
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  - `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- Otherwise falls back to in-memory.

Important behavior:

- `rateLimitResponse()` can fail closed in production when `requireDurable: true` and durable Redis is not configured.
- Signup, email change, payment creation, cart reservation/release, restock notify, discount validation, newsletter subscribe, and events use this system.

Existing auth-like limits:

- Signup: prefix `auth:signup`, limit 5 per 60 seconds, `requireDurable: true`.
- Email-change request: prefix `email-change:request`, limit 5 per 60 seconds, `requireDurable: true`.

OTP fit:

- OTP request and verification must use `requireDurable: true`.
- Use separate keys for request and verify, for example `auth:otp:request` and `auth:otp:verify`.
- Verification should also limit by challenge id or normalized email, not only IP.

## 6. Current checkout/cart/wishlist ownership model

Checkout:

- `app/(site)/checkout/page.tsx` requires a logged-in session before rendering checkout.
- `lib/checkout/use-checkout-payment.ts` posts to `/api/v2/payments/create-order`.
- Payment creation can still call `getOrCreateCheckoutCustomer()` by shipping email.

Checkout shell users:

- `db/queries/users.ts#getOrCreateCheckoutCustomer()`:
  - Finds existing user by normalized email.
  - If existing has `passwordHash`, returns null.
  - If existing is a checkout shell, returns it.
  - Otherwise creates a user with metadata `{ source: "checkout" }`, no password hash, and optional name/phone.
- `claimCheckoutShell()` upgrades that shell by setting `passwordHash` and name.

Orders:

- `orders.userId` can be null.
- `GET /api/v2/orders/` returns current user's orders by `orders.userId`.
- It also returns guest orders when `orders.userId IS NULL` and `orders.shippingEmail` matches the session user's email.
- `GET /api/v2/orders/{id}` has the same ownership rule: admin, exact `userId`, or null-user guest order matching session email.
- Payment-link confirmation page can be viewed with a signed order access token from `createOrderAccessToken()`.

Cart:

- Local cart is persisted in Zustand/localStorage under `ftt-cart-v2`.
- Product reservations are server-side through `/api/v2/cart/reserve` and `/api/v2/cart/release`.
- Reservation ownership is protected by signed reservation tokens.
- `clearCart()` does not release reservations and is intended after successful payment.
- `clearCartWithRelease()` releases active reservations.

Payments:

- `POST /api/v2/payments/create-order` creates the order, reserves inventory, emits `order_created`, creates a Razorpay payment link, and returns order/payment metadata.
- `POST /api/v2/payments/verify` requires auth and enforces `order.userId === session.user.id`.
- `GET /api/v2/payments/payment-link/callback` verifies Razorpay payment-link callback signature and redirects to `/checkout/confirmation`.

Wishlist:

- Auth wishlist rows are in `wishlist_items` keyed by `(userId, productId)`.
- Guest wishlist is persisted separately in localStorage under `ftt-wishlist-guest-v1`.
- `components/wishlist/wishlist-merge-on-login.tsx` posts guest product IDs to `/api/v2/wishlist/merge` after login and clears guest storage on success.
- `mergeGuestWishlist()` inserts rows for the current session user and de-dupes with `onConflictDoNothing()`.

OTP impact:

- OTP sign-in must produce the same NextAuth JWT session shape (`id`, `role`, `email`) so all existing ownership checks continue working.
- OTP signup must preserve the checkout-shell upgrade path.
- OTP sign-in should trigger the same client-side wishlist merge because it depends on `useSession()`.

## 7. Where OTP should integrate

Recommended integration points:

1. Add OTP-specific DB table and query functions near current auth/user modules.
2. Add OTP email template to `lib/email/templates.ts`.
3. Add Hono route group, likely `api/hono/routes/auth-otp.ts`, registered under `/api/v2/auth/otp`.
4. Add a new NextAuth `CredentialsProvider` with a distinct id such as `email-otp`.
5. Update sign-in UI to request an OTP and then call `signIn("email-otp", ...)`.
6. Update sign-up UI if the intended product flow is passwordless account creation.

Why use a NextAuth credentials provider for final session creation:

- Existing Hono API auth reads NextAuth JWT cookies.
- Existing pages and providers already use `useSession()` and `getServerAuthSession()`.
- Creating the session through NextAuth avoids a parallel auth system.

Do not integrate OTP into:

- Razorpay route logic.
- Cart reservation tokens.
- Order access tokens.
- Existing email-change HMAC link unless the product specifically wants OTP for email changes.

## 8. Proposed OTP database design

Add a separate OTP challenge table instead of reusing `auth_verification_tokens`.

Reason:

- NextAuth verification tokens store token values directly for email-provider semantics.
- OTP needs attempts, consumption state, purpose, code hashing, delivery metadata, and expiry.

Proposed table: `auth_otp_challenges`

Suggested columns:

- `id uuid primary key defaultRandom()`
- `email text not null`
- `purpose text not null`
  - Suggested values: `sign_in`, `sign_up`, `checkout`
- `codeHash text not null`
- `attempts integer not null default 0`
- `maxAttempts integer not null default 5`
- `expiresAt timestamp with time zone not null`
- `consumedAt timestamp with time zone`
- `userId uuid references users.id on delete set null`
- `requestIpHash text`
- `userAgentHash text`
- `metadata jsonb`
- `createdAt timestamp with time zone not null default now()`
- `updatedAt timestamp with time zone not null default now()`

Suggested indexes:

- Index on `(email, purpose, createdAt)`.
- Index on `expiresAt`.
- Index on `(id, email)`.
- Optional partial index for active challenges where `consumedAt IS NULL`.

Security properties:

- Never store raw OTP codes.
- Store a server-side hash or HMAC of the code.
- Compare using timing-safe comparison where possible.
- Consume atomically so one OTP cannot be reused.
- Increment attempts on every failed verification.
- Expire quickly, for example 5-10 minutes.

## 9. Proposed OTP API design

Option A, recommended: Hono request route plus NextAuth provider for final verification.

Routes:

- `POST /api/v2/auth/otp/request`
  - Body: `{ email, purpose, name? }`
  - Normalize email.
  - Rate-limit with durable limiter.
  - Do not reveal whether account exists.
  - Create challenge with hashed OTP.
  - Send OTP email.
  - Return `{ success: true, challengeId, expiresAt, maskedEmail }`.
- NextAuth provider `email-otp`
  - Credentials: `email`, `challengeId`, `code`, optional `name`, optional `purpose`.
  - Verifies and consumes OTP atomically.
  - For existing user: returns that user.
  - For signup purpose:
    - If checkout shell exists, upgrade it without requiring password.
    - Else create customer user.
  - For sign-in purpose:
    - Only existing users should receive a session.
  - Returns user shape compatible with current JWT callback.

Option B: Hono verifies OTP and returns a custom token.

- Not recommended for this project unless NextAuth is replaced.
- It would create a second session model and bypass existing `getToken()` middleware unless additional work is done.

Recommended endpoint validation:

- Keep schemas strict with `@hono/zod-openapi`.
- Normalize email before DB queries.
- Require `challengeId` on verify to avoid verifying against arbitrary latest email code.
- Keep response messages generic:
  - Request: "If this email can sign in, we sent a code."
  - Verify: "Invalid or expired code."

## 10. Security risk checklist

Must-have:

- No raw OTP in DB.
- No OTP values in logs, analytics events, or error payloads.
- Durable rate limiting required in production for request and verify.
- Attempt counter and lockout per challenge.
- Short expiry window.
- One-time consume with an atomic update.
- Generic responses to prevent account enumeration.
- Same-origin mutation guard should remain in front of Hono OTP request routes.
- OTP code should be generated with `crypto`, not `Math.random()`.
- Email normalization must match `getUserByEmail()` behavior.
- Session creation must go through NextAuth so downstream auth checks stay consistent.

Project-specific risks:

- Guest order visibility currently trusts `orders.shippingEmail` matching `session.user.email` when `orders.userId` is null. OTP makes email control more important; do not create a logged-in session until OTP is verified.
- Checkout shell claiming currently depends on `passwordHash IS NULL`. A passwordless OTP account will need either a new marker or a careful policy for what `passwordHash` means.
- OAuth-created users currently receive a generated `passwordHash`. Do not treat "has passwordHash" as "has a usable password" in new OTP code without checking current adapter behavior.
- Existing email-change confirmation uses HMAC links and requires auth. Do not weaken it by accepting only possession of an email unless product requirements say so.
- Do not touch Razorpay callbacks, payment verification, reservation tokens, or order access tokens for OTP.

## 11. Exact phase implementation plan

Phase 1: Schema and query layer

- Add `authOtpChallenges` table to `db/schema.ts`.
- Generate one Drizzle migration.
- Add query helpers:
  - create challenge
  - fetch active challenge
  - increment failed attempts
  - consume challenge atomically
  - prune expired challenges if desired
- Add unit tests for expiry, wrong code, consumed code, and attempt limits.

Phase 2: Email template and delivery

- Add `otpEmail()` to `lib/email/templates.ts`.
- Send through existing `sendEmail()`.
- Keep OTP out of logs.
- Add a test or snapshot for template escaping and no raw secret leakage.

Phase 3: OTP request API

- Add `api/hono/schemas/auth-otp.ts`.
- Add `api/hono/routes/auth-otp.ts`.
- Register it in `api/hono/site-app.ts`; also register in `api/hono/app.ts` if admin/full API parity is still expected.
- Add durable rate limits:
  - request by IP/email
  - verify by IP/email/challenge
- Return generic responses.

Phase 4: NextAuth provider

- Add a second credentials provider in `lib/auth/options.ts`, for example id `email-otp`.
- Provider verifies/consumes challenge and returns existing session-compatible user.
- Preserve `role` in JWT.
- Ensure it works for both existing customers and checkout shell users.

Phase 5: UI integration

- Update `app/(site)/account/sign-in/page.tsx` to support OTP request and verify.
- Decide whether password sign-in remains visible, becomes fallback, or moves behind "Use password instead".
- Update `app/(site)/account/sign-up/page.tsx` only after product decision on passwordless signup.
- Preserve `callbackUrl` behavior using `buildClientCallbackUrl()`.

Phase 6: Ownership regression checks

- Verify checkout redirect `/checkout -> /account/sign-in?callbackUrl=/checkout -> OTP -> /checkout`.
- Verify wishlist guest merge after OTP session.
- Verify account orders list shows:
  - orders with matching `userId`
  - null-user guest orders with matching `shippingEmail`
- Verify addresses remain scoped to logged-in `userId`.
- Verify payment create/verify behavior is unchanged.

Phase 7: Production readiness

- Confirm durable rate limiter env is present in production.
- Confirm real email transport is configured.
- Run targeted auth tests and route tests.
- Run the repo-required UI gate before shipping any UI changes.

## 12. Questions/blockers

Open product decisions:

- Should OTP replace passwords completely, or be an additional sign-in method?
- Should sign-up be passwordless, or should OTP only verify email before setting a password?
- Should OTP be allowed for admin users? Recommendation: no, keep admin password/OAuth-only unless a separate admin MFA design is made.
- Should OTP codes be 6 digits numeric, alphanumeric, or magic-link style?
- Should email change move from signed link to OTP, or remain as-is?

Implementation blockers before production:

- Durable rate limiter must be configured for production: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- Email delivery must be configured: `RESEND_API_KEY` or full `SMTP_*` settings.
- Need a clear policy for passwordless users because current code uses `passwordHash` to distinguish real accounts from checkout shell users.
- Need confirmation whether existing OAuth users with generated password hashes should be eligible for OTP sign-in by email.

