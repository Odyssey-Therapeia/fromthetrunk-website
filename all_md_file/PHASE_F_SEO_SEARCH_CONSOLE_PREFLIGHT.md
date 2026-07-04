# Phase F SEO/Search Console Preflight

Status: partial GO for source-level SEO preflight; Search Console submission remains blocked until production deploy and owner approval.

## Actions Taken

`app/sitemap.ts`
- Added `/sell-your-saree` to static sitemap entries because the route exists and is indexable.

No sitemap was submitted.

## Source-Level Verification

| Check | Evidence | Status |
| --- | --- | --- |
| `sitemap.xml` canonical public URLs only | `app/sitemap.ts` uses `absoluteUrl()` and product URLs from published product listing. | PASS source-level |
| `robots.txt` points to production sitemap | `app/robots.ts` sets `sitemap: absoluteUrl("/sitemap.xml")`. Local build logs show invalid localhost origin is normalized to production canonical origin. | PASS source-level |
| `llms.txt` public canonical routes only | `app/llms.txt/route.ts` lists public static pages and published non-sold products. | PASS source-level |
| `/policies/[slug]` canonical family | `app/(site)/policies/[slug]/page.tsx` uses `publicPageMetadata` with `/policies/${policy.slug}`. | PASS source-level |
| `/faqs`, `/why`, `/sell-your-saree` included if indexable | `/faqs` and `/why` were already in sitemap; `/sell-your-saree` added in Phase F. | PASS |
| cart/checkout/account/search/admin/api/wishlist excluded | `app/robots.ts` disallows these families; sitemap static list does not include them. | PASS |
| query URLs excluded | sitemap static URLs contain no query strings; collection filter pages are noindex via metadata when filters exist. | PASS source-level |
| sold/draft/private products excluded | `listProducts({ includeDrafts: false })`; sitemap filters `stockStatus !== "sold"`. | PASS source-level |
| product images in sitemap image extension | `app/sitemap.ts` adds `images` from `productSeoImageUrls(product)`. | PASS source-level |
| Product JSON-LD image array | `lib/seo/json-ld.ts` adds `image: images` when product SEO images exist. | PASS source-level |
| no fake review/rating schema | `lib/seo/json-ld.ts` does not emit review, rating, or aggregate rating fields. | PASS source-level |
| no localhost/vercel.app in production SEO outputs | `lib/seo/image-urls.ts` rejects localhost and `*.vercel.app` image URLs; build logs show canonical origin fallback to production when local env is invalid. | PASS source-level, production env still unknown |

## Remaining Blocker

Search Console/sitemap submission: BLOCKED until production deploy is approved and owner approves submission.
