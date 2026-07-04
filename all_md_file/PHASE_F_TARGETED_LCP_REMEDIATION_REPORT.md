# Phase F Targeted LCP Remediation Report

## Safe Fixes Applied

`app/globals.css`
- Removed global `text-rendering: optimizeLegibility`.
- Reason: the failing text-LCP routes show low TBT/CLS and a large FCP-to-LCP gap. Removing this paint hint is a safe render-path change that does not alter content or business behavior.

`components/layout/site-footer.tsx`
- Added `loading="lazy"` and `fetchPriority="low"` to the footer-only logo image.
- Added `fetchPriority="low"` to the decorative footer trunk image.
- Reason: footer imagery is below fold on the audited routes and should not compete with true page LCP candidates.

No product image crop, color, transformation, pricing, checkout, auth, payment, shipping, order ownership, or DB behavior was changed.

## Related Safe SEO Fix

`app/sitemap.ts`
- Added `/sell-your-saree` to the static sitemap list because the route exists and is indexable.
- This is not an LCP fix, but it was part of the Phase F SEO preflight.

## Post-Fix Public Mobile LHCI

Command:

```bash
npx -y -p node@22 -p pnpm@10.28.0 pnpm run agent:check
```

Result:
- verify portion passed: tests, lint, build.
- LHCI public mobile failed LCP and stopped before desktop/admin stages.

| Route | Perf | SEO | FCP ms | LCP ms | TBT ms | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 74 | 100 | 1357 | 7982 | 95 | 0.0004 |
| /collection | 82 | 100 | 1356 | 4823 | 46 | 0.0004 |
| /cart | 83 | 66 | 1205 | 4695 | 7 | 0.0004 |
| /checkout | 83 | 66 | 1205 | 4743 | 5 | 0.0004 |
| /our-story | 80 | 100 | 1206 | 5193 | 3 | 0.0005 |
| /how-it-works | 78 | 100 | 1205 | 5726 | 46 | 0.0004 |
| /policies/privacy-policy | 86 | 100 | 1207 | 4141 | 12 | 0.0004 |
| /policies/terms-of-service | 86 | 100 | 1205 | 4212 | 5 | 0.0004 |
| /policies/shipping-delivery-policy | 86 | 100 | 1205 | 4195 | 5 | 0.0004 |
| /policies/return-refund-policy | 86 | 100 | 1206 | 4216 | 5 | 0.0004 |
| /packing | 84 | 100 | 1206 | 4439 | 3 | 0.0004 |

## Network Clues

Largest transferred image per latest mobile report:

| Route family | Evidence |
| --- | --- |
| Homepage | `/category/Chiffon.JPG` optimized to `w=640`, about 188632 bytes transfer. |
| Collection | largest transfer was a remote product-card image, about 105367 bytes; collection mobile banner assets are already WebP and small. |
| Our Story | `/category/kanjiverram-lcp.webp` optimized to `w=750`, about 125481 bytes transfer. |
| Text/static routes | footer trunk optimized candidate remains about 49246 bytes transfer. |

## Interpretation

The footer changes did not resolve route-global LCP. Text routes still fail with low TBT and near-zero CLS, which points to a broader render/load policy issue rather than a single footer asset. Homepage worsened in this single local LHCI run and should be rechecked after deeper homepage media/runtime work.

## Remaining LCP Work

Owner approval is needed for media replacements or visual changes. Safe next candidates:
- homepage story/category image optimization or art direction review;
- our-story cover image approval packet;
- production PSI/Vercel Speed Insights comparison to determine if local LHCI should be rebaselined;
- possible route-family policy change for noindex cart/checkout if owner approves.

Launch classification: mobile LCP remains NO-GO under current policy.
