# SEO Ranking And Indexing Audit

Status: Conditional GO for crawl/index readiness, not a ranking guarantee.

## Evidence Reviewed

- Canonical origin hardening: `lib/seo/site-url.ts:1-78`
- Robots: `app/robots.ts:5-26`
- Sitemap: `app/sitemap.ts:13-135`
- LLM summary route: `app/llms.txt/route.ts:20-83`
- Public metadata helper: `lib/seo/metadata.ts:13-40`
- Product/Organization/WebSite/Breadcrumb JSON-LD: `lib/seo/json-ld.ts:11-145`
- Image URL allowlist/deduplication: `lib/seo/image-urls.ts:7-31`
- Site layout metadata and JSON-LD injection: `app/(site)/layout.tsx:37-124`
- Homepage and PDP metadata/render paths: `app/(site)/page.tsx:32-84`, `app/(site)/collection/[slug]/page.tsx:63-189`
- Collection noindex for filter/query URLs: `app/(site)/collection/page.tsx:118-140`
- Keyword landing pages and FAQ/schema rendering: `components/seo/keyword-product-landing-page.tsx:37-168`, `components/seo/keyword-content-page.tsx:38-117`
- SEO tests: `tests/unit/seo-production-hardening.test.ts`, `tests/unit/seo-phase-2b-2c.test.ts`, `tests/unit/seo-keyword-landing-pages.test.ts`

## Ready

- Canonical URLs default to `https://www.fromthetrunk.shop`; production rejects localhost, `127.0.0.1`, non-HTTPS, and `.vercel.app` origins.
- `robots.txt` allows public crawling and disallows `/admin/`, `/account/`, `/api/`, `/cart`, `/checkout`, `/search`, and `/wishlist`.
- Sitemap includes public static routes, policy routes, keyword pages, and published non-sold PDPs; query/filter URLs and sold products are excluded.
- Product JSON-LD uses truthful product fields, price, INR currency, image array, stock-derived Offer availability, product ID, and SKU. No fake review/rating schema was found.
- Organization and WebSite schema are present in the site layout.
- Breadcrumb and FAQ schema exist on relevant SEO/keyword page components and match visible content paths.
- PDP/product cards use real `next/image` images rather than SEO-critical CSS backgrounds.
- Product sitemap image extensions are populated from validated SEO image URLs.
- `llms.txt` is generated with public product/page summaries and excludes sold products.

## Partial

- Keyword map is meaningful for pre-loved sarees, vintage/second-hand silk and Kanjeevaram, festive, sell-your-saree, and guide-style pages.
- Clusters still partial or missing without content approval: `saree care`, `silk saree care`, `Kanjeevaram saree care`, `saree fabric guide`, `circular fashion India`, and brand modifiers like `FTT sarees`.
- Backlink readiness is a plan, not implementation. No spam backlink action should be taken. Use digital PR only.
- Performance readiness is source-backed but not fully measured in this run. Existing tests cover SEO guardrails, not field ranking impact.

## Missing Or Blocking

- No guarantee of Google ranking can be made.
- No sitemap submission was run by design.
- No live Search Console inspection was run.
- No broken-link crawl was completed in this audit pass.
- Large public media assets can affect mobile LCP and crawl/render efficiency: `public/Welcoming.mp4` 13 MB, `public/hero/banner.png` 11 MB, `public/hero/timeless.JPG` 7.5 MB, `public/welcome.webp` 6.8 MB, and several 2 MB to 5 MB assets.
- `pnpm run agent:check` failed in the public mobile Lighthouse phase on LCP. Measured LCP values were `/` 5207 ms, `/collection` 6707 ms, `/cart` 4549 ms, `/checkout` 4970 ms, `/our-story` 5035 ms, `/how-it-works` 5737 ms, policy pages about 4214 ms to 4368 ms, and `/packing` 4364 ms. Budget was <= 2500 ms.
- Lighthouse also warned that `/cart` and `/checkout` SEO category score was 0.66 against the >= 0.85 assertion. These are private/transactional routes that robots excludes, but the local gate still checks them.

## Route Coverage

- `/`: metadata, Organization/WebSite JSON-LD, Vercel Analytics/Speed Insights, GTM gate, homepage product/content fetches.
- `/collection`: canonical metadata, query/filter noindex, cached catalog calls.
- PDP: product metadata, Product JSON-LD, breadcrumb schema, real images, internal support links.
- `/our-story`, `/our-team`, `/how-it-works`, `/faqs`, `/why`, `/packing`, `/policies/*`: linked via navigation/footer/sitemap/static routes or policy mapping.
- `/sell-your-saree` and guides: keyword page config includes sitemap/indexable routes when configured and product count constraints pass.
- `/sitemap.xml`, `/robots.txt`, `/llms.txt`: implemented as app routes.

## Ranking Growth Blockers

1. Mobile LCP fails the local public Lighthouse gate and is the primary SEO/performance blocker found by verification.
2. Content gaps in care/fabric/circular-fashion keyword clusters need owner-approved pages or approved content edits.
3. Backlinks need real PR partnerships, founder story placements, sustainability/luxury resale mentions, and no purchased/spam links.
4. Live Search Console indexing status is unknown until verified post-launch.

## Technical Fixes To Consider

Approval required if changing app files:

- Add owner-approved guide content for missing keyword clusters.
- Replace or resize multi-megabyte public assets used above the fold.
- Run a non-production crawl/link check and Lighthouse matrix, then fix broken links or LCP causes.

## Verdict

SEO/ranking/indexing: Conditional GO for crawlability and schema-safe indexing, but NO-GO for claiming performance readiness until the mobile LCP gate is fixed or an owner-approved exception is documented.
