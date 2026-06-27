# Commerce Auth Phase 3.6 Discovery

Date: 2026-06-27

Scope: discovery only. No auth, checkout, cart, Razorpay, wishlist, product, payment, or address logic was changed.

## Executive summary

Current behavior does not match the new product requirement in two places:

- Wishlist currently supports logged-out localStorage wishlist toggles and merges those guest items after login.
- Checkout currently redirects unauthenticated users away from `/checkout` at the server page level.

Current cart behavior already matches the requirement: logged-out users can add to cart, cart state is local/guest-friendly, and reservation/release endpoints do not require login.

Recommended direction:

- Extract the Phase 3 OTP sign-in/sign-up flow into reusable auth panels that can run in a Dialog for wishlist and inline inside checkout.
- Keep OTP tokens only in React state.
- Save pending wishlist product only after `useSession()` confirms a customer session and the existing auth-scoped wishlist API accepts the request.
- Remove the server redirect from checkout and gate checkout progression/payment inside `CheckoutPageClient` until inline OTP auth completes.

## 1. Current wishlist behavior

### Logged-in behavior

- `components/product/wishlist-button.tsx` uses `useSession()` and enables the account wishlist query only when `session?.user?.id` exists.
- Logged-in wishlist state comes from `GET /api/v2/wishlist`.
- Logged-in add uses `POST /api/v2/wishlist` with `{ productId }`.
- Logged-in remove uses `DELETE /api/v2/wishlist/{productId}`.
- The client invalidates `["wishlist"]` after successful add/remove.

Exact files and functions:

- `components/product/wishlist-button.tsx`
  - `fetchWishlist()` calls `/api/v2/wishlist`.
  - `WishlistButton()` branches on `session?.user?.id`.
  - `addMutation` posts `/api/v2/wishlist`.
  - `removeMutation` deletes `/api/v2/wishlist/{productId}`.
  - `handleToggle()` chooses account mutation for logged-in users.
- `api/hono/routes/wishlist.ts`
  - `registerWishlistRoutes()` protects account wishlist GET/POST/DELETE with `requireAuth()`.
- `db/queries/wishlist.ts`
  - `listWishlistProductIds(userId)` filters by `wishlistItems.userId`.
  - `addToWishlist(userId, productId)` inserts using the authenticated user id.
  - `removeFromWishlist(userId, productId)` deletes with both user id and product id.

Security status: account wishlist writes are already server-side user-scoped. The client does not send a user id.

### Guest behavior

Current guest behavior conflicts with the new requirement.

- Logged-out wishlist clicks do not open auth.
- `WishlistButton.handleToggle()` calls the guest Zustand store and shows local toast copy.
- Guest wishlist items persist in localStorage under `ftt-wishlist-guest-v1`.
- Guest wishlist state uses product ids only.

Exact files and functions:

- `components/product/wishlist-button.tsx`
  - `isInWishlist` reads `guestProductIds` when no session exists.
  - `handleToggle()` calls `guestToggle(productId)` when unauthenticated.
- `lib/store/wishlist-store.ts`
  - `useGuestWishlistStore` stores `productIds`.
  - `addItem`, `removeItem`, `toggle`, `has`, and `clear` mutate guest wishlist state.
  - `persist` uses localStorage name `ftt-wishlist-guest-v1`.

### Merge-on-login behavior

- `components/providers.tsx` mounts `WishlistMergeOnLogin` globally inside `SessionProvider`.
- `WishlistMergeOnLogin` waits for a session, reads local guest wishlist product ids, posts them to `/api/v2/wishlist/merge`, clears local wishlist, and invalidates `["wishlist"]`.
- The API merge route is authenticated and merges product ids into the current user's wishlist.

Exact files and functions:

- `components/providers.tsx`
  - `WishlistMergeOnLogin` is mounted for all pages.
- `components/wishlist/wishlist-merge-on-login.tsx`
  - `WishlistMergeOnLogin()` posts `{ productIds }` to `/api/v2/wishlist/merge`.
  - Uses `mergedForSessionRef` to avoid duplicate merge for the same session.
- `api/hono/routes/wishlist.ts`
  - `/merge` uses `requireAuth()` and `mergeGuestWishlist(authUser.id, body.productIds)`.
- `db/queries/wishlist.ts`
  - `mergeGuestWishlist(userId, guestProductIds)` inserts all products under the authenticated `userId` with `onConflictDoNothing()`.

Discovery note: if the product requirement means "no guest wishlist at all", this merge should stop being fed by new guest clicks. A one-release compatibility path can keep the merge component only to clean up old `ftt-wishlist-guest-v1` data, but that must be an explicit product decision.

## 2. Current cart behavior

### Add item behavior

Current cart behavior already matches the new requirement.

- Add to cart does not require login.
- Product detail and product-card add flows reserve stock first through `/api/v2/cart/reserve`.
- After reservation succeeds, the item is stored in the local cart store with `reservationToken` and `reservedUntil`.
- Quantity is effectively one for the current one-of-a-kind product model.

Exact files and functions:

- `components/cart/add-to-cart-button.tsx`
  - `handleAddToCart()` posts to `/api/v2/cart/reserve`.
  - On success, it calls `addItem()` from the cart store.
- `components/product/product-card-commerce-row.tsx`
  - `handleAddToCart()` posts to the configured cart reserve endpoint.
  - On success, it calls `addItem()` with reservation metadata.
- `lib/store/cart-store.ts`
  - `useCartStore.addItem()` inserts local cart items.

### Local storage behavior

- Cart persists in localStorage through Zustand.
- Storage key is `ftt-cart-v2`.
- Persisted state only includes `items`.
- Cart item shape includes `productId`, `title`, `slug`, `price`, optional image/sku, `quantity`, `reservationToken`, and `reservedUntil`.

Exact file:

- `lib/store/cart-store.ts`

### Reservation/release behavior

- `api/hono/routes/cart.ts` exposes `/reserve` without auth.
- `/reserve` validates stock state and creates signed reservation metadata.
- `/release` does not require auth, but active reservations require the matching reservation token.
- Removing an item from local cart calls reservation release when the item has `reservedUntil`.
- `clearCart()` intentionally does not release reservations after successful payment.
- `clearCartWithRelease()` releases active reservations before clearing.

Exact files and functions:

- `api/hono/routes/cart.ts`
  - `/reserve`
  - `/release`
  - `/release-expired`
- `lib/store/cart-store.ts`
  - `releaseReservation()`
  - `removeItem()`
  - `clearCart()`
  - `clearCartWithRelease()`

Auth status: cart reserve/release is intentionally guest-safe. Do not add login requirements to add-to-cart.

## 3. Current checkout auth gate

### Current server redirect

`app/(site)/checkout/page.tsx` currently blocks guests before the checkout client renders:

- It calls `getServerAuthSession()`.
- If there is no session, it redirects to `/account/sign-in?callbackUrl=%2Fcheckout`.
- `CheckoutPageClient` only renders for authenticated users.

This must change for inline checkout auth. The server page needs to allow guest rendering and pass only non-sensitive page data into the client.

### What `CheckoutPageClient` expects

`components/checkout/checkout-page-client.tsx` already has partial unauthenticated behavior:

- It reads `useSession()`.
- It reads local cart items from `useCartStore`.
- Saved addresses query is enabled only when `session?.user?.id` exists.
- Profile defaults are seeded from `session.user.name` and `session.user.email` when available.
- Address saving only happens when `session?.user?.id` exists.
- Checkout progression and payment currently do not have an explicit inline auth gate because the server page already blocks guests.

Important behavior:

- If the server redirect is removed without adding an inline gate, a guest could reach the checkout form with no saved addresses and no account save.
- The payment create-order route is guest-capable, so the UI must explicitly prevent payment until auth completes if the product requirement says checkout should ask for login inside the checkout page.

### Where saved addresses load

- `components/checkout/checkout-page-client.tsx`
  - `fetchAddresses()` calls `/api/v2/addresses`.
  - `useQuery({ queryKey: ["addresses"], enabled: Boolean(session?.user?.id) })`.
- `api/hono/routes/addresses.ts`
  - GET, POST, PATCH, and DELETE all use `requireAuth()`.
  - Reads and mutations are scoped to `authUserOrResponse.id`.

Once inline OTP login updates the NextAuth session, the existing address query can load saved addresses automatically. The implementation should still invalidate or refetch `["addresses"]` after auth to avoid session-lag edge cases.

### Where payment route requires auth

- `api/hono/routes/payments.ts`
  - `/create-order` does not require auth. It validates product/reservation data, computes totals server-side, creates or finds a checkout customer by shipping email, creates the order, and returns a Razorpay payment link.
  - `/verify` does require auth and checks `order.userId === authUser.id`.
  - `/payment-link/callback` is public but validates the Razorpay signature before completing the order and redirecting to confirmation.
- `lib/checkout/use-checkout-payment.ts`
  - `startPayment()` calls `/api/v2/payments/create-order`.
  - If `paymentLinkUrl` exists, it redirects to Razorpay Checkout.
  - The modal fallback posts to `/api/v2/payments/verify`.

Discovery risk: because `/create-order` is guest-capable and chooses/creates a checkout customer from shipping contact fields, inline checkout auth should ensure the authenticated customer identity and shipping email policy are clear before payment. Otherwise a logged-in user could still create an order attached to a checkout shell or another email if the shipping email differs.

### What needs to change for inline auth

Required checkout changes later:

- Remove the server redirect in `app/(site)/checkout/page.tsx`.
- Render an inline OTP auth panel inside `CheckoutPageClient` when `status !== "authenticated"`.
- Block address progression/payment until auth completes.
- Keep local cart visible and intact while auth runs.
- After OTP login/register:
  - keep the user on `/checkout`,
  - refresh session-dependent data,
  - refetch saved addresses,
  - continue the same checkout flow,
  - avoid clearing or reassigning local cart items.
- Ensure payment remains server-authoritative and cart reservation tokens continue to be sent unchanged.

## 4. OTP UI reuse plan

### Existing reusable OTP pieces

Reusable as-is:

- `components/account/otp-code-input.tsx`
  - `OtpCodeInput` wraps shadcn `InputOTP`, filters non-digits, supports paste, emits completion at six digits, and shows invalid styling.
- `components/account/otp-resend-button.tsx`
  - `OtpResendButton` calculates cooldown from `resendAvailableAt` and disables resend until available.
- `components/account/otp-stepper.tsx`
  - `OtpStepper` supports the sign-up stepper.
- `components/account/signup-address-step.tsx`
  - `SignupAddressStep` already supports address labels: Home, Work, Studio, Family, Other.
- `components/ui/input-otp.tsx`
  - shadcn/input-otp primitives are already installed.

### Existing sign-in/sign-up logic to extract

`app/(site)/account/sign-in/page.tsx` currently owns:

- identifier state,
- `/api/v2/auth/otp/start` with purpose `sign_in`,
- `/api/v2/auth/otp/verify`,
- `signIn("email-otp", { loginTicket, redirect: false, callbackUrl })`,
- resend behavior,
- OTP focus and auto-submit guards,
- safe callback handling through `buildClientCallbackUrl()`.

`app/(site)/account/sign-up/page.tsx` currently owns:

- Email -> Verify -> Details -> Address step state,
- `/api/v2/auth/otp/start` with purpose `sign_up`,
- `/api/v2/auth/otp/verify` returning a registration token,
- `/api/v2/auth/otp/register/complete`,
- `signIn("email-otp", { loginTicket, redirect: false, callbackUrl })`,
- address collection through `SignupAddressStep`.

Recommended extraction:

- Add a reusable client component such as `components/account/otp-auth-panel.tsx`.
- Support modes:
  - `sign-in`
  - `sign-up`
  - optionally `combined` with tabs or secondary CTA for Dialog use.
- Props:
  - `callbackUrl?: string`
  - `onAuthenticated?: () => void`
  - `onCancel?: () => void`
  - `requireAddress?: boolean`
  - `initialIdentifier?: string`
  - `surface: "page" | "dialog" | "checkout"`
- Keep challengeToken, registrationToken, loginTicket, and OTP only in React state.
- Use `signIn("email-otp", { loginTicket, redirect: false, callbackUrl: safeInternalUrl })`.
- For dialog/checkout surfaces, avoid route push after successful sign-in. Let `SessionProvider` update, call `router.refresh()` if needed, then call `onAuthenticated()`.

### Wishlist popup flow

Recommended later implementation:

- In `WishlistButton`, replace guest localStorage toggle with an OTP auth Dialog.
- Store only the clicked `productId` in component state while the dialog is open.
- After OTP login/register succeeds and `useSession()` is authenticated:
  - call existing `POST /api/v2/wishlist` with the pending product id,
  - invalidate `["wishlist"]`,
  - clear pending state,
  - close the dialog.
- Do not store pending wishlist action in localStorage unless product explicitly asks for cross-tab resume.
- Keep API user selection server-side through `requireAuth()`.

### Checkout inline flow

Recommended later implementation:

- In `CheckoutPageClient`, render an inline OTP auth section before shipping details when unauthenticated.
- Preserve local cart and checkout form draft while auth runs.
- After OTP login/register:
  - do not navigate away,
  - refetch `["addresses"]`,
  - seed profile defaults from the new session if the user has not typed values,
  - continue to the shipping step.
- For sign-up from checkout, make address required or let checkout address form collect it immediately after auth. Avoid two competing address forms unless the UI is intentionally designed for that.

### Callback handling

Current page auth uses `buildClientCallbackUrl()` to preserve only safe internal callback URLs. Inline auth should preserve that safety but avoid redirecting:

- Wishlist Dialog: callback can be current pathname or omitted; close dialog after auth.
- Checkout panel: callback should be `/checkout`, but use `redirect: false` and stay on the page.
- Account pages: keep existing redirect behavior.

## 5. Implementation plan

### Files likely to change

Auth reuse:

- `components/account/otp-auth-panel.tsx` or equivalent new reusable OTP auth component.
- `app/(site)/account/sign-in/page.tsx` to consume shared sign-in panel without changing visible page behavior.
- `app/(site)/account/sign-up/page.tsx` to consume shared sign-up panel without changing visible page behavior.

Wishlist:

- `components/product/wishlist-button.tsx`
  - remove guest toggle behavior from click path,
  - open OTP auth dialog for unauthenticated users,
  - save pending product after auth.
- `components/wishlist/wishlist-merge-on-login.tsx`
  - decide whether to keep as one-time legacy migration or disable once guest wishlist creation is removed.
- `lib/store/wishlist-store.ts`
  - keep temporarily for legacy cleanup or remove in a later cleanup phase after migration.
- `components/providers.tsx`
  - update only if merge-on-login policy changes.

Checkout:

- `app/(site)/checkout/page.tsx`
  - remove server redirect.
- `components/checkout/checkout-page-client.tsx`
  - add inline auth gate,
  - block checkout progression/payment until authenticated,
  - refetch saved addresses after auth.
- `components/checkout/checkout-progress.tsx`
  - adjust account step so it represents inline auth and does not force navigation away during checkout.
- `components/checkout/saved-address-picker.tsx`
  - likely no functional change; verify layout once addresses load after inline auth.

Possible backend review only if identity mismatch appears during implementation:

- `api/hono/routes/payments.ts`
  - review whether authenticated checkout should prefer `authUser.id` over checkout-shell lookup by shipping email.
  - Do not change payment math, Razorpay signatures, or reservation handling without a separate targeted review.

### Files not to touch for this requirement

- Cart reserve/release logic in `api/hono/routes/cart.ts`.
- Cart local store behavior in `lib/store/cart-store.ts`, except only if a future UI bug proves integration mismatch.
- Razorpay signature verification or payment payload calculations.
- Product inventory logic.
- Order ownership/address ownership logic unless the checkout identity risk is confirmed during implementation.

### Risks

- Stale `ftt-wishlist-guest-v1` localStorage can still merge old guest wishlist items after login.
- Pending wishlist save can race with session propagation if it fires before NextAuth session is available.
- Closing the wishlist auth dialog mid-flow must clear pending product state.
- Checkout cart reservations can expire while the user is completing OTP auth.
- Removing checkout server redirect without a client gate would allow guest checkout to continue.
- `/create-order` is guest-capable and currently derives customer identity from shipping contact fields, so authenticated checkout needs a clear email/user attachment policy.
- `signIn("email-otp", { redirect: false })` returns before all session consumers necessarily refetch; checkout and wishlist should explicitly refresh or invalidate dependent queries.

### Rollback plan

- Restore checkout server redirect in `app/(site)/checkout/page.tsx`.
- Restore guest wishlist local toggle path in `components/product/wishlist-button.tsx`.
- Keep existing cart behavior unchanged throughout, so cart rollback should not be needed.
- Leave OTP backend untouched unless a verified integration mismatch requires a separate backend fix.

## 6. Security notes

- Do not store OTP, challengeToken, registrationToken, loginTicket, or pending auth secrets in localStorage/sessionStorage.
- Do not print OTPs, challenge tokens, login tickets, or API secrets to console logs.
- Do not reveal account existence in wishlist or checkout OTP flows.
- Wishlist pending action must save only after a real authenticated session exists.
- Wishlist API should continue deriving `userId` from `requireAuth()`, never from client payload.
- Pending wishlist product id is not secret, but it should be cleared on cancel/failure to prevent accidental save after a later different login.
- Add-to-cart must remain guest-safe and local-cart-friendly.
- Checkout payment payload must remain server-authoritative; client totals and local cart state are not trusted.
- Cart reservation tokens must remain tied to the reserved product and must not become account credentials.
- Saved addresses should continue loading only through authenticated address routes scoped to the current user.
- Admin OTP protection from Phase 2.6 must continue to apply; customer OTP surfaces should not become admin login surfaces.

## Search and inspection log

Searches run:

- `rg "wishlist" app components lib api db`
- `rg "useSession|signIn\\(|email-otp|callbackUrl" app components lib api`
- `rg "redirect\\(|callbackUrl=/checkout" app components lib`
- `rg "removeItem|addItem|clearCart|reserve|release" app components lib api`
- `rg "addresses|savedAddresses|useQuery" components/checkout app api lib`
- `rg "create-order|verify|razorpay|payment" app components lib api`

Files inspected:

- `app/(site)/account/sign-in/page.tsx`
- `app/(site)/account/sign-up/page.tsx`
- `components/account/otp-code-input.tsx`
- `components/account/otp-resend-button.tsx`
- `components/account/otp-stepper.tsx`
- `components/account/signup-address-step.tsx`
- `components/ui/input-otp.tsx`
- `components/product/wishlist-button.tsx`
- `components/wishlist/wishlist-merge-on-login.tsx`
- `lib/store/wishlist-store.ts`
- `lib/store/cart-store.ts`
- `components/product/product-card-commerce-row.tsx`
- `components/cart/add-to-cart-button.tsx`
- `components/cart/cart-drawer.tsx`
- `components/cart/cart-page-client.tsx`
- `app/(site)/checkout/page.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/saved-address-picker.tsx`
- `components/checkout/checkout-progress.tsx`
- `components/checkout/order-summary.tsx`
- `components/providers.tsx`
- `api/hono/routes/wishlist.ts`
- `api/hono/routes/cart.ts`
- `api/hono/routes/payments.ts`
- `api/hono/routes/addresses.ts`
- `db/queries/wishlist.ts`
- `lib/checkout/use-checkout-payment.ts`

## Discovery decision

Phase 3.6 implementation is feasible.

Recommended next phase: proceed with implementation only after accepting these product decisions:

1. Guest wishlist localStorage should stop receiving new items.
2. Existing `ftt-wishlist-guest-v1` data should either be merged once for legacy users or cleared/deprecated.
3. Checkout should require completed inline auth before payment.
4. Checkout order ownership policy should be clarified when logged-in account email differs from shipping email.
