# SECURITY_FIX_PHASE_4_4C_REPORT.md

Date: 2026-06-27

Recommendation: **NO-GO for production release candidate**

Reason: Phase 4.4C reduced some route bottlenecks and made several public routes static/ISR, but the strict public mobile LHCI `largest-contentful-paint <= 2500ms` gate still fails on every measured public route. `agent:check` stops at public mobile, so public desktop and admin mobile/desktop scopes did not run.

## Source Documents Used

- `SECURITY_FIX_PHASE_4_4B_REPORT.md`
- `PERF_LCP_4_4B_DIAGNOSIS.md`
- `PERF_AUDIT.md`
- `SECURITY_FIX_PHASE_4_3_REPORT.md`
- `CSP_ENFORCEMENT_PLAN.md`

## Required Pre-Edit Plan

- Created `PERF_LCP_4_4C_PLAN.md` before source edits.

## Changed Files In This Pass

- `PERF_LCP_4_4C_PLAN.md`
- `SECURITY_FIX_PHASE_4_4C_REPORT.md`
- `PERF_REBASELINE_REQUEST.md`
- `app/(site)/layout.tsx`
- `app/(site)/page.tsx`
- `app/(site)/cart/page.tsx`
- `app/(site)/checkout/page.tsx`
- `app/(site)/collection/page.tsx`
- `app/(site)/how-it-works/page.tsx`
- `app/api/latest-reel/route.ts`
- `components/layout/site-header-server.tsx`
- `components/layout/site-header-controls.tsx`
- `components/providers.tsx`
- `components/sections/collection-hero-carousel.tsx`
- `components/widgets/site-widgets.tsx`

No OTP expiry, auth policy, Razorpay signature verification, payment amount calculation, product pricing, product card visuals, reservation behavior, wishlist API logic, order completion logic, or payment endpoints were changed.

## What Changed

- Removed the global `getLatestReel()` await from the public root layout.
- Moved optional reel fetching behind a delayed `/api/latest-reel` call inside the deferred widget island.
- Moved `SiteHeaderServer` and `SiteFooterServer` outside the root `Providers` boundary.
- Replaced the header server wrapper with real server-rendered logo and desktop navigation markup.
- Added `SiteHeaderControls` for the smaller session/search/cart/mobile-menu client island.
- Deferred `WishlistMergeOnLogin` until after the initial render path.
- Made the homepage public path ISR (`revalidate = 60`) instead of `force-dynamic`.
- Removed cart and checkout server-side featured-product recommendation fetches from the critical page render.
- Made `/how-it-works` ISR (`revalidate = 300`) and removed the public `draftMode()` dependency.
- Added a server-rendered prioritized collection banner image before the client carousel hydrates.
- Prevented the collection carousel from issuing a second high-priority first-image request when the server image is already present.

## Build Output Signals

The production build now reports these routes as static/ISR:

| Route | Build output |
|---|---|
| `/` | static, revalidate `1m` |
| `/cart` | static |
| `/checkout` | static |
| `/how-it-works` | static, revalidate `5m` |
| `/our-story` | static |
| policy pages | static |

`/collection` remains dynamic because it still depends on request search params and catalog query state.

## Mobile LCP Before/After

Before values are the latest pre-4.4C public mobile run from `test-results/lighthouse/mobile/manifest.json` at roughly 06:12. After values are from the `agent:check` public mobile run at 06:26-06:28.

| Route | Pre-4.4C LCP | Phase 4.4C LCP | Delta | Result |
|---|---:|---:|---:|---|
| `/` | 5344 ms | 5655 ms | +311 ms | Fail |
| `/collection` | 4820 ms | 5583 ms | +763 ms | Fail |
| `/cart` | 5386 ms | 4541 ms | -845 ms | Fail |
| `/checkout` | 5764 ms | 4812 ms | -952 ms | Fail |
| `/our-story` | 4748 ms | 4600 ms | -148 ms | Fail |
| `/how-it-works` | 4065 ms | 3971 ms | -94 ms | Fail |
| `/privacy-policy` | 4088 ms | 3840 ms | -248 ms | Fail |
| `/shipping-policy` | 4163 ms | 4099 ms | -64 ms | Fail |
| `/return-policy` | 3841 ms | 3966 ms | +125 ms | Fail |
| `/packing` | 3990 ms | 3842 ms | -148 ms | Fail |

## Final Public Mobile Artifacts

- `test-results/lighthouse/mobile/manifest.json`
- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_06_26_28.report.json`
- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_06_26_28.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_06_26_54.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_06_26_54.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_06_27_12.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_06_27_12.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_06_27_28.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_06_27_28.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_06_27_41.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_06_27_41.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_06_27_56.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_06_27_56.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_06_28_09.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_06_28_09.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_06_28_23.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_06_28_23.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_06_28_36.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_06_28_36.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_06_28_49.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_06_28_49.report.html`

## Final Route Diagnostics

| Route | LCP | TTFB | FCP | TBT | Main thread | Notes |
|---|---:|---:|---:|---:|---:|---|
| `/` | 5655 ms | 792 ms | 1206 ms | 85 ms | 1632 ms | Static/ISR now, but homepage still misses target. Lighthouse element attribution remains unreliable/empty. |
| `/collection` | 5583 ms | 824 ms | 1356 ms | 7 ms | 2332 ms | Server image discovery did not reduce strict LHCI LCP; catalog route remains dynamic and main-thread work is still high. |
| `/cart` | 4541 ms | 6 ms | 1205 ms | 4 ms | 754 ms | Improved by removing critical recommendation fetch and static rendering; still above strict target. |
| `/checkout` | 4812 ms | 7 ms | 1054 ms | 4 ms | 657 ms | Improved by removing critical recommendation fetch and static rendering; still above strict target. |
| `/our-story` | 4600 ms | 799 ms | 1056 ms | 2 ms | 1827 ms | Static route, but full client/framer story experience remains heavy. |
| `/how-it-works` | 3971 ms | 670 ms | 1057 ms | 4 ms | 679 ms | ISR now; still shows the static text route LCP floor under LHCI throttling. |
| `/privacy-policy` | 3840 ms | 670 ms | 1055 ms | 4 ms | 656 ms | Static text route still above target with low TBT. |
| `/shipping-policy` | 4099 ms | 800 ms | 1058 ms | 3 ms | 707 ms | Static text route still above target with low TBT. |
| `/return-policy` | 3966 ms | 748 ms | 1055 ms | 2 ms | 609 ms | Static text route still above target with low TBT. |
| `/packing` | 3842 ms | 668 ms | 1056 ms | 3 ms | 609 ms | Static text route still above target with low TBT. |

## Verification Commands

All commands were run with Node 22 and pnpm 10.28.0.

| Command | Result |
|---|---|
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint` | Passed with existing `app/(site)/our-story/page.tsx` hook dependency warning. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run build` | Passed with existing Edge Runtime static-generation warning. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false` | Passed. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run test` | Passed: 124 files, 1591 tests. Existing intentional failure-path logs were emitted by tests. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm audit` | Passed: no known vulnerabilities found. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check` | Failed at public mobile LHCI LCP assertions. Public desktop and admin scopes did not run. |

## Remaining Blockers

1. Public mobile LCP remains above 2.5s on all measured routes.
2. Public desktop and admin scopes are still not reached by `agent:check` because public mobile fails first.
3. `/cart` and `/checkout` still have SEO warnings at `0.66`.
4. `/collection` remains dynamic and still has high main-thread work.
5. `/our-story` remains a heavy client-first story/book experience.
6. A formal route-specific LCP rebaseline is required before production RC can proceed under the current strict gate.

## Final Recommendation

**NO-GO for production release candidate.**

Proceed only after either:

- Another architecture pass removes the remaining public mobile LCP floor and `agent:check` reaches all scopes, or
- The team formally accepts `PERF_REBASELINE_REQUEST.md` with route-specific mobile LCP thresholds and keeps the unresolved performance work in the release backlog.

