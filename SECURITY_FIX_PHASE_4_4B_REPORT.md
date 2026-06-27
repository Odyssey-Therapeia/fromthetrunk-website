# SECURITY_FIX_PHASE_4_4B_REPORT.md

Date: 2026-06-27

Recommendation: **NO-GO for production release candidate**

Reason: the public mobile LHCI release gate still fails the strict `largest-contentful-paint <= 2500ms` assertion on every measured public route. This pass produced a formal forensic diagnosis, reduced several LCP routes, and removed the previous cart/checkout external-widget LCP pathology, but the current gate is still not passable without a deeper global render/caching change or an explicit rebaseline.

## Source Documents Used

- `SECURITY_FIX_PHASE_4_4_REPORT.md`
- `SECURITY_FIX_PHASE_4_3_REPORT.md`
- `PERF_AUDIT.md`
- `CSP_ENFORCEMENT_PLAN.md`
- `LIVE_SMOKE_TEST_PLAN.md`
- `PERF_LCP_4_4B_DIAGNOSIS.md`

## Changed Files In This Pass

- `PERF_LCP_4_4B_DIAGNOSIS.md`
- `SECURITY_FIX_PHASE_4_4B_REPORT.md`
- `app/(site)/cart/page.tsx`
- `app/(site)/checkout/page.tsx`
- `app/(site)/collection/page.tsx`
- `app/(site)/how-it-works/page.tsx`
- `app/(site)/our-story/page.tsx`
- `app/(site)/packing/page.tsx`
- `app/(site)/privacy-policy/page.tsx`
- `app/(site)/return-policy/page.tsx`
- `app/(site)/shipping-policy/page.tsx`
- `app/(site)/terms-of-service/page.tsx`
- `components/cart/cart-hero-shell.tsx`
- `components/cart/cart-hero-stats.tsx`
- `components/cart/cart-page-client.tsx`
- `components/checkout/checkout-shell.tsx`
- `components/checkout/checkout-page-client.tsx`
- `components/layout/site-header.tsx`
- `components/sections/collection-hero-carousel.tsx`
- `components/sections/hero-section.tsx`
- `components/widgets/site-widgets.tsx`
- `public/banner/collection-banner2-mobile.webp`
- `public/banner/collection_banner-mobile.webp`
- `public/category/kanjiverram-lcp.webp`
- `public/category/silk-lcp.webp`
- `public/hero/3-lcp.webp`
- `public/hero/mobile_1-lcp.webp`

No auth, OTP expiry, Razorpay signature verification, payment amount calculation, product pricing, order completion, wishlist API, or reservation logic was changed in this pass.

## What Changed

- Added a pre-edit forensic diagnosis in `PERF_LCP_4_4B_DIAGNOSIS.md`.
- Generated smaller WebP first-viewport image derivatives for home, collection, and story pages.
- Switched the home hero first slide to the smaller LCP image sources.
- Switched collection hero banners to smaller mobile-first sources and delayed inactive carousel slide mounting.
- Switched the first story cover images to smaller LCP sources.
- Removed global logo image priority from the site header.
- Added a server-rendered cart hero shell so the first visible cart copy is no longer fully owned by the cart client island.
- Added a server-rendered checkout shell so the first visible checkout copy is no longer fully owned by the auth/query/payment client island.
- Removed above-fold `ScrollReveal` wrappers from how-it-works and policy-style pages.
- Delayed optional global widgets further so WelcomePopup, WhatsApp, and reel widgets do not compete with early public mobile LCP.

## Mobile LCP Before/After

Before values are from the final Phase 4.4 report. After values are from the final `agent:check` public mobile artifacts written under `test-results/lighthouse/mobile/` on 2026-06-27 at 05:56-05:58.

| Route | Phase 4.4 LCP | Phase 4.4B LCP | Delta | Result |
|---|---:|---:|---:|---|
| `/` | 5939 ms | 5493 ms | -446 ms | Fail |
| `/collection` | 5343 ms | 4591 ms | -752 ms | Fail |
| `/cart` | 4946 ms | 5120 ms | +174 ms | Fail |
| `/checkout` | 5724 ms | 5497 ms | -227 ms | Fail |
| `/our-story` | 5536 ms | 4666 ms | -870 ms | Fail |
| `/how-it-works` | 4290 ms | 4065 ms | -225 ms | Fail |
| `/privacy-policy` | 4291 ms | 3838 ms | -453 ms | Fail |
| `/shipping-policy` | 4455 ms | 3687 ms | -768 ms | Fail |
| `/return-policy` | 4112 ms | 3839 ms | -273 ms | Fail |
| `/packing` | 4114 ms | 3838 ms | -276 ms | Fail |

## Final Public Mobile Artifacts

- `test-results/lighthouse/mobile/manifest.json`
- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_05_56_24.report.json`
- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_05_56_24.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_05_56_50.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_05_56_50.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_05_57_06.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_05_57_06.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_05_57_21.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_05_57_21.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_05_57_35.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_05_57_35.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_05_57_49.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_05_57_49.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_05_58_02.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_05_58_02.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_05_58_15.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_05_58_15.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_05_58_28.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_05_58_28.report.html`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_05_58_41.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_05_58_41.report.html`

## Final Route Diagnostics

| Route | LCP element | TTFB | FCP | TBT | Main thread | LCP phase evidence | Root cause after 4.4B |
|---|---|---:|---:|---:|---:|---|---|
| `/` | Lighthouse element audit empty | 1811 ms | 1206 ms | 63 ms | 1475 ms | Classic element phase unavailable | Still dominated by dynamic route/server work and shared homepage client/runtime cost. The hero source is smaller now, but the route still exceeds target before enough visible content stabilizes. |
| `/collection` | Banner image | 682 ms | 1355 ms | 31 ms | 2727 ms | Load delay 3441 ms, render delay 446 ms | Image-led. Smaller banner sources and delayed inactive slides improved LCP, but the active banner still has a large classic Lighthouse load-delay phase and collection main-thread work remains high. |
| `/cart` | Server cart hero paragraph | 845 ms | 1205 ms | 2 ms | 807 ms | Render delay 4275 ms | The external-widget/footer pathology is gone. The LCP element is now intended page content, but Lighthouse still reports a large text render delay despite low TBT. This points to global shell/CSS/font/runtime timing rather than cart reservation logic. |
| `/checkout` | Server checkout heading | 674 ms | 1204 ms | 2 ms | 817 ms | Render delay 4822 ms | The LCP element is now intended checkout content, not Instagram/video/footer content. The remaining fail is a large text render delay from global shell and checkout client/runtime hydration timing. |
| `/our-story` | Story cover image | 698 ms | 1205 ms | 2 ms | 1434 ms | Load delay 3267 ms, render delay 673 ms | Image-led and client-page-led. Smaller cover assets improved LCP, but the route remains a full client experience and the first cover image still has a large classic load-delay phase. |
| `/how-it-works` | H1 text | 1503 ms | 1205 ms | 1 ms | 545 ms | Render delay 2562 ms | Above-fold animation was removed. Remaining bottleneck is route TTFB plus text render delay in the shared public shell. |
| `/privacy-policy` | Policy text | 728 ms | 1055 ms | 2 ms | 615 ms | Render delay 3109 ms | Above-fold animation removed. Remaining fail is low-TBT text render delay, likely shared shell/CSS/font/runtime timing. |
| `/shipping-policy` | Policy text | 668 ms | 1055 ms | 1 ms | 593 ms | Render delay 3018 ms | Same static text render-delay pattern. |
| `/return-policy` | Policy text | 762 ms | 1055 ms | 4 ms | 561 ms | Render delay 3076 ms | Same static text render-delay pattern. |
| `/packing` | Packing text | 840 ms | 1055 ms | 2 ms | 596 ms | Render delay 2997 ms | Same static text render-delay pattern. |

## Public Mobile Result

**Failed.**

The final `agent:check` run completed its verify phase and then failed during public mobile LHCI. The matrix did not continue to public desktop or admin mobile/desktop because the script stops after the first failing LHCI scope.

Additional LHCI warnings remain:

- `/cart` SEO score: `0.66`, expected `>= 0.85`
- `/checkout` SEO score: `0.66`, expected `>= 0.85`

## Verification Commands

All commands were run through Node 22 and pnpm 10 as requested.

| Command | Result |
|---|---|
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run lint` | Passed with existing warning in `app/(site)/our-story/page.tsx` about hook dependencies. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run build` | Passed with existing Edge Runtime static-generation warning. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsc --noEmit --pretty false` | Passed. An initial stale `.next/dev` generated-type failure was cleared by removing `.next/dev`; the post-clean run passed. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run test` | Passed: 123 test files, 1576 tests. Existing intentional failure-path console output appears during logger/email/database tests. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm audit` | Passed: no known vulnerabilities found. |
| `npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check` | Failed at public mobile LHCI LCP assertions after verify phase passed. Public desktop and admin scopes did not run. |
| `FTT_LHCI_SCOPE=public FTT_LHCI_FORM_FACTOR=mobile npx -y -p node@22 -p pnpm@10.28.0 pnpm run lhci:autorun` | Failed on public mobile LCP in focused rerun before final `agent:check`; final `agent:check` produced the artifact set listed above. |

## Rebaseline Evidence

The current failures are not caused by long JavaScript tasks. Final public mobile TBT is between 1 ms and 63 ms on all measured routes. Several static text routes have FCP around 1055 ms but classic LCP around 3.7-3.8s with 3.0s render delay. Cart and checkout now correctly report page-owned text as LCP, not external widget/footer media, but still show 4.2-4.8s render delay with TBT near zero.

This suggests the strict classic Lighthouse LCP gate is now measuring shared shell/render timing under throttling more than isolated route bugs. The remaining work is architectural rather than a small page-level media fix.

## Remaining Blockers

1. Public mobile LCP remains above 2.5s on every measured public route.
2. `agent:check` cannot reach public desktop or admin scopes while public mobile fails first.
3. Cart and checkout SEO warnings remain at `0.66`.
4. `/collection` still has high main-thread work and dynamic public data cost; `PERF_AUDIT.md` already identifies the route as uncached and `force-dynamic`.
5. `/` has high TTFB and incomplete LCP element attribution in Lighthouse artifacts, so another pass needs route timing instrumentation or production trace data.
6. Live OTP/email/Razorpay smoke was not run in this pass because the 4.4B scope forbids live OTP emails and production payment endpoint usage.

## Recommended Next Step

**Option A: formal rebaseline.** Rebaseline the public mobile LCP gate per route with the current artifacts, while keeping a separate performance backlog for:

- `/collection` public ISR/cache split and facet query caching.
- Global public layout split so simple static pages do not hydrate broad commerce/header/search/cart/session/widget islands before LCP.
- Static/server first viewport for `/our-story` instead of a full client page.
- Homepage route timing and cache strategy, including CMS/global data caching.
- Cart/checkout metadata/SEO cleanup.

**Option B: Phase 4.5 architectural performance fix.** Do not proceed to production release candidate until the global shell and collection caching work lands and public mobile LHCI passes through the full matrix.

Given the current release gate, the project is **NO-GO for production release candidate** and **NO-GO for claiming full `agent:check` pass**.
