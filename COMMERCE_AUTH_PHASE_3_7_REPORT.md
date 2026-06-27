# Commerce Auth Phase 3.7 Report

Date: 2026-06-27

Scope: Commerce auth UI integration. Razorpay amount calculation, Razorpay signature verification, discount validation, product pricing, product inventory logic, cart reservation token signing, order completion logic, and admin auth policy were not changed in this phase.

## Summary

Commerce Auth Phase 3.7 is implemented.

- Wishlist now requires account auth for new logged-out clicks and opens an OTP popup instead of adding new guest wishlist items.
- Add-to-cart remains guest-friendly.
- Checkout no longer redirects guests to `/account/sign-in`; guests with cart items now see inline OTP sign-in/sign-up before checkout steps and payment.
- Checkout sign-up collects email OTP, full name, and phone only. Address remains in the normal checkout shipping step.

Recommendation: Commerce Auth Phase 3.8 QA can begin. Release remains gated by existing unrelated repo test/type issues documented below.

## Changed Files

| File | Change |
| --- | --- |
| `components/account/otp-auth-panel.tsx` | New reusable OTP panel for account, wishlist, and checkout contexts |
| `app/(site)/account/sign-in/page.tsx` | Uses `OtpAuthPanel` for default OTP flow; password fallback remains under `?mode=password` |
| `app/(site)/account/sign-up/page.tsx` | Uses `OtpAuthPanel` with address required for account sign-up |
| `components/product/wishlist-button.tsx` | Logged-out click opens OTP Dialog; pending product saves after successful auth |
| `app/(site)/checkout/page.tsx` | Removed guest server redirect so checkout can render inline auth |
| `components/checkout/checkout-auth-gate.tsx` | New inline checkout OTP gate |
| `components/checkout/checkout-page-client.tsx` | Blocks checkout steps/payment until authenticated; refetches addresses after auth |
| `COMMERCE_AUTH_PHASE_3_7_REPORT.md` | This report |

## Payment And Cart Files

Phase 3.7 did not edit payment, Razorpay, cart reserve/release, or add-to-cart logic files.

The working tree already contains unrelated dirty diffs in these files, visible before/alongside this phase:

- `api/hono/routes/payments.ts`
- `lib/checkout/use-checkout-payment.ts`
- `components/cart/add-to-cart-button.tsx`
- `components/product/product-card-commerce-row.tsx`

No Phase 3.7 changes were made to Razorpay create-order/verify amount calculation, signature verification, discount validation, product pricing, product inventory logic, cart reservation token signing, or order completion logic.

## Screenshots

| Surface | 390px | 768px | 1280px |
| --- | --- | --- | --- |
| Checkout inline auth gate | `/tmp/ftt-commerce-auth-phase37/checkout-auth-390.png` | `/tmp/ftt-commerce-auth-phase37/checkout-auth-768.png` | `/tmp/ftt-commerce-auth-phase37/checkout-auth-1280.png` |

Additional screenshots:

| State | Path |
| --- | --- |
| Checkout after OTP sign-in | `/tmp/ftt-commerce-auth-phase37/checkout-after-otp-390.png` |
| Wishlist auth dialog | `/tmp/ftt-commerce-auth-phase37/wishlist-dialog-390.png` |

## QA Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Logged-out wishlist click opens auth popup | PASS | Browser click on collection wishlist showed `Save this piece to your trunk` dialog |
| OTP sign-in in popup saves clicked product | PASS | Mocked OTP flow called `otp/start` once, `otp/verify` once, `email-otp` callback once, and wishlist POST once |
| OTP sign-up in popup saves clicked product | PASS | Mocked signup flow called `otp/start`, `otp/verify`, `register/complete`, `email-otp` callback, and wishlist POST once |
| Logged-in wishlist still toggles normally | PASS BY SOURCE | Authenticated path still uses existing account add/remove mutations and auth-scoped API |
| Cancel popup does not save product | PASS BY SOURCE | Dialog close clears `pendingProductId`; save happens only inside `onSuccess` |
| Old guest wishlist merge remains wired | PASS | `WishlistMergeOnLogin` and guest store were not removed |
| New guest wishlist clicks do not add localStorage entries | PASS | Legacy store initialized as `{"productIds":[]}`, but clicked product was not added; save happened through authenticated POST |
| Logged-out add-to-cart works with no popup | PASS | Browser click on `+ Cart` called `/api/v2/cart/reserve` once, wrote `ftt-cart-v2`, and showed no auth dialog |
| Cart drawer/count remains guest-friendly | PASS | Cart storage updated under `ftt-cart-v2`; no auth popup appeared |
| Logged-out checkout with cart shows inline OTP auth gate | PASS | `/checkout` rendered gate at 390/768/1280 with no redirect |
| Checkout no longer hard-redirects to sign-in | PASS | Browser stayed on `/checkout`; `paymentCreate` call count stayed 0 |
| Empty cart checkout shows empty-cart state | PASS BY SOURCE | Existing `!hasItems` branch still renders `EmptyCart` before auth gate |
| OTP login inside checkout keeps user on `/checkout` | PASS | Mocked sign-in completed and URL remained `/checkout` |
| OTP signup inside checkout keeps user on `/checkout` | PASS | Mocked signup completed and URL remained `/checkout` |
| After auth, saved addresses load | PASS | Checkout auth success triggered `/api/v2/addresses` once in sign-in and sign-up flows |
| Checkout payment flow not called before auth | PASS | `paymentCreate` count was 0 in unauthenticated gate screenshots |
| No payment/cart/Razorpay amount logic changed | PASS | Payment/cart route/hook logic not edited in this phase |
| Auth tokens not stored in localStorage/sessionStorage | PASS | Source scan found token values only in React state/API payloads |
| Admin OTP remains rejected | PASS BY SOURCE | Backend provider/admin policy was untouched from Phase 2.6 |
| External callbackUrl remains rejected | PASS BY SOURCE | Account flows still use `buildClientCallbackUrl()` |

## Browser QA Notes

Browser plugin runtime was listed but the required Node REPL browser control tool was not exposed. Per frontend testing fallback policy, QA used standard Playwright against the existing local dev server at `http://127.0.0.1:3000`.

Route mocks were used only for OTP/NextAuth/session/address/wishlist responses where live OTP email would otherwise be required. No live OTP emails were sent. Payment create-order was explicitly mocked as blocked during unauthenticated checkout QA and was not called by the UI before auth.

Observed browser warnings:

- `Unrecognized feature: 'web-share'.`
- Existing collection-page LCP image warning for `/banner/collection_banner.png`.
- Existing collection-page `400 Bad Request` resource warning during collection QA.

## Verification Commands

| Command | Result |
| --- | --- |
| `pnpm exec eslint components/account/otp-auth-panel.tsx app/(site)/account/sign-in/page.tsx app/(site)/account/sign-up/page.tsx components/product/wishlist-button.tsx app/(site)/checkout/page.tsx components/checkout/checkout-auth-gate.tsx components/checkout/checkout-page-client.tsx` | PASS |
| `pnpm run lint` | PASS with existing `app/(site)/our-story/page.tsx` hook dependency warning |
| `pnpm run build` | PASS |
| `pnpm exec tsc --noEmit --pretty false` | FAIL on existing unrelated `tests/unit/rate-limit-production.test.ts(19,17)` readonly `NODE_ENV` assignment |
| `pnpm run agent:check` | FAIL in existing `pnpm run test` failures before LHCI |

Common environment warning:

- Local Node is `v25.4.0`; package engines require `>=20.9 <25`.

## Existing Unrelated Failures

`pnpm exec tsc --noEmit --pretty false`:

- `tests/unit/rate-limit-production.test.ts(19,17): Cannot assign to 'NODE_ENV' because it is a read-only property.`

`pnpm run agent:check` stopped during `pnpm run test`. Visible unrelated failing areas included:

- `tests/unit/packing-slip-render.test.ts`
- `tests/unit/site-feedback-fixes.test.ts`
- `tests/unit/checkout-estimate.test.ts`
- `tests/unit/auth-middleware.test.ts`
- `tests/unit/order-charge-totals-route.test.ts`

Vitest summary from the run: 10 failed test files, 107 passed test files; 24 failed tests, 1477 passed tests.

## Risks And Follow-Ups

- The legacy guest wishlist store still initializes `ftt-wishlist-guest-v1` with an empty array. This is acceptable for one-release cleanup, but Phase 3.8 should verify old guest wishlist migration behavior with real accounts.
- Checkout order ownership still needs future backend hardening: after inline auth, UI prevents guest payment, but `/api/v2/payments/create-order` is still guest-capable and currently derives customer identity from shipping contact data. A future backend pass should ensure authenticated checkout attaches orders to `authUser.id` while preserving shipping email as contact data.
- The 390px checkout gate is usable, but the floating WhatsApp control sits close to the auth card. It does not block the OTP input or CTA in the captured viewport, but should be watched in Phase 3.8 visual QA.
- Browser QA used mocked OTP/session responses, not live email delivery. Backend OTP/session behavior was already covered in Phase 2.6 and Phase 3.5.
