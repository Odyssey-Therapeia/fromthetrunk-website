# Phase E Image Media Performance Audit

## Large Public Assets Observed

| Asset | Size bytes | Notes |
| --- | ---: | --- |
| public/Welcoming.mp4 | 13616217 | Desktop intro video source, skipped on mobile by code. |
| public/hero/banner.png | 11229121 | Large legacy/fallback image. |
| public/hero/timeless.JPG | 7827034 | Large legacy/fallback image. |
| public/welcome.webp | 7158352 | Large image asset. |
| public/hero/banner1.png | 6106267 | Large legacy/fallback image. |
| public/packaging/normalpkg-2.png | 5306655 | Large packaging image. |
| public/Ftt_logo_navbar.svg | 5119297 | Large legacy SVG logo asset. |
| public/banner/collection_banner.png | 4254829 | Large legacy banner source. |
| public/banner/collection-banner2.png | 4017984 | Large legacy banner source. |
| public/Welcoming.webm | 3171178 | Desktop intro video source. |

## Critical Route Media

- Homepage hero uses optimized LCP WebP assets such as `/hero/mobile_1-lcp.webp`.
- Collection hero uses mobile WebP banner assets and prioritizes the first slide.
- PDP gallery uses product media from remote blob storage and preserves product representation.
- Footer trunk image is decorative and lazy-loaded.

## Lighthouse Image Findings

- Homepage detailed audit flagged below-fold category and story images as over-sized for rendered dimensions.
- Footer trunk image appeared in top transfer lists on multiple routes before Phase E.
- PDP image LCP remained high, but product media quality/crop/color was not changed because Phase E forbids product representation changes without owner approval.

## Safe Media Fix Applied

`components/layout/site-footer.tsx` now supplies a precise `sizes` value for `/footer/ftt-trunk-saree.webp`.

Evidence:

- Before: footer optimized candidate selected `w=1080`, about 92008 bytes transfer.
- After: footer optimized candidate selected `w=640`, about 49246 bytes transfer.

## Approval-Required Media Work

The following need owner approval before replacement or conversion:

- Product images or PDP LCP image assets.
- Hero art direction changes.
- Visible collection banner swaps.
- Any crop/color/representation changes to sarees.

