# Security Fix Phase 4.4 Report

Date: 2026-06-27

Recommendation: **NO-GO for production release candidate**

Reason: public mobile LHCI still fails the strict LCP <= 2.5s release gate across all measured pages, and live staging smoke was not run because live OTP email/payment execution was not explicitly approved for this run.

## Changed Files

Phase 4.4 performance/accessibility edits were made in:

- `app/(site)/template.tsx`
- `components/animations/scroll-reveal.tsx`
- `components/cart/cart-page-client.tsx`
- `components/landing/instagram-social-card.tsx`
- `components/layout/nav-link.tsx`
- `components/layout/site-header.tsx`
- `components/sections/collection-hero-carousel.tsx`
- `components/sections/fabric-category-section.tsx`
- `components/sections/hero-section.tsx`
- `components/sections/home-intro-gate.tsx`
- `components/sections/landing-sections.tsx`
- `components/sections/social-section.tsx`
- `components/widgets/floating-reel.tsx`
- `components/widgets/site-widgets.tsx`
- `lib/checkout/use-checkout-payment.ts`
- `app/(site)/our-story/page.tsx`

## Fixes Implemented

- Replaced the 4.9 MB raw navbar SVG request with optimized `next/image` delivery from `public/logo.png`.
- Removed the global Framer Motion route template from the critical rendering path.
- Removed Framer Motion from the desktop nav underline.
- Deferred floating widgets with dynamic imports and a short post-load delay.
- Limited the floating Instagram reel to the homepage after the hero is passed, and set reel video `preload="none"`.
- Deferred Instagram social-card videos until interaction and set `preload="none"`.
- Changed the home intro gate so mobile skips the intro video and SSR content is not hidden during the intro check.
- Converted homepage hero slide backgrounds to `next/image`; only the active slide image is mounted initially.
- Added `priority` to the first collection hero image.
- Avoided GSAP hiding above-fold `ScrollReveal` content before LCP.
- Removed Framer-only wrappers from the cart page initial render.
- Moved Razorpay checkout.js loading out of initial checkout page load and into the actual payment modal fallback path. Create-order and verify/signature logic were not weakened.
- Tightened low-contrast gold/burgundy text on the homepage sections.
- Set the `our-story` cover page initial animation to visible on first paint.

## Mobile LCP Before/After

Baseline is from `SECURITY_FIX_PHASE_4_3_REPORT.md` and the earlier Phase 4.4 LHCI artifacts. Final is the last focused public mobile LHCI run.

| Page | Before LCP | Final LCP | Result |
|---|---:|---:|---|
| `/` | 4663 ms | 5939 ms | Fail, regressed |
| `/collection` | 3173 ms | 5343 ms | Fail, regressed |
| `/cart` | 23856 ms | 4946 ms | Fail, improved greatly |
| `/checkout` | 30829 ms | 5724 ms | Fail, improved greatly |
| `/our-story` | 4552 ms | 5536 ms | Fail, regressed |
| `/how-it-works` | 4184 ms | 4290 ms | Fail, roughly flat |
| `/privacy-policy` | 4041 ms | 4291 ms | Fail, roughly flat |
| `/shipping-policy` | 4222 ms | 4455 ms | Fail, roughly flat |
| `/return-policy` | 4047 ms | 4112 ms | Fail, roughly flat |
| `/packing` | 4046 ms | 4114 ms | Fail, roughly flat |

Final public mobile artifacts:

- `test-results/lighthouse/mobile/manifest.json`
- `test-results/lighthouse/mobile/127_0_0_1--2026_06_27_05_24_39.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-collection-2026_06_27_05_25_04.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-cart-2026_06_27_05_25_22.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-checkout-2026_06_27_05_25_37.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-our_story-2026_06_27_05_25_52.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-how_it_works-2026_06_27_05_26_05.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-privacy_policy-2026_06_27_05_26_19.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-shipping_policy-2026_06_27_05_26_32.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-return_policy-2026_06_27_05_26_45.report.json`
- `test-results/lighthouse/mobile/127_0_0_1-packing-2026_06_27_05_26_58.report.json`

## Final LHCI Findings

- Public mobile LCP still fails on all measured routes.
- Cart improved from 23.9s to 4.9s by removing the global/social/video/Framer pressure from first load.
- Checkout improved from 30.8s to 5.7s by removing global/social/video/Framer pressure and lazy-loading Razorpay checkout.js.
- Homepage color-contrast failure was cleared in the final focused rerun; the final focused assertion output only shows LCP failures and the existing cart/checkout SEO warnings.
- `pnpm run agent:check` still failed at the first matrix stage: public mobile LHCI. Because the matrix chains with `&&`, public desktop and admin mobile/desktop scopes did not run.

## Remaining LCP Bottlenecks

- `/`, `/collection`, and `/our-story`: LCP is still image-led, with large load-delay portions despite optimized image delivery. The next fix should be deeper hero/media strategy work: smaller source assets, generated mobile WebP/AVIF derivatives, route-level preloads with correct media hints, and avoiding carousel image contention.
- `/cart` and `/checkout`: LCP is now text-led with render delay around 4.3s to 5.0s. The old 23-30s external/social/video issue is removed, but these client-heavy pages still need a server-rendered static hero shell or smaller critical client bundle.
- Policy/how-it-works pages: LCP is text-led with render delay around 3.3s to 3.7s. Likely next targets are font/render strategy and reducing shared client/provider work on simple static pages.
- Cart and checkout SEO score remains 0.66 because they intentionally use `robots: noindex`. This is a release-gate policy decision, not a production SEO bug for commerce utility pages.

## Live Smoke Results

Live smoke was **not run**.

Reason: the brief explicitly says not to send live OTP emails unless approved and not to run production payments. No explicit approval, release test inbox, staging URL, test-mode Razorpay credentials confirmation, or durable limiter staging target was provided in this turn.

Required before production RC:

- OTP account sign-in smoke with release test inbox.
- Wishlist dialog OTP sign-in and pending product save.
- Checkout gate OTP sign-in and saved address refetch.
- Razorpay test-mode successful payment.
- Razorpay test-mode failed payment.
- Valid webhook signature.
- Invalid webhook signature returns 400.
- Duplicate webhook replay has no duplicate email, analytics, or order side effect.
- Rate-limit smoke for OTP start, OTP verify, register complete, wishlist merge, and create-order.

## CSP Summary

- CSP remains report-only.
- No live browser CSP smoke was run in this pass.
- CSP should not be enforced until OTP, wishlist, checkout, Razorpay, JSON-LD, receipt download, and map/autocomplete flows have been exercised on staging and report-only violations reviewed.

## Verification

Commands run with Node 22 via `npx -y -p node@22 -p pnpm@10.28.0`:

- `pnpm run lint`: pass, with existing warning in `app/(site)/our-story/page.tsx` for missing hook dependencies.
- `pnpm run build`: pass, with existing Next warning that edge runtime disables static generation for that page.
- `pnpm exec tsc --noEmit --pretty false`: initially failed on stale `.next/dev/types`; passed after removing only `.next/dev`.
- `pnpm run test`: pass, 123 files and 1576 tests. Console includes expected intentional failure-path logs from tests.
- `pnpm audit`: pass, no known vulnerabilities.
- `pnpm run agent:check`: fail. Verify phase passed; LHCI matrix stopped at public mobile due LCP failures.
- Focused final `FTT_LHCI_SCOPE=public FTT_LHCI_FORM_FACTOR=mobile pnpm run lhci:autorun`: fail on LCP and cart/checkout SEO warnings; no homepage color-contrast failure in final focused run.

## Production Blockers

1. Public mobile LCP remains above the release gate on all measured routes.
2. Full LHCI matrix did not reach public desktop or admin scopes because public mobile failed first.
3. Live staging smoke was not run.
4. CSP report-only smoke was not run.

## Next Recommendation

Do not cut a production release candidate yet. The next phase should focus on:

- Generating and using smaller mobile-first hero/banner/story image derivatives.
- Reducing client-only rendering for cart, checkout, and static policy pages.
- Re-running the full LHCI matrix after public mobile passes or after an explicit formal LCP rebaseline is accepted.
- Running the live smoke plan on staging with explicit approval and test credentials.
