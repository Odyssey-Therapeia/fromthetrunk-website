# Phase H SEO Workbook Recheck

Date: 2026-07-03
Workbook: `/Users/JP/Downloads/SiteAnalysis_SocialMediaStrategy_FromTheTrunk_Analysis.xlsx`
Result: PARTIAL, launch NO-GO

## Workbook Parsing

- Workbook sheets: `SEO Audit (20 Issues)`, `Social Media Strategy`, `Priority Dashboard`.
- The `SEO Audit (20 Issues)` sheet contains 19 numbered issue rows.
- The `Priority Dashboard` sheet contains 20 action rows.
- Dashboard-only Issue 20 is: replace all Unsplash stock images with original photography.

## Fresh Live SEO Recheck

| Asset | Status | Finding |
| --- | ---: | --- |
| Preview sitemap | 200 | 78 URLs, 345 image tags, includes `/sell-your-saree`, `/faqs`, `/why`, guide route, and no localhost/vercel URLs in locs. |
| Preview robots | 200 | Points Sitemap to `https://www.fromthetrunk.shop/sitemap.xml`. |
| Production `www` sitemap | 200 | 63 URLs, 0 image tags, missing new SEO routes. |
| Production `www` robots | 200 | Still points to the stale `www` sitemap. |

## Launch-Critical Findings

1. Production `www.fromthetrunk.shop` is not serving the current SEO sitemap/robots output. The inspected preview/source is ahead of production.
2. Preview `/blouses` contains published `Rs 1` products and `Untitled Product` copy. Evidence includes `StretchFit Blouse` products with `pricePaise: 100` and old price `500`.
3. Public mobile LHCI still fails LCP across every audited public route.
4. Google Search Console and GA4 activation/submission remain owner-side external confirmations.

## Issue Recheck Summary

| # | Workbook issue | Status | Launch blocker |
| ---: | --- | --- | --- |
| 1 | Test/placeholder products live and indexable | NOT FIXED | Yes. `Rs 1` and `Untitled Product` blouse listings are live on preview `/blouses`. |
| 2 | No product Schema markup | PARTIAL/FIXED | No. PDPs emit Product and BreadcrumbList JSON-LD; AggregateRating is correctly absent until real reviews exist. |
| 3 | No sitemap.xml submitted to Google | PARTIAL | Yes for cutover. Source/preview sitemap improved, but `www` is stale and GSC submission is not done. |
| 4 | Thin product page content | PARTIAL | Tied to content cleanup. Sample PDPs are richer, but blouse/test-like products remain weak. |
| 5 | No blog/editorial content | PARTIAL | No. Guide pages exist, but no ongoing blog/editorial system was verified. |
| 6 | GSC and GA4 not confirmed active | NOT VERIFIED | Yes for launch measurement. Requires owner confirmation. |
| 7 | Missing canonical tags and pagination SEO | PARTIAL/FIXED | No. Tested filters noindex and canonicalize to `/collection`; pagination rel checks remain incomplete. |
| 8 | Title tags not keyword-first | PARTIAL | No. Titles exist but not all are keyword-first. |
| 9 | No category landing pages | PARTIAL/FIXED | No. Fabric/occasion and keyword landing pages exist, but full workbook taxonomy is not complete. |
| 10 | Image alt generic/missing | PARTIAL | No. Product card alt exists, but crawls still show missing alt on many decorative/logo/footer images. |
| 11 | No FAQ content with FAQPage Schema | FIXED/PARTIAL | No. `/faqs` and `/sell-your-saree` emit FAQPage; PDP FAQ schema is not implemented. |
| 12 | No external backlink strategy | EXTERNAL | No. Not code-verifiable. |
| 13 | No customer reviews | NOT FIXED | No. Do not fake reviews or AggregateRating. |
| 14 | Placeholder WhatsApp number | FIXED on preview/source | No. Footer uses real WhatsApp link and email; production needs post-deploy check. |
| 15 | Missing breadcrumb navigation and Schema | PARTIAL/FIXED | No. PDPs and sell page emit BreadcrumbList JSON-LD. |
| 16 | Meta descriptions too short/no CTA | PARTIAL | No. Descriptions exist, but not all have ideal length/CTA. |
| 17 | Large images/lazy/WebP/Core Web Vitals | PARTIAL/NO-GO | Yes. Mobile LCP fails in LHCI. |
| 18 | No Sell Your Saree page | FIXED on preview/source | Yes until `www` deploy aligns. |
| 19 | No local SEO presence | EXTERNAL/NOT FIXED | No. Requires Google Business Profile/listings owner work. |
| 20 | Dashboard-only: replace Unsplash stock images | PARTIAL/NOT FIXED | No. Source still permits Unsplash domains and at least one section references Unsplash. |

See `PHASE_H_SEO_WORKBOOK_RECHECK_MATRIX.csv` for the row-level matrix.

## Source Evidence

- Sitemap includes sell page, policy pages, keyword pages, product pages, and product images: `app/sitemap.ts:74`, `app/sitemap.ts:87-110`.
- Product SEO image URL sanitation: `lib/seo/image-urls.ts:25`.
- Product JSON-LD uses product image URLs: `lib/seo/json-ld.ts:4-12`.
- Product pages import keyword/breadcrumb SEO support: `app/(site)/collection/[slug]/page.tsx:45-60`.
- FAQ page and sell page exist in source: `app/(site)/faqs/page.tsx`, `app/(site)/sell-your-saree/page.tsx`.
- `llms.txt` includes Sell Your Saree and policy routes: `app/llms.txt/route.ts:30-43`.

## SEO Launch Decision

SEO is NO-GO for production cutover until:

- `www.fromthetrunk.shop` serves the current sitemap/robots/llms output.
- `Rs 1`/`Untitled Product` live catalog entries are cleaned.
- GSC/GA4 are owner-confirmed.
- Mobile LCP risk is resolved or explicitly accepted by the owner.

