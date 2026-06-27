# PERF_LCP_4_4B_DIAGNOSIS.md

Date: 2026-06-27

Scope: public mobile LHCI artifacts under `test-results/lighthouse/mobile/`.
No source files were edited before this diagnosis was written.

## Artifacts Inspected

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

HTML reports were not needed for element identification because the JSON audits include the LCP node data for every route except `/`.

## Route LCP Table

| Route | LCP element | Type | LCP ms | TTFB | Load delay | Load time | Render delay | Suspected cause | Fix plan |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| `/` | Element audit empty; LCP discovery says request was discoverable, high priority, eager. Largest image pressure is below-fold category images. | Unknown/image likely | 5939 | 1623 | n/a | n/a | n/a | Dynamic homepage waits on CMS/product data; global header/provider JS and below-fold image work still compete with first paint. The report has inconsistent LCP details: `largest-contentful-paint-element` is empty while `lcp-phases-insight` reports only 1624ms TTFB, 766ms resource delay, 2ms load, 87ms render. | Keep SSR content visible, reduce initial route work where safe, make hero image source mobile-specific, avoid loading below-fold category imagery too eagerly. |
| `/collection` | `From the Trunk collection banner` image, selector `div.relative > div.absolute > div.absolute > img.object-contain`. | Image | 5343 | 855 | 3546 | 17 | 925 | Banner is discoverable and high priority, but it sits low in a tall hero and the carousel mounts multiple slides. The original PNG sources are 3.8-4.1MB 1920px assets even though Next transcodes to ~48KB. | Use smaller mobile-first banner source, mount only active slide initially, keep one high-priority LCP image, lazy-load inactive slide after first paint. |
| `/cart` | Hero paragraph: `Review the pieces you have chosen before checkout...` | Text | 4946 | 678 | 0 | 0 | 4267 | First visible cart shell is inside a client component with cart store, analytics, product suggestions, icons, and state hydration. | Move static cart hero shell to the server page and hydrate cart logic below it; avoid client-only wrappers for above-fold text. |
| `/checkout` | Empty-cart paragraph: `Browse our curated collection...` | Text | 5724 | 736 | 0 | 0 | 4988 | Empty/auth checkout first paint is fully inside `CheckoutPageClient`; it hydrates auth, query, checkout state, discounts, address logic, and payment hook before LCP text settles. | Render lightweight server/static checkout shell and keep payment/auth behavior inside the hydrated client area below the shell. |
| `/our-story` | Cover image, selector `div.relative > div.relative > article.relative > img.object-cover`. | Image | 5536 | 819 | 3973 | 32 | 713 | Page is a full client component importing Framer Motion and dialog/progress UI. Cover uses large category source `kanjiverram.jpg` at 1365x2048 and a second card image. | Use smaller mobile-first cover source for the LCP image, keep only cover image priority, remove first-paint animation hiding, and avoid loading secondary cover/card image eagerly on mobile if possible. |
| `/how-it-works` | H1 `Give your saree a second story`. | Text | 4290 | 1454 | 0 | 0 | 2836 | Route is `force-dynamic` and reads CMS globals. Above-fold heading is wrapped in client `ScrollReveal`, importing GSAP even though above-fold animation is skipped. | Make above-fold hero server-rendered without `ScrollReveal`; keep any reveal behavior for below-fold cards only. |
| `/privacy-policy` | List item about payment information. | Text | 4291 | 680 | 0 | 0 | 3611 | Static text page still hydrates global providers/header/widgets and uses client `ScrollReveal` for the first block. Render-blocking CSS insight flags two Next CSS chunks. | Remove `ScrollReveal` from first-paint policy heading; consider lighter static layout/provider split if LCP remains high. |
| `/shipping-policy` | Paragraph: `See our packing guide...` | Text | 4455 | 731 | 0 | 0 | 3725 | Same static text render-delay pattern as policy pages; `ScrollReveal` on first block and global client shell. | Remove first-paint `ScrollReveal`; preserve content and SEO/noindex policy. |
| `/return-policy` | First policy paragraph. | Text | 4112 | 726 | 0 | 0 | 3385 | Same static text render-delay pattern as policy pages. | Remove first-paint `ScrollReveal`; preserve content and routing. |
| `/packing` | First packing paragraph. | Text | 4114 | 710 | 0 | 0 | 3403 | Same static text render-delay pattern as policy pages. | Remove first-paint `ScrollReveal`; preserve content and routing. |

## Supporting Signals

| Route | TBT | Main-thread work | Unused JS | Render-blocking resources | Font blocking | Largest image candidate |
|---|---:|---:|---|---|---|---|
| `/` | 58ms | 1960ms | 154KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | none | `font-display` pass | `/category/Chiffon.JPG` via Next image, 182KiB transfer, low priority |
| `/collection` | 51ms | 2113ms | 88KiB, led by `3-v9b6b6bj3_w.js`, `0jasdmg096i75.js`, `3zc2qbfkyq987.js` | none | `font-display` pass | `/banner/collection_banner.png` via Next image, 48KiB transfer, high priority |
| `/cart` | 19ms | 984ms | 88KiB, led by `3-v9b6b6bj3_w.js`, `0jasdmg096i75.js`, `3zc2qbfkyq987.js` | none | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |
| `/checkout` | 19ms | 1062ms | 119KiB, led by `3-v9b6b6bj3_w.js`, `347vi93ovo4mm.js`, `0jasdmg096i75.js` | none | `font-display` pass | `/media/home-cover.png` via Next image, 25KiB transfer |
| `/our-story` | 2ms | 1106ms | 88KiB, led by `3-v9b6b6bj3_w.js`, `0jasdmg096i75.js`, `3zc2qbfkyq987.js` | CSS chunks `1kcbgtfkf97lf.css` 453ms, `1_qxq1vlv_ur9.css` 153ms | `font-display` pass | `/category/kanjiverram.jpg` via Next image, 179KiB transfer |
| `/how-it-works` | 2ms | 703ms | 100KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | none | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |
| `/privacy-policy` | 1ms | 782ms | 122KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | CSS chunks `1kcbgtfkf97lf.css` 453ms, `1_qxq1vlv_ur9.css` 153ms | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |
| `/shipping-policy` | 1ms | 943ms | 100KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | CSS chunks `1kcbgtfkf97lf.css` 452ms, `1_qxq1vlv_ur9.css` 152ms | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |
| `/return-policy` | 0ms | 740ms | 122KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | CSS chunks `1kcbgtfkf97lf.css` 453ms, `1_qxq1vlv_ur9.css` 153ms | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |
| `/packing` | 1ms | 789ms | 122KiB, led by `3-v9b6b6bj3_w.js`, `1u-29vb7wf2e8.js`, `0jasdmg096i75.js` | CSS chunks `1kcbgtfkf97lf.css` 453ms, `1_qxq1vlv_ur9.css` 153ms | `font-display` pass | `/logo.png` via Next image, 25KiB transfer |

## Source Inspection Notes

- `app/(site)/layout.tsx` wraps every public route in client `Providers`, `SiteHeaderServer` -> client `SiteHeader`, client footer, and client `SiteWidgets`.
- `components/widgets/site-widgets.tsx` already delays floating widgets by 1800ms and dynamically imports them, so widgets are no longer the primary 4-6s LCP cause.
- `components/layout/site-header.tsx` is still a broad client island with `useSession`, search, cart drawer, mobile sheet, connect dialog, and the priority logo image on every route.
- `components/animations/scroll-reveal.tsx` is a client component importing GSAP. It now skips hiding above-fold content, but static page headings still pay the client component and GSAP module cost.
- `components/cart/cart-page-client.tsx` owns the entire cart hero and first content inside a client component.
- `components/checkout/checkout-page-client.tsx` owns checkout empty/auth/steps first content inside a client component.
- `components/sections/collection-hero-carousel.tsx` maps all banner slides on initial render, although only slide 0 is visible.
- `app/(site)/our-story/page.tsx` is fully client-side and imports Framer Motion for the first visible cover.
- Source assets are still large even when Next transcodes them:
  - `public/hero/mobile_1.png`: 1080x1920, 2.2MB
  - `public/hero/3.png`: 1920x1080, 2.3MB
  - `public/banner/collection_banner.png`: 1920x1080, 4.1MB
  - `public/banner/collection-banner2.png`: 1920x1080, 3.8MB
  - `public/category/kanjiverram.jpg`: 1365x2048, 1.3MB
  - `public/category/silk.JPG`: 2048x1365, 1.4MB

## Diagnosis

The remaining failures are not a single external widget problem anymore. They split into three buckets:

1. Image-led pages (`/collection`, `/our-story`, likely `/`) need smaller first-viewport image sources and less carousel/secondary-image contention.
2. Client-shell pages (`/cart`, `/checkout`) need server-rendered static first content so the visible LCP text is not tied to cart/auth/query/payment hydration.
3. Static text pages need the above-fold `ScrollReveal` removed and, if still above target, a deeper global header/provider split because the content itself is already server-rendered and font-display passes.

The strict 2.5s public mobile gate may still require a formal rebaseline if server TTFB remains 700-1600ms under LHCI throttling after first-paint cleanup. Any rebaseline should be based on fresh post-fix artifacts, not these pre-fix numbers.
