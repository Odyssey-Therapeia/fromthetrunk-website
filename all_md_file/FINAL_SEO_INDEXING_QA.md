# FINAL_SEO_INDEXING_QA

_Audit-only. Checked against the production build (`next start`, :3100). **No sitemap submitted, no indexing requested.**_

## Endpoints
| Endpoint | Status |
|---|---|
| `/sitemap.xml` | ✅ 200 `application/xml` (79 `<loc>` URLs, 700 `<image:image>` entries) |
| `/robots.txt` | ✅ 200 `text/plain` |
| `/llms.txt` | ✅ 200 `text/plain; charset=utf-8` |

## robots.txt (production)
```
User-Agent: *
Allow: /
Disallow: /admin/  /account/  /api/  /api/debug/  /api/v2/docs  /api/v2/openapi.json  /cart  /checkout  /search  /wishlist
Sitemap: https://www.fromthetrunk.shop/sitemap.xml
```
- ✅ Points to **production** sitemap (https://www.fromthetrunk.shop).
- ✅ Blocks admin/account/api/docs/cart/checkout/search/wishlist.
- ✅ Does **not** block public SEO pages.
- ✅ Does **not** block product images or `/_next/image` (img host `*.public.blob.vercel-storage.com` crawlable; `/_next/image` allowed).

## Sitemap contents
| Check | Result |
|---|---|
| Canonical public URLs only, `https://www.fromthetrunk.shop` | ✅ |
| Excludes cart/checkout/account/search/admin/api/wishlist | ✅ none present |
| Excludes query-filter URLs (`?…`) | ✅ none present |
| Includes `/faqs`, `/why`, `/sell-your-saree` | ✅ all present |
| Uses `/policies/[slug]` canonical family | ✅ (privacy, terms, shipping-delivery, return-refund, authentication-condition, care-packaging, cancellation, sell-with-us) |
| Legacy top-level policy URLs (`/privacy-policy`, `/terms-of-service`, `/return-policy`, `/shipping-policy`) in sitemap | ✅ **not present** |
| localhost / vercel.app / `http://` indexable leaks | ✅ none (only XML-namespace `http://…sitemaps.org` declarations, which is correct) |

## Redirects (legacy → canonical) — all **308 permanent**
| From | To |
|---|---|
| `/privacy-policy` | `/policies/privacy-policy` ✅ |
| `/terms-of-service` | `/policies/terms-of-service` ✅ |
| `/shipping-policy` | `/policies/shipping-delivery-policy` ✅ |
| `/return-policy` | `/policies/return-refund-policy` ✅ |
| `/founders` | `/our-team` ✅ |

## Canonicals / metadata / schema
| Check | Result |
|---|---|
| Canonical uses `https://www.fromthetrunk.shop` | ✅ |
| localhost / vercel.app in metadata or JSON-LD | ✅ none |
| Product JSON-LD truthful (`@type:Product`, productID, sku, name, description, brand, `image[]`) | ✅ |
| **Fake review/rating schema** (AggregateRating/Review/reviewCount) | ✅ **none** — not emitted in Product JSON-LD, and `lib/seo/json-ld.ts` has no rating logic |
| Product image URLs in JSON-LD `image[]` | ✅ real HTTPS blob URLs |
| FAQ schema matches visible FAQ text | ⏳ **owner spot-check** — FAQ page uses schema from the same content source; recommend a quick visual match |
| Breadcrumb schema | ✅ emitted (keyword pages + PDP) |
| Collection filter pages `noindex` | ✅ `generateMetadata` sets `robots:{index:false}` when filter params present |
| cart/checkout/search `noindex,nofollow` | ✅ confirmed via meta tag |

## Findings
1. **🟡 Soft-404s (medium).** Unknown paths handled by the `[...slug]` catch-all render a "Page Not Found" UI but return **HTTP 200** (e.g. `/swagger`, `/api/docs`). Google can treat 200 "not found" pages as soft-404s / thin content. **Recommend:** the catch-all should call `notFound()` (return real 404 status) for unresolved slugs. `/api/*` is robots-disallowed, but `/swagger` and arbitrary top-level slugs are crawlable. Non-blocking but should be fixed soon after launch.
2. **🟡 `/admin` served with `index,follow` meta** (see security report) — apply `noindex`. Mitigated by robots disallow.

**Gate — SEO technical: GO.** Sitemap/robots/llms/canonicals/redirects/schema are all correct and production-safe. Two medium hygiene items (soft-404 status, admin noindex meta) are fix-soon, not launch blockers. **Do not submit the sitemap to Search Console (out of scope / NO-GO per instructions).**
