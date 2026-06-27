# Final Phase B Release Report

Date: 2026-06-27

Recommendation: **NO-GO for production cutover**

The Phase B shipping/payment blocker is fixed locally and the core build/test/audit gates pass under Node 22. Production release is still blocked by the unrebaselined public mobile LCP gate, missing admin LHCI credentials, missing dedicated token secrets in the local preflight environment, and the absence of approved live staging smoke credentials/run evidence.

## Changed Files

Phase B changes:

- `lib/config/order-pricing.ts`
- `lib/checkout/estimate.ts`
- `lib/payments/razorpay.ts`
- `app/(site)/shipping-policy/page.tsx`
- `tests/unit/payment-calculation.test.ts`
- `components/sections/landing-sections.tsx`
- `app/(site)/collection/page.tsx`
- `FINAL_PHASE_B_RELEASE_REPORT.md`

Notes:

- `app/(site)/collection/page.tsx` and `components/sections/landing-sections.tsx` already had broader in-flight changes before this pass. Phase B only made targeted contrast edits in those files.
- No Razorpay signature verification, payment total trust boundary, OTP expiry, checkout payment payload, order completion, reservation ownership, or product pricing trust model was weakened.

## Shipping Decision

Decision: **official launch behavior is standard shipping Rs.150, with free shipping at or above Rs.25,000.**

Evidence used:

- `FINAL_PHASE_A_REPORT.md` identifies the blocker as standard shipping calculating Rs.250 instead of the locked Rs.150.
- `PERF_REBASELINE_REQUEST.md` also calls out the same locked Rs.150 payment/shipping regression.
- `tests/unit/checkout-estimate.test.ts` and `tests/unit/order-charge-totals-route.test.ts` encode Rs.150 standard shipping and free shipping threshold behavior.
- `docs/archive/manual-acceptance-checklist.md` says orders above Rs.25,000 get free shipping.
- `components/checkout/packaging-step.tsx` still describes the active packaging/shipping cost as Rs.150.

Fixes made:

- Restored default standard shipping to `150`.
- Restored free-shipping threshold behavior.
- Restored shipping policy copy to advertise free shipping above the configured threshold.
- Aligned `tests/unit/payment-calculation.test.ts` back to the same free-threshold rule.

Focused verification:

```text
npx -y -p node@22 -p pnpm@10.28.0 pnpm exec vitest run \
  tests/unit/checkout-estimate.test.ts \
  tests/unit/order-charge-totals-route.test.ts \
  tests/unit/payment-calculation.test.ts \
  tests/unit/gst-inclusive-flag.test.ts \
  tests/unit/validation-schemas.test.ts \
  tests/unit/payments-route.test.ts
```

Result: **PASS**. 6 files, 72 tests.

## Safe Env Preflight

Source: local `.env.local` plus current process env. Values were not printed.

| Item | Result |
|---|---|
| `DATABASE_URL` | present |
| `DATABASE_URL` pooler hint | present |
| `AUTH_OTP_SECRET` | present |
| `AUTH_OTP_TOKEN_SECRET` | present |
| `RESERVATION_TOKEN_SECRET` | missing |
| `ORDER_ACCESS_TOKEN_SECRET` | missing |
| `EMAIL_VERIFICATION_TOKEN_SECRET` | missing |
| `PREVIEW_TOKEN_SECRET` | missing |
| `RESEND_API_KEY` | present |
| `RESEND_FROM_EMAIL` | present |
| `RAZORPAY_KEY_ID` | present |
| `RAZORPAY_KEY_SECRET` | present |
| `RAZORPAY_WEBHOOK_SECRET` | present |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | present |
| durable rate limiter | present through KV env |
| `FTT_LHCI_AUTH_EMAIL` | missing |
| `FTT_LHCI_AUTH_PASSWORD` | missing |
| `vercel.json` region pin | missing |

Production blocker:

- Dedicated token secrets must be configured in staging/production before cutover: `RESERVATION_TOKEN_SECRET`, `ORDER_ACCESS_TOKEN_SECRET`, `EMAIL_VERIFICATION_TOKEN_SECRET`, `PREVIEW_TOKEN_SECRET`.
- Admin LHCI cannot run until `FTT_LHCI_AUTH_EMAIL` and `FTT_LHCI_AUTH_PASSWORD` are provided in the execution environment.
- Region pinning was not found in `vercel.json` because no `vercel.json` file is present.

## Migration Status

Not run against staging in this pass.

Reason: no staging database target, staging approval, or deployment/cutover authorization was provided in this turn. Running migrations against an unknown `DATABASE_URL` would risk touching the wrong environment.

Required before production:

- Confirm target is staging, not production.
- Run Drizzle migrations against staging.
- Confirm schema drift and index state.
- Run rollback rehearsal or restore-point process.

## Command Results

All command runs used Node 22 via:

```text
npx -y -p node@22 -p pnpm@10.28.0 ...
```

| Command | Result | Notes |
|---|---:|---|
| `pnpm run lint` | PASS | Existing warning in `app/(site)/our-story/page.tsx` for missing hook dependencies. |
| `pnpm run build` | PASS | Existing warning: Edge Runtime disables static generation for that page. |
| `pnpm exec tsc --noEmit --pretty false` | PASS | No output. |
| `pnpm run test` | PASS | 124 test files, 1595 tests. Console contains intentional failure-path logs from tests. |
| `pnpm audit` | PASS | No known vulnerabilities found. |
| `pnpm run agent:check` | FAIL | Fails at public mobile LHCI LCP gate before desktop/admin scopes. |

## Lighthouse CI

`pnpm run agent:check` result: **FAIL**

Reason: public mobile LCP still exceeds the configured `<= 2500ms` assertion across every measured public route.

Mobile artifact directory:

- `test-results/lighthouse/mobile`

| Scope | Route | Performance | LCP ms | SEO | Report |
|---|---:|---:|---:|---:|---|
| mobile | `/` | 79 | 5580 | 100 | `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_07_52_58.report.json` |
| mobile | `/collection` | 80 | 5351 | 100 | `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_07_53_24.report.json` |
| mobile | `/cart` | 83 | 4762 | 66 | `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_07_53_41.report.json` |
| mobile | `/checkout` | 83 | 4670 | 66 | `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_07_53_55.report.json` |
| mobile | `/our-story` | 84 | 4522 | 100 | `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_07_54_09.report.json` |
| mobile | `/how-it-works` | 89 | 3842 | 100 | `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_07_54_23.report.json` |
| mobile | `/privacy-policy` | 89 | 3842 | 100 | `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_07_54_36.report.json` |
| mobile | `/shipping-policy` | 86 | 4166 | 100 | `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_07_54_50.report.json` |
| mobile | `/return-policy` | 89 | 3817 | 100 | `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_07_55_03.report.json` |
| mobile | `/packing` | 89 | 3845 | 100 | `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_07_55_17.report.json` |

Because `agent:check` stops at public mobile, public desktop and admin scopes were run separately.

Public desktop after contrast fixes: **PASS**

Desktop artifact directory:

- `test-results/lighthouse/desktop`

| Scope | Route | Performance | LCP ms | SEO | Report |
|---|---:|---:|---:|---:|---|
| desktop | `/` | 93 | 1504 | 100 | `test-results/lighthouse/desktop/127_0_0_1--2026_06_27_08_01_09.report.json` |
| desktop | `/collection` | 99 | 1003 | 100 | `test-results/lighthouse/desktop/127_0_0_1-collection-2026_06_27_08_01_37.report.json` |
| desktop | `/cart` | 99 | 886 | 66 | `test-results/lighthouse/desktop/127_0_0_1-cart-2026_06_27_08_02_02.report.json` |
| desktop | `/checkout` | 99 | 909 | 66 | `test-results/lighthouse/desktop/127_0_0_1-checkout-2026_06_27_08_02_17.report.json` |
| desktop | `/our-story` | 99 | 927 | 100 | `test-results/lighthouse/desktop/127_0_0_1-our_story-2026_06_27_08_02_32.report.json` |
| desktop | `/how-it-works` | 100 | 767 | 100 | `test-results/lighthouse/desktop/127_0_0_1-how_it_works-2026_06_27_08_02_48.report.json` |
| desktop | `/privacy-policy` | 100 | 766 | 100 | `test-results/lighthouse/desktop/127_0_0_1-privacy_policy-2026_06_27_08_03_02.report.json` |
| desktop | `/shipping-policy` | 100 | 798 | 100 | `test-results/lighthouse/desktop/127_0_0_1-shipping_policy-2026_06_27_08_03_15.report.json` |
| desktop | `/return-policy` | 100 | 774 | 100 | `test-results/lighthouse/desktop/127_0_0_1-return_policy-2026_06_27_08_03_30.report.json` |
| desktop | `/packing` | 100 | 777 | 100 | `test-results/lighthouse/desktop/127_0_0_1-packing-2026_06_27_08_03_44.report.json` |

Admin mobile and desktop: **BLOCKED**

Reason:

```text
FTT_LHCI_AUTH_EMAIL is required for authenticated Lighthouse CI runs.
```

## Live Staging Smoke

Not run.

Reason: no staging URL, staging database confirmation, OTP test inbox approval, Razorpay test-mode staging credentials confirmation, or live-smoke authorization was provided in this turn.

Status by area:

| Area | Result | Notes |
|---|---:|---|
| Reservation smoke | NOT RUN | Requires two staging browser sessions/users and staging product fixture. |
| OTP sign-in smoke | NOT RUN | Live OTP email was not approved. |
| Wishlist OTP save smoke | NOT RUN | Depends on live OTP smoke. |
| Checkout gate OTP smoke | NOT RUN | Depends on live OTP smoke and staging cart/product fixture. |
| Razorpay test create-order | NOT RUN | Requires confirmed test mode staging credentials. |
| Razorpay success payment | NOT RUN | Requires Razorpay test mode only. |
| Razorpay failed payment | NOT RUN | Requires Razorpay test mode only. |
| Webhook valid signature | NOT RUN | Requires staging webhook target/secret. |
| Webhook invalid signature | NOT RUN | Requires staging webhook target/secret. |
| Duplicate webhook replay | NOT RUN | Requires staging order/payment fixture. |
| Rate limiter smoke | NOT RUN | Requires staging endpoint target. |
| CSP report-only smoke | NOT RUN | Requires browser run against staging. |
| Load/stress smoke | NOT RUN | Must not target production; no staging target provided. |

## CSP, Docs, Debug Policy

Inspected locally:

- CSP report-only header exists in `next.config.ts`.
- CSP report endpoint exists at `/api/csp-report`.
- API docs policy disables docs in production unless `FTT_ENABLE_API_DOCS=true`.
- `/api/debug/db-ping` returns 404 in production unless debug endpoints are explicitly enabled and admin/bearer access is present.

No staging CSP report stream was reviewed in this pass.

## Production Cutover Checklist

Not executed.

Required before production cutover:

1. Configure missing dedicated token secrets in staging and production.
2. Confirm staging `DATABASE_URL` target and run migrations against staging only.
3. Provide admin LHCI credentials and rerun admin mobile/desktop scopes.
4. Obtain explicit product/engineering acceptance for public mobile LCP rebaseline, or continue LCP work until strict mobile `<= 2500ms` passes.
5. Run the full live staging smoke plan with Razorpay test mode only.
6. Review CSP report-only violations from staging.
7. Confirm no production payment mode, production OTP sending, or production load testing is used before final approval.

## Rollback Plan

If Phase B changes cause issues:

1. Revert the Phase B pricing/shipping changes in `lib/config/order-pricing.ts`, `lib/checkout/estimate.ts`, `lib/payments/razorpay.ts`, `app/(site)/shipping-policy/page.tsx`, and `tests/unit/payment-calculation.test.ts`.
2. Revert the targeted contrast edits in `components/sections/landing-sections.tsx` and `app/(site)/collection/page.tsx`.
3. Redeploy the last known-good staging build.
4. Re-run focused checkout/payment tests and public desktop LHCI.
5. Do not promote to production until staging smoke passes again.

## Final Decision

**NO-GO for production release candidate.**

Shipping/payment math is no longer the blocker, and desktop LHCI is green after targeted contrast fixes. The remaining blockers are release-process blockers, not speculative issues:

- Public mobile LCP still fails the configured strict gate and has no formal rebaseline approval in this pass.
- Admin LHCI cannot run without auth credentials.
- Dedicated token secrets are missing in the local preflight environment.
- Live staging smoke was not run because staging target/approval/test credentials were not provided.

