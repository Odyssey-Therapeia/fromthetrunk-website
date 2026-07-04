# Staging Sitemap, Robots, And llms.txt Fix Report

Date: 2026-07-04

## Sitemap

`app/sitemap.ts` now filters product URLs through `shouldIncludeProductInSeo`.

Covered exclusions:
- Missing slug.
- Draft/non-published products.
- Sold products.
- Blouse QA products.
- Placeholder text products.
- Products priced at or below 100 paise.

## llms.txt

`app/llms.txt/route.ts` now uses the same product SEO policy, so answer-engine product links match sitemap eligibility.

## Robots

No broad robots change was needed. Private/system surfaces remain disallowed in `app/robots.ts`. Product-level robots are handled through PDP metadata.

## Staging Note

Live staging will continue to show old sitemap and `llms.txt` output until deploy.

