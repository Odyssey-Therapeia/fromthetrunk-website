# Traffic Load Performance Audit

Status: Conditional NO-GO for performance readiness until mobile LCP is addressed or explicitly waived.

No production load test was run. Local Lighthouse was run through `pnpm run agent:check`; it failed in the public mobile pass.

## Evidence Reviewed

- Homepage data fetches: `app/(site)/page.tsx:32-84`
- Product/collection cache layer: `lib/data/products.ts:1-179`, `lib/data/catalog-cache.ts:53-132`
- Catalog search adapter: `lib/adapters/postgres-catalog-search.ts:1-760`
- Product stock/detail route: `api/hono/routes/products.ts:464-628`
- Search, geo, events routes: `api/hono/routes/search.ts:41-115`, `api/hono/routes/geo.ts:36-90`, `api/hono/routes/events.ts:46-95`
- Neon HTTP driver and retry: `db/index.ts:1-147`
- Next image config/security headers: `next.config.ts:1-113`
- Homepage intro media: `components/sections/home-intro-gate.tsx:1-126`
- Vercel Analytics/Speed Insights injection: `app/(site)/layout.tsx:95-124`

## Route Risk Matrix

| Route | Cacheability | External/DB calls | Bottleneck | 10 users | 100 users | 1000 users |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Revalidate/cached data paths | globals, featured products, product list | hero/intro media, DB cache miss | Low | Medium | High without CDN/cache proof |
| `/collection` | cached facets/search paths | catalog search/facet aggregates | facet fanout and image grid | Low | Medium | High if cold/unindexed |
| PDP | 300s product cache and 60s API cache | product hydrate/images | image LCP and stock polling | Low | Medium | Medium-high |
| `/our-story`, `/how-it-works`, `/faqs`, `/why`, `/sell-your-saree` | mostly content/render cacheable | limited DB if dynamic content | large assets/scripts | Low | Medium | Medium |
| `/api/v2/products/[slug]/stock` | `max-age=5`, stale 30 | lightweight DB stock query | hot polling during drops | Low | Medium | Medium-high |
| `/api/v2/geo/search` | CDN cache, upstream fetch cached | Photon external API | upstream latency/rate | Low | Medium | High if uncached queries |
| `/api/v2/search` | memory rate-limited | catalog search ILIKE/facets | DB scan/facet aggregates | Low | Medium | High |
| `/api/v2/search/semantic` | not cacheable | embeddings/vector logic | LLM/embedding cost | Medium | High but durable limited | High but durable limited |
| `/api/v2/events/track` | not cacheable | analytics sink | write volume | Low | Medium | High if memory limit bypassed |

## Strengths

- Public product detail uses `unstable_cache` with 300s revalidation and API cache headers.
- Stock endpoint returns a lightweight payload only and has rate limiting plus `Server-Timing`.
- Catalog hydration is limited to visible rows rather than every match.
- Neon HTTP driver avoids long-lived WebSocket pool fragility and wraps reads in retry.
- Image optimizer is configured for AVIF/WebP, device sizes, remote patterns, and 30-day image cache TTL.
- Geo has CDN cache headers and a 3.5s upstream timeout.
- Semantic search and payment/auth mutation routes use stricter durable rate limits.

## Bottlenecks

- Large public assets: `public/Welcoming.mp4` 13 MB, `public/hero/banner.png` 11 MB, `public/hero/timeless.JPG` 7.5 MB, `public/welcome.webp` 6.8 MB, plus several 2 MB to 5 MB images.
- Desktop homepage intro can play a 3 MB WebM or 13 MB MP4 fallback before reveal. It skips mobile and reduced-motion users, but desktop LCP/TBT should be measured.
- Catalog facets run multiple aggregate queries in parallel over published visible products. Fine for tens/hundreds of products, but not proven at thousands.
- Keyword search is memory rate-limited and not durable; it uses ILIKE by design for small catalog scale.
- Events tracking uses a memory limiter and writes analytics events; a traffic spike can create write load if not buffered.
- Actual Vercel region and Neon region latency were not verified in this read-only pass.

## Local Lighthouse Evidence

`pnpm run agent:check` repeated `test`, `lint`, and `build` successfully, then failed during `FTT_LHCI_SCOPE=public FTT_LHCI_FORM_FACTOR=mobile pnpm run lhci:autorun`.

Failed LCP assertions, expected <= 2500 ms:

| Route | LCP |
| --- | ---: |
| `/` | 5207 ms |
| `/collection` | 6707 ms |
| `/cart` | 4549 ms |
| `/checkout` | 4970 ms |
| `/our-story` | 5035 ms |
| `/how-it-works` | 5737 ms |
| `/policies/privacy-policy` | 4214 ms |
| `/policies/terms-of-service` | 4291 ms |
| `/policies/shipping-delivery-policy` | 4368 ms |
| `/policies/return-refund-policy` | 4288 ms |
| `/packing` | 4364 ms |

Additional warnings: `/cart` and `/checkout` SEO category score 0.66, expected >= 0.85. Because the mobile public pass failed first, desktop and admin Lighthouse passes did not run.

## Safe Optimizations

- Run Lighthouse matrix locally/staging only.
- Add route timing snapshots from local/staging logs.
- Compress/replace oversized static images and intro video after owner approval.
- Cache expensive catalog facet responses when filters do not need live counts.
- Use Vercel Speed Insights and Neon query metrics for real bottleneck confirmation.

## Approval-Required Optimizations

- Change image/video assets used in visible pages.
- Change catalog search indexing/query strategy.
- Add pg_trgm or new DB indexes.
- Add durable limiter requirements to currently memory-limited public endpoints.
- Add queue/batch buffering to analytics events.

## Verdict

Traffic/load: Conditional NO-GO for performance readiness because the local mobile LCP gate failed across all audited public routes. Small browsing traffic may still function, but launch claims need LCP remediation, staging Lighthouse, Neon metrics, Upstash metrics, and Vercel logs.
