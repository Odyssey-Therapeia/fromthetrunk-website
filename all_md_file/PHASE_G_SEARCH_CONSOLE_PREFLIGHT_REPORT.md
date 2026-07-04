# Phase G Search Console Preflight Report

Date: 2026-07-03
Decision: NO-GO for Search Console submission.

## Source-Level SEO Check

Source files show the intended current sitemap/robots/LLM behavior:

- `app/sitemap.ts` includes `/sell-your-saree`.
- `app/sitemap.ts` uses `absoluteUrl(...)` for canonical public URLs.
- `app/sitemap.ts` excludes sold products from product sitemap entries.
- `app/sitemap.ts` includes product images when `productSeoImageUrls(product)` returns safe image URLs.
- `app/robots.ts` points to `absoluteUrl("/sitemap.xml")`.
- `app/robots.ts` disallows private/transactional areas including admin, account, API, cart, checkout, search, and wishlist paths.
- `app/llms.txt/route.ts` includes `Sell Your Saree`.
- `lib/seo/image-urls.ts` rejects unsafe SEO image hosts including localhost and `.vercel.app`.
- `lib/seo/json-ld.ts` emits product `image` as an array when images exist.

Source-level status: READY for deploy validation.

## Live Public SEO Check

Safe public HTTP probes were run against `https://www.fromthetrunk.shop` without submitting anything to Search Console.

| URL | Result |
| --- | --- |
| `/` | HTTP 200 |
| `/robots.txt` | HTTP 200 |
| `/sitemap.xml` | HTTP 200 |

Live sitemap probe:

| Check | Result |
| --- | --- |
| Contains `/sell-your-saree` | FAIL |
| Contains `/faqs` | FAIL |
| Contains `/why` | FAIL |
| Contains `/policies/privacy-policy` | FAIL |
| Contains `/guides/what-is-a-pre-loved-saree` | FAIL |
| Contains localhost / 127.0.0.1 / `.vercel.app` | PASS, none found |
| Product image sitemap tags | FAIL, zero image tags observed |
| URL count | 63 |

Live `robots.txt` currently returns:

```text
User-Agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /checkout
Disallow: /api

Sitemap: https://www.fromthetrunk.shop/sitemap.xml
```

This differs from the current source-level `app/robots.ts`, which has the expanded disallow list and trailing slash paths.

Live `llms.txt` is reachable, but the sampled key pages did not include `Sell Your Saree`, which differs from current source.

## Interpretation

The current source appears ready for post-deploy Search Console validation, but `www.fromthetrunk.shop` is not serving the current source-level sitemap/robots/llms changes yet.

This is a deployment alignment blocker, not a source-level SEO blocker.

## Post-Deploy Inspection List

After the current source is deployed to the confirmed production domain, inspect:

- `https://www.fromthetrunk.shop/`
- `https://www.fromthetrunk.shop/collection`
- one live PDP URL from the deployed sitemap
- `https://www.fromthetrunk.shop/sell-your-saree`
- `https://www.fromthetrunk.shop/faqs`
- `https://www.fromthetrunk.shop/why`
- `https://www.fromthetrunk.shop/policies/privacy-policy`
- `https://www.fromthetrunk.shop/guides/what-is-a-pre-loved-saree`
- `https://www.fromthetrunk.shop/guides/pre-loved-vs-second-hand-saree`

## Submission Gate

Do not submit the sitemap in Search Console until all are true:

- production deploy is owner-approved,
- `www.fromthetrunk.shop` is confirmed attached to the intended Vercel project,
- live `robots.txt` returns HTTP 200 and matches current source intent,
- live `sitemap.xml` returns HTTP 200 and contains `/sell-your-saree`, `/faqs`, `/why`, policy URLs, guide URLs, and safe product image URLs,
- no live sitemap URL contains localhost, `127.0.0.1`, or `.vercel.app`,
- owner approves Search Console submission.
