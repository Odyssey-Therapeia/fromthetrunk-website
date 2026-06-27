# OTP Auth Phase 3.5 UI QA Report

Date: 2026-06-27

Scope: OTP auth UI QA and polish only. No Razorpay, checkout payment payload, cart reservation, wishlist API, product, order ownership, address ownership, or payment route files were edited in this QA pass.

## Recommendation

GO for Phase 4 security hardening from the OTP UI side.

Release caveat: the repo still has unrelated TypeScript/test failures documented below. Those are not caused by this OTP UI pass, but they remain CI/release gates.

## Changed Files

| File | Change |
| --- | --- |
| `app/(site)/account/sign-in/page.tsx` | OTP sent state focus hardening, one-time auto-submit guard integration, duplicate alternate link cleanup |
| `app/(site)/account/sign-up/page.tsx` | OTP sent state focus hardening, one-time auto-submit guard integration, duplicate alternate link cleanup |
| `components/account/otp-code-input.tsx` | Added completion/paste handling so 6-digit paste/fill paths trigger once |
| `AUTH_OTP_PHASE_3_5_UI_REPORT.md` | This report |

## Bugs Fixed

| Bug | Fix |
| --- | --- |
| OTP sent text existed twice in the DOM after send because the visible message and screen-reader live message duplicated the same text | The visible sent notice now owns `aria-live="polite"`; duplicate hidden sent copy was removed |
| Full 6-digit paste/fill did not reliably trigger verification | `OtpCodeInput` now emits `onComplete` on complete digit entry and 6-digit paste; pages guard with `submittedOtpRef` so auto-submit happens once |
| OTP input was not reliably focused immediately after moving into verify state | Added verify-step focus effects on sign-in and sign-up |
| Auth card displayed duplicate alternate links on mobile/desktop | Removed local duplicate links and kept the shared `AccountAuthFrame` alternate link |

## Pass/Fail Table

| Area | Result | Evidence |
| --- | --- | --- |
| Sign-in default UI | PASS | `/account/sign-in` shows OTP flow only by default; no password input; CTA is `Send OTP`; screenshot paths below |
| Sign-in OTP sent state | PASS | Masked and generic messages verified; no account enumeration text; `aria-live` present; OTP input focus verified |
| OTP input | PASS | Six slots render; non-digits rejected; verify disabled until 6 digits; paste/fill completes once; duplicate verify calls not observed |
| Resend | PASS | Cooldown disabled state observed; resend called `otp/start` again; challenge response replaced in UI flow; no endpoint spam in harness |
| Callback behavior | PASS | Checkout guest redirect preserved; OTP login from checkout returned to `/checkout`; default OTP login returned to `/account/profile`; external callback URL did not leave localhost |
| Sign-up flow | PASS | Stepper shows Email, Verify, Details, Address; address labels Home/Work/Studio/Family/Other visible; checkout callback required address; account completion signed in via `email-otp` and returned to `/checkout` |
| Password fallback | PASS | `/account/sign-in?mode=password` shows existing password form; `/account/sign-in` does not; credentials provider callback signed in a temporary customer |
| Wishlist/cart regression | PASS | Browser storage after OTP login retained `ftt-cart-v2` and `ftt-wishlist-guest-v1`; no checkout/cart/payment files were edited in this QA pass |
| Token storage/logs | PASS | No token-like keys in localStorage/sessionStorage; no OTP/ticket/token console output observed; source scan found no auth UI console logging |
| Visual polish | PASS | No horizontal overflow at 390/768/1280; card density and CTA placement checked; duplicate auth alternate links removed |
| Admin OTP protection regression | PASS | `email-otp` admin callback returned 401, no session, and created `otp_admin_rejected` event |
| One-time login ticket regression | PASS | Valid `email-otp` ticket signed in once; second use returned 401 |
| OAuth/provider loading | PASS | `/api/auth/providers` exposed unique provider ids: `credentials`, `email-otp` in this local env |

## Screenshots

| Page | 390px | 768px | 1280px |
| --- | --- | --- | --- |
| Sign-in | `/tmp/ftt-otp-phase35/sign-in-390.png` | `/tmp/ftt-otp-phase35/sign-in-768.png` | `/tmp/ftt-otp-phase35/sign-in-1280.png` |
| Sign-in checkout callback | `/tmp/ftt-otp-phase35/sign-in-checkout-390.png` | `/tmp/ftt-otp-phase35/sign-in-checkout-768.png` | `/tmp/ftt-otp-phase35/sign-in-checkout-1280.png` |
| Password fallback | `/tmp/ftt-otp-phase35/password-fallback-390.png` | `/tmp/ftt-otp-phase35/password-fallback-768.png` | `/tmp/ftt-otp-phase35/password-fallback-1280.png` |
| Sign-up | `/tmp/ftt-otp-phase35/sign-up-390.png` | `/tmp/ftt-otp-phase35/sign-up-768.png` | `/tmp/ftt-otp-phase35/sign-up-1280.png` |
| Sign-up checkout callback | `/tmp/ftt-otp-phase35/sign-up-checkout-390.png` | `/tmp/ftt-otp-phase35/sign-up-checkout-768.png` | `/tmp/ftt-otp-phase35/sign-up-checkout-1280.png` |

Additional state screenshots:

| State | Path |
| --- | --- |
| Sign-in sent state | `/tmp/ftt-otp-phase35/sign-in-sent-390.png` |
| Sign-in invalid OTP state | `/tmp/ftt-otp-phase35/sign-in-invalid-390.png` |
| Sign-in post OTP checkout | `/tmp/ftt-otp-phase35/sign-in-post-otp-390.png` |
| Sign-up completed to checkout | `/tmp/ftt-otp-phase35/sign-up-complete-390.png` |

## Interaction Evidence

Browser harness results:

| Check | Result |
| --- | --- |
| OTP login from `/account/sign-in?callbackUrl=/checkout` | Returned to `/checkout` |
| OTP verify request count | 1 |
| OTP start request count | 1 for initial send; 2 after resend case |
| OTP input focus after send | PASS after focus effect |
| Duplicate sent message count | 1 |
| Non-digit OTP entry | Rejected |
| Unknown account message | Generic response only |
| Invalid OTP message | Calm burgundy error shown |
| Default callback | Returned to `/account/profile` |
| External callback | Stayed on local app; external URL not accepted |
| Checkout guest redirect | `/checkout` redirected to `/account/sign-in?callbackUrl=%2Fcheckout` |
| Sign-up checkout callback | Completed flow and returned to `/checkout` |
| Token storage | No `challenge`, `registration`, `ticket`, or `otp` keys in localStorage/sessionStorage |

Auth regression harness results:

| Check | Result |
| --- | --- |
| Providers | `credentials`, `email-otp` |
| Password callback | 200 and session user present |
| Email OTP callback first use | 200 and session user present |
| Email OTP callback second use | 401 |
| Admin OTP callback | 401, no session, `otp_admin_rejected` event present |

## Token And Secret Audit

Source scan over OTP UI files found:

- No `console.log`, `console.info`, `console.warn`, or `console.error` usage.
- No `localStorage` or `sessionStorage` token writes.
- `challengeToken`, `registrationToken`, and `loginTicket` appear only as React state/API payload values.

Bundle scan after `pnpm run build` checked configured `RESEND_API_KEY`, `AUTH_OTP_SECRET`, `AUTH_OTP_TOKEN_SECRET`, and `GA4_API_SECRET` values in `.next/static`, `.next/server/app`, and `public`.

Result: 0 hits.

## Verification Commands

| Command | Result |
| --- | --- |
| `pnpm exec eslint app/(site)/account/sign-in/page.tsx app/(site)/account/sign-up/page.tsx components/account/otp-code-input.tsx` | PASS |
| `pnpm run lint` | PASS with one existing warning in `app/(site)/our-story/page.tsx` |
| `pnpm run build` | PASS |
| `pnpm exec tsc --noEmit --pretty false` | FAIL, unrelated existing error: `tests/unit/rate-limit-production.test.ts(19,17): error TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.` |
| `pnpm run agent:check` | FAIL before LHCI because `pnpm run test` has unrelated unit failures |

Common command warning: local Node is `v25.4.0`, while package engines require `>=20.9 <25`.

## Existing Unrelated Failures

`pnpm run lint` warning:

- `app/(site)/our-story/page.tsx`: missing hook dependencies `goNext`, `goPrev`, `goToPage`.

`pnpm exec tsc --noEmit --pretty false` failure:

- `tests/unit/rate-limit-production.test.ts(19,17)`: assigning to read-only `NODE_ENV`.

`pnpm run agent:check` stopped in `pnpm run test`; visible unrelated failures included:

- `tests/unit/packing-slip-render.test.ts`
- `tests/unit/site-feedback-fixes.test.ts`
- `tests/unit/checkout-estimate.test.ts`
- `tests/unit/auth-middleware.test.ts`
- `tests/unit/order-charge-totals-route.test.ts`

Vitest summary from the run: 10 failed test files, 107 passed test files; 24 failed tests, 1477 passed tests.

## Notes

- Browser MCP runtime was not exposed in this session, so Playwright was used for browser QA.
- Development console messages observed during screenshot capture were React DevTools/HMR/Vercel Analytics debug messages only; no raw OTP, challenge token, registration token, login ticket, or secret values were observed.
- The worktree contains other dirty files from existing work, including checkout/cart/payment paths. They were not edited as part of this Phase 3.5 QA pass.
