# Commerce Auth Phase 3.8 QA

Date: 2026-06-27
Environment: local Next dev server at `http://127.0.0.1:3000`

## Summary

Recommendation: **GO for the full `SECURITY.md` audit phase**, with release blockers noted below.

The commerce auth UI and client wiring passed the Phase 3.8 behavioral matrix with mocked OTP/session/payment APIs. No app code was changed in this QA pass. The only file added is this report.

Release blockers before production:
- Live Resend OTP smoke test was not run because no release test inbox was provided.
- `pnpm exec tsc --noEmit --pretty false` fails on existing type issues.
- `pnpm run agent:check` fails in the existing unit test suite before LHCI can run.

## Source Reports Used

- `COMMERCE_AUTH_PHASE_3_7_REPORT.md`
- `COMMERCE_AUTH_DISCOVERY.md`
- `AUTH_OTP_PHASE_3_5_UI_REPORT.md`
- `AUTH_OTP_PHASE_2_6_REPORT.md`

## Browser QA Evidence

Automation: Playwright against the local dev server. OTP, NextAuth, wishlist, address, cart reservation, and payment endpoints were mocked at the network boundary to avoid sending live OTPs or creating real payment/orders.

Raw evidence:
- `/tmp/ftt-commerce-auth-phase38/results.json`
- `/tmp/ftt-commerce-auth-phase38/rerun-results.json`

Focused screenshots:
- `/tmp/ftt-commerce-auth-phase38/checkout-auth-390.png`
- `/tmp/ftt-commerce-auth-phase38/checkout-auth-768.png`
- `/tmp/ftt-commerce-auth-phase38/checkout-auth-1280.png`
- `/tmp/ftt-commerce-auth-phase38/wishlist-dialog-otp-390.png`
- `/tmp/ftt-commerce-auth-phase38/wishlist-dialog-otp-768.png`
- `/tmp/ftt-commerce-auth-phase38/wishlist-dialog-otp-1280.png`
- `/tmp/ftt-commerce-auth-phase38/unknown-email-generic.png`
- `/tmp/ftt-commerce-auth-phase38/unknown-phone-generic.png`

Note: initial script failures in `results.json` were harness selector issues, not app failures. The affected checks were rerun in `rerun-results.json` and focused browser probes.

## Pass/Fail Table

| Area | Check | Status | Evidence |
|---|---|---:|---|
| Wishlist | Logged-out product-card wishlist click opens auth popup, no navigation | PASS | URL stayed `/collection`; auth dialog visible |
| Wishlist | No authenticated wishlist mutation before auth | PASS | `wishlistPost=0` before OTP |
| Wishlist | New logged-out click does not write `ftt-wishlist-guest-v1` item | PASS | guest store remained empty |
| Wishlist | Sign-in from popup sends OTP, verifies, signs in, closes dialog | PASS | `otpStart=1`, `otpVerify=1`, `authCallback=1` |
| Wishlist | Pending product saved after popup sign-in | PASS | POST body contained only `productId` |
| Wishlist | Heart becomes active, toast shown, wishlist refetched | PASS | active heart found, toast visible, `wishlistGet=3` |
| Wishlist | Sign-up from popup creates account and saves pending product | PASS | `registerComplete=1`, `wishlistPost=1` |
| Wishlist | Wishlist sign-up does not collect duplicate address | PASS | registration body had no `address` |
| Wishlist | Closing popup mid-OTP clears pending state | PASS | reopened dialog returned to identifier step; no wishlist POST |
| Wishlist | Logged-in wishlist toggles without auth popup | PASS | no popup; add body omitted `userId` |
| Wishlist | Legacy guest wishlist merges once after login | PASS | one `/wishlist/merge`; local guest store cleared |
| Cart | Logged-out add to cart works without login popup | PASS | reserve called once; no auth popup |
| Cart | Cart drawer/count updates | PASS | `ftt-cart-v2` item created and cart drawer opened |
| Cart | Remove from cart releases reservation | PASS | `/api/v2/cart/release` called for removed item |
| Cart | Cart survives popup open/close and OTP login | PASS | `ftt-cart-v2` before/after matched |
| Checkout | Logged-out cart visit to `/checkout` does not redirect | PASS | URL stayed `/checkout` |
| Checkout | Inline auth gate shown before auth | PASS | “Open your trunk to continue checkout” visible |
| Checkout | No payment button/create-order before auth | PASS | no payment CTA; `createOrder=0` |
| Checkout | Empty cart does not show auth gate unnecessarily | PASS | empty-cart state visible; gate hidden |
| Checkout | Checkout OTP sign-in keeps user on `/checkout` | PASS | URL stayed `/checkout` |
| Checkout | Saved addresses refetch after checkout auth | PASS | `addressesGet=1` after OTP sign-in |
| Checkout | Pre-auth shipping form reset | N/A | shipping form is hidden until auth completes |
| Checkout | Checkout OTP sign-up stays on `/checkout` | PASS | shipping step unlocked after sign-up |
| Checkout | Checkout auth sign-up does not duplicate address collection | PASS | registration body had no `address` |
| Checkout | Payment starts only after auth/review action | PASS | `createOrder=0` before review; `createOrder=1` after CTA |
| Checkout | Create-order payload omits client totals | PASS | no `total`, `subtotal`, `taxAmount`, `shippingCost`, or amount fields in client payload |
| Security | Unknown email copy remains generic | PASS | visible copy: “If this account can continue...” |
| Security | Unknown phone copy remains generic | PASS | visible copy: “If this account can continue...” |
| Security | OTP tokens are not in local/session storage | PASS | storage scan found no challenge/login/registration tickets |
| Security | Admin OTP remains rejected | PASS | source-backed from Phase 2.6 provider guard; no admin policy edits |
| Security | External callback URL is stripped to same-origin URL | PASS | callback became `http://127.0.0.1:3000/phish` |
| Security | Pending wishlist action cannot target another user | PASS | pending product is React state; server scopes by session; no client `userId` |
| Security | Closing popup mid-OTP leaves no reusable pending action | PASS | covered by close/reopen browser check |
| Security | Reused login ticket still fails | PASS | source-backed by atomic `consumeOtpLoginTicket` consumed guard |
| Email | Live Resend OTP smoke test | N/A | not run; no test inbox provided |
| Responsive | Checkout auth gate at 390/768/1280 | PASS | screenshots saved; no horizontal overflow |
| Responsive | Wishlist OTP dialog at 390/768/1280 | PASS | screenshots saved; six OTP slots visible |
| Responsive | WhatsApp widget does not block OTP CTA | PASS | overlap check false at tested widths |

## Files Inspected

- `components/product/wishlist-button.tsx`
- `components/wishlist/wishlist-merge-on-login.tsx`
- `lib/store/wishlist-store.ts`
- `lib/store/cart-store.ts`
- `components/cart/add-to-cart-button.tsx`
- `components/cart/cart-drawer.tsx`
- `components/product/product-card-commerce-row.tsx`
- `app/(site)/checkout/page.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/checkout/checkout-auth-gate.tsx`
- `components/checkout/saved-address-picker.tsx`
- `components/checkout/checkout-progress.tsx`
- `components/checkout/order-summary.tsx`
- `lib/checkout/use-checkout-payment.ts`
- `api/hono/routes/wishlist.ts`
- `db/queries/wishlist.ts`
- `api/hono/routes/auth-otp.ts`
- `db/queries/auth-otp.ts`
- `lib/auth/options.ts`
- `lib/auth/client-callback-url.ts`

## Changed Files

Changed in this QA pass:
- `COMMERCE_AUTH_PHASE_3_8_QA.md`

No application code was edited. No payment logic, Razorpay routes, product pricing, discount validation, cart reservation logic, order completion logic, product-card UI, wishlist API logic, or admin auth policy was changed during this pass.

The worktree already contained many unrelated dirty files before this report was added. Payment/product/checkout files are dirty from prior work, but were not patched in this QA pass.

## Bugs Fixed

None in application code.

Test harness fixes only:
- Added complete NextAuth provider metadata to the mocked `/api/auth/providers` response so `signIn("email-otp")` exercised the real client flow.
- Reran the popup-cancel check using the dialog close/Escape behavior because the verify step intentionally does not render a second “Cancel” button.
- Scoped empty-cart text matching to `#main-content` because the cart drawer also has an `aria-live` “Your bag is empty” region.

## Command Results

`pnpm run lint`: PASS with existing warning
- Node engine warning: current `v25.4.0`; package wants `>=20.9 <25`
- Existing warning: `app/(site)/our-story/page.tsx` missing hook dependencies `goNext`, `goPrev`, `goToPage`

`pnpm run build`: PASS
- Node engine warning: current `v25.4.0`; package wants `>=20.9 <25`
- Build completed successfully

`pnpm exec tsc --noEmit --pretty false`: FAIL
- `.next/dev/types/app/(site)/collection/page.ts`: `CollectionPageProps` `searchParams` type mismatch with generated `PageProps`
- `tests/unit/rate-limit-production.test.ts(19,17)`: cannot assign to readonly `NODE_ENV`

`pnpm run agent:check`: FAIL
- Stops in `pnpm run test`; LHCI matrix did not run.
- Node engine warning: current `v25.4.0`; package wants `>=20.9 <25`
- Vitest summary: 10 failed test files, 24 failed tests, 107 passed files, 1477 passed tests.
- Notable failing files shown by output: `packing-slip-render.test.ts`, `site-feedback-fixes.test.ts`, `checkout-estimate.test.ts`, `auth-middleware.test.ts`, `order-charge-totals-route.test.ts`.
- Additional non-fatal test log noise includes analytics/admin event sink errors from mocked DB setup.

## Remaining Risks

- Live OTP delivery through Resend was not tested in this pass.
- Razorpay was mocked at the browser boundary; no live payment order or verification was created.
- The full repo quality gate is not green because existing unit/type failures stop `agent:check`.
- The dev machine is running Node `v25.4.0`, outside the package engine range.
- Existing dirty worktree makes it important to review final diffs before merging.

## Recommendation

**GO for the full `SECURITY.md` audit phase.**

Do not treat this as production release approval until live OTP email delivery is smoke-tested and the unrelated TypeScript/unit gate failures are resolved or formally accepted.
