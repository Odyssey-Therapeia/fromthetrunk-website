# PERF_REBASELINE_REQUEST.md

Date: 2026-06-27

Status: **Requires product/engineering approval before production release candidate**

## Why This Exists

Phase 4.4C made the public shell more static and reduced several route bottlenecks, but the current public mobile Lighthouse CI gate still requires `largest-contentful-paint <= 2500ms` on every public route. Fresh Phase A public-mobile artifacts show every measured public mobile route remains above that strict threshold.

This request does not claim the current performance is ideal. It documents a route-specific release-gate rebaseline option if the team decides the remaining LHCI mobile LCP floor is acceptable for a controlled release candidate while follow-up performance work continues.

## Fresh Evidence

Source artifacts:

- `test-results/lighthouse/mobile/manifest.json`
- `test-results/lighthouse/mobile/*.report.json`
- `test-results/lighthouse/mobile/*.report.html`
- `SECURITY_FIX_PHASE_4_4C_REPORT.md`

Phase A `agent:check` result:

- Blocked before LHCI because existing payment/shipping regression tests fail: standard shipping is currently calculated as 250 instead of the locked 150.
- `pnpm run build`, `pnpm exec tsc --noEmit --pretty false`, focused reservation/payment/order tests, focused lint, and `pnpm audit` passed on Node 22/pnpm 10.28.0.
- A direct local public-mobile LHCI run was executed separately and failed strict LCP on all measured public routes.
- Public desktop and admin mobile/desktop scopes did not run because the normal matrix remains blocked.

Fresh Phase A public-mobile artifacts:

- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_07_35_39.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_07_36_04.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_07_36_21.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_07_36_35.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_07_36_49.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_07_37_03.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_07_37_16.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_07_37_30.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_07_37_43.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_07_37_56.report.json`

## Proposed Temporary Mobile LCP Baselines

These proposed thresholds are intentionally route-specific and should be treated as temporary release-candidate gates, not long-term targets.

| Route | Current 4.4C LCP | Proposed temporary gate | Reason |
|---|---:|---:|---|
| `/` | 4894 ms | 5200 ms | Homepage still includes large branded first-viewport experience and below-fold homepage data composition. Needs a dedicated static hero/server-data pass. |
| `/collection` | 5198 ms | 5500 ms | Dynamic catalog search/facet route remains the heaviest public route. Needs deeper catalog route split or edge/static landing shell. |
| `/cart` | 4608 ms | 5000 ms | Now static with near-zero TTFB; remaining LHCI floor appears mostly rendering/runtime. |
| `/checkout` | 4738 ms | 5200 ms | Now static with near-zero TTFB; checkout auth/payment client runtime remains below the server shell. |
| `/our-story` | 4521 ms | 5000 ms | Story/book route remains a rich client interaction. Needs server-first cover plus deferred book refactor for strict 2.5s. |
| `/how-it-works` | 3967 ms | 4300 ms | ISR text route still shows static-page LHCI LCP floor. |
| `/privacy-policy` | 3811 ms | 4200 ms | Static text route still shows static-page LHCI LCP floor. |
| `/shipping-policy` | 4088 ms | 4400 ms | Static text route still shows static-page LHCI LCP floor. |
| `/return-policy` | 3796 ms | 4200 ms | Static text route still shows static-page LHCI LCP floor. |
| `/packing` | 3841 ms | 4200 ms | Static text route still shows static-page LHCI LCP floor. |

## Conditions For Accepting This Rebaseline

Acceptance should require all of the following:

1. The team explicitly accepts temporary route-specific mobile LCP gates above 2.5s for release-candidate staging.
2. Payment/shipping regression tests are resolved or explicitly accepted by engineering/product before any production candidate.
3. Public desktop and admin scopes are run separately and pass or get their own documented blockers.
4. Live staging smoke tests remain test-mode only and pass for OTP, wishlist, checkout auth gate, Razorpay test payment, webhook replay, rate limits, and CSP report-only review.
5. The remaining performance backlog below is tracked before release.

## Required Follow-Up Work

1. Split global `Providers` out of static public content instead of wrapping all `(site)` route children.
2. Convert `/our-story` to a true server-first cover with a deferred interactive book below the first viewport.
3. Split `/collection` into a static first-viewport shell plus deferred/dynamic catalog data where feasible.
4. Revisit homepage composition so below-fold social/product data cannot delay the hero route.
5. Fix `/cart` and `/checkout` SEO score warnings.
6. Run public desktop and admin LHCI scopes after either strict mobile passes or the temporary mobile gate is accepted.

## Recommendation

Do not mark production release candidate as GO until this rebaseline is formally accepted or strict public mobile LCP is brought below 2.5s.
