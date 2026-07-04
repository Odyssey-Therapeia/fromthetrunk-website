# Staging Blouse Test Product SEO Report

Date: 2026-07-04

## Evidence

The staging public product API and crawl show QA blouse products with:
- Product names such as `StretchFit Blouse`.
- `pricePaise: 100` and old price `500`.
- `status: published`, `stockStatus: available`.
- `typeSlug: blouse`.
- `storyTitle: Untitled Product`.
- Individual PDPs under `/collection/...` currently have `index, follow` and emit Product JSON-LD on staging.

## Fix

Added `lib/seo/product-indexing.ts` with a shared SEO inclusion policy:
- Excludes blouse products from SEO surfaces.
- Excludes `Untitled Product`, `test`, `dummy`, `placeholder`, and `lorem` text patterns.
- Excludes products priced at or below 100 paise.
- Excludes sold products and non-published products.

Applied policy to:
- `app/sitemap.ts`
- `app/llms.txt/route.ts`
- `app/(site)/collection/[slug]/page.tsx`
- `app/(site)/blouses/page.tsx`

## Result After Deploy

QA blouse/test products remain usable for staging checkout sanity but should not be indexed, should not be listed in sitemap or `llms.txt`, and should not emit Product JSON-LD.

