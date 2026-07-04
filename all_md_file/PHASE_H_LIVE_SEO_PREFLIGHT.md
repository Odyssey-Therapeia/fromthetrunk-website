# Phase H Live SEO Preflight

Date: 2026-07-03
Result: NO-GO for production `www`, GO-ish for preview/source

## Fresh Public Fetch Summary

| URL | Status | URL count | Image tags | New SEO routes present | Unsafe loc values |
| --- | ---: | ---: | ---: | --- | --- |
| `https://fromthetrunk-website.vercel.app/sitemap.xml` | 200 | 78 | 345 | Yes: sell, faqs, why, guide | No localhost/127/vercel locs |
| `https://fromthetrunk-website.vercel.app/robots.txt` | 200 | 0 | 0 | N/A | No |
| `https://www.fromthetrunk.shop/sitemap.xml` | 200 | 63 | 0 | No | No localhost/127/vercel locs |
| `https://www.fromthetrunk.shop/robots.txt` | 200 | 0 | 0 | N/A | No |

Preview robots points Sitemap to `https://www.fromthetrunk.shop/sitemap.xml`. That is acceptable only when `www` is serving the current sitemap. It is not currently doing so.

## Source Evidence

- Sitemap includes sell page: `app/sitemap.ts:74`.
- Sitemap includes policy pages: `app/sitemap.ts:87-88`.
- Sitemap includes product image URLs: `app/sitemap.ts:97-110`.
- Keyword pages are included when marked for sitemap: `app/sitemap.ts:108-117`.
- Robots references `absoluteUrl("/sitemap.xml")`: `app/robots.ts:25`.
- `llms.txt` includes Sell Your Saree and policy routes: `app/llms.txt/route.ts:30-43`.

## Search Console Gate

No Search Console submission was performed. Submission is blocked until:

1. `www.fromthetrunk.shop` serves the current sitemap.
2. Launch-critical placeholder/test-like products are cleaned.
3. Owner confirms GSC property ownership.
4. Owner approves sitemap submission.

## Launch Decision

Live SEO preflight is NO-GO because the public production domain is stale and must not be submitted to Google in its current state.

