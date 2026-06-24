# PERF_AUDIT.md — From the Trunk

**Scope:** read-only performance audit (route latency + repeated client/API requests). No code was changed. No Razorpay / checkout / cart / auth / product logic was modified. This is evidence + proposed fixes for review only.

**Method:** static inspection + ripgrep across `app/`, `components/`, `lib/`, `api/`, `db/`, plus `proxy.ts`, `next.config.ts`, schema and `.env.local` hints. Production build comparison (§9) is described but **not executed** (a full `pnpm build` was deliberately not run to avoid disrupting the running dev server).

---

## A. Executive summary — top 5 suspected causes (ranked by confidence)

1. **`/collection` is `force-dynamic` and its public data path is completely uncached** — `~6 DB round-trips per render` (collection-id resolve + product rows + count + **4 facet GROUP BYs**) plus uncached `getGlobals` + `getCollections`, re-run on **every filter click**. This is the direct cause of `GET /collection?tags=everyday 200 in 2.1s`. **Confidence: very high.**
   - `app/(site)/collection/page.tsx:26` `export const dynamic = "force-dynamic"`; `:303` `draftMode()`; public path uses `searchProducts` (`lib/adapters/postgres-catalog-search.ts`) which has **no `unstable_cache`** (unlike the PDP data layer).

2. **DB driver has no connection pooling / socket reuse** — `db/index.ts` uses `@neondatabase/serverless` **neon-http**, so *every query is a fresh HTTPS + TLS request* to a **us-east-1** Neon pooler (`channel_binding=require`), with no `vercel.json` region pin. This is why `db-ping` is 650–800ms (3 serial round-trips) and it **multiplies every uncached query in cause #1**. **Confidence: very high.**

3. **Homepage LCP is an unoptimized CSS background PNG** — `components/sections/hero-section.tsx` paints slides as CSS `background-image: url("/hero/*.png")` (not `next/image`), so they are not transcoded (AVIF/WebP), not responsive, not preloaded, and discovered late. This is the main LCP-warning source. **Confidence: high.**

4. **Repeated `GET /collection/[slug]` and `/api/v2/products/[slug]` after load are mostly dev-mode `<Link>` prefetch** of related/recently-viewed cards re-running the dynamic route; amplified because the route is dynamic (no full-route cache). **Confidence: medium-high** (needs the prod build in §9 to confirm which persist).

5. **`SessionProvider` uses default `refetchOnWindowFocus` (no config) + per-API-request `getToken`** — repeated `/api/auth/session` and the wishlist refetch on focus, each paying a neon-http round-trip on the auth/wishlist path. Per-call work is cheap (JWT decode, single query); the cost is round-trip count. **Confidence: medium.**

**Ruled out as bottlenecks (good news):** the proxy (correctly excludes `_next/image`, `_next/static`, all media prefixes, `api/`); wishlist fan-out (a shared React Query key dedupes N buttons → 1 call); grid stock fan-out (cards pass `enabled:false`, so a 24-card grid makes **0** stock requests); missing indexes (schema is well-indexed; only `orders.shipping_email` is a real gap).

---

## B. Request waterfall

### B1. `/collection` (and `/collection?tags=…`)

**Server (per render — re-runs on every filter change because route is `force-dynamic` + `FilterLink` does `router.replace`):**
1. `draftMode()` → forces dynamic (`page.tsx:303`)
2. `getGlobals("collectionPage")` — **uncached** DB read (`page.tsx:327`, `lib/data/products.ts:101`)
3. `getCollections({ onlyWithProducts: true })` — **uncached** DB read (`page.tsx:328`)
4. `searchProducts(...)` → `postgres-catalog-search`:
   - `buildScopedCollectionIds` (collection slug → product ids): `getCollectionBySlug` + `getCollectionProductIds`
   - product **rows** query (`.limit(visibleLimit)`)
   - **count** query
   - `buildFacets()` = **4 parallel GROUP BY aggregates** (fabric, type, availability, tags) — *catalog-wide, filter-independent, recomputed every render*
   - → ~6 DB round-trips, **none cached**, each a fresh neon-http request

**Client (after load):**
- Per logged-in user: **one** deduped `GET /api/v2/wishlist` (shared key `["wishlist","ids"]`)
- `GET /api/auth/session` on first mount + on each window focus
- Product grid cards: **no** stock calls (`useLiveProductStock({enabled:false})`)

**Repeated after load:** `<Link href="/collection/[slug]">` on every `ProductCard` prefetches the PDP route on viewport/hover → repeated `GET /collection/[slug]` in **dev** logs (re-runs the dynamic route). Filter clicks → full `router.replace` → full uncached server render again.

### B2. `/collection/[slug]` (PDP)

**Server:**
1. `generateMetadata` → `getProductBySlug(slug)` (`page.tsx:53`)
2. `draftMode()` (`page.tsx:84`) → dynamic
3. page → `getProductBySlug(slug, {includeDrafts})` (`page.tsx:86`) — **same cache key as #1 for public traffic → deduped to 1 DB hit** via `cache()`+`unstable_cache(300s)`; **splits to 2 DB reads only in draft/preview**
4. `resolveProductRowStockStatus(...)` (`page.tsx:93`) — pure, **no DB**
5. `getProducts(12, …)` for related (`page.tsx:111`) — cached `unstable_cache(300s)`; ranking in-process
   - **No** `getActiveReservationsCount` / `deriveStockStatus` / `isInventoryV2` in render.

**Client (mounted):** ProductGallery, ProductViewTracker, **AddToCartButton ×2** (desktop aside + fixed mobile bar), WishlistButton, RestockNotifyButton (conditional), ProductCard ×≤4 related, RecentlyViewed.

**Client calls after load:**
- `AddToCartButton` → `useLiveProductStock` **enabled** → Electric subscribe **or** fallback poll `GET /api/v2/products/[slug]/stock` **every 60s** (visible tab). Mounted twice → ≤2 instances, **deduped by a 5s module cache** → ~1 request / 5s window.
- WishlistButton → shared deduped `GET /api/v2/wishlist` (authed only).
- ProductViewTracker / RecentlyViewed → localStorage only, no network.
- Related ProductCard `<Link>`s → prefetch sibling PDP routes (dev) → more `GET /collection/[slug]`.

---

## C. Exact evidence

| # | Issue | Evidence (file:line) | Severity | Confidence | Proposed fix |
|---|---|---|---|---|---|
| C1 | `/collection` forced dynamic | `app/(site)/collection/page.tsx:26` `dynamic="force-dynamic"`; `:303` `draftMode()` | High | High | ISR + draft bypass (§E) |
| C2 | Public catalog path (`searchProducts`) has no cache | `lib/adapters/postgres-catalog-search.ts` (direct `db`/`withRetry`, no `unstable_cache`); page uses it at `page.tsx:362,379,408` | High | High | Wrap in `unstable_cache` w/ tags (§E) |
| C3 | Facets = 4 GROUP BYs, catalog-wide, recomputed every render | `postgres-catalog-search.ts:97-192` (`buildFacets`), called every render via `Promise.all` `:343-349` | High | High | Cache facets separately; they're filter-independent (§E) |
| C4 | `getGlobals` + `getCollections` uncached per render | `page.tsx:327-328`; `lib/data/products.ts:101-116` (no cache wrapper) | Medium | High | `unstable_cache` (§E) |
| C5 | neon-http driver, no pooling/socket reuse | `db/index.ts:1-19` (`neon()`, `drizzle/neon-http`); `.env.local` us-east-1 pooler + `channel_binding=require`; no `vercel.json` | High | High | Region-pin + consider pooled driver / cache reads (§F) |
| C6 | `db-ping` = 3 serial round-trips | `app/api/debug/db-ping/route.ts:59-75` | Low | High | Parallelize; debug-only, low priority |
| C7 | PDP route not full-route cacheable (`draftMode()`) | `app/(site)/collection/[slug]/page.tsx:84`; data layer already cached `lib/data/products.ts:37-49` | Medium | High | Split draft vs public render (§E) |
| C8 | PDP duplicate `getProductBySlug` (metadata+page) | `[slug]/page.tsx:53` + `:86` | Low | High | Deduped for public by `cache()`; splits only in preview — low impact |
| C9 | Stock fallback polls every 60s ×2 instances on PDP | `lib/realtime/use-live-product-stock.ts:147-148`; `use-electric-shape.ts:62-71`; AddToCartButton mounted `[slug]/page.tsx:222,415` | Medium | High | Single shared subscription; raise interval; pause when not interacting (§E) |
| C10 | Re-subscribe churn if `initialStatus`/`productId` identity changes | `use-electric-shape.ts:132-141` deps incl. memoized callbacks keyed on `initialStatus` | Medium | Medium | Stabilize props / key (§D) |
| C11 | Repeated `GET /collection/[slug]` after load | `ProductCard` `<Link>` (`product-card.tsx`), RecentlyViewed, related cards — prefetch on viewport (dev) | Medium | Medium-high | `prefetch={false}` on grid/related links (§D); confirm in prod (§9) |
| C12 | `/api/auth/session` repeated | `components/providers.tsx:14` bare `SessionProvider` (default `refetchOnWindowFocus:true`); 11 `useSession` consumers | Medium | High | Pass `refetchOnWindowFocus={false}` / seed session (§E) |
| C13 | Session cost is round-trips, not DB | `lib/auth/options.ts:90-116` jwt strategy, in-memory session callback | Info | High | — (rules out DB as session cost) |
| C14 | Wishlist already optimal (deduped) | `wishlist-button.tsx:44` static key `["wishlist","ids"]`, `:47` `staleTime:30_000`; `db/queries/wishlist.ts:22-29` single query | Info | High | No change needed; minor: lift to layout (§E optional) |
| C15 | Wishlist merge is guarded (no loop) | `wishlist-merge-on-login.tsx:41-73` (`mergedRef`) | Info | High | No change needed |
| C16 | Homepage hero LCP = CSS background PNGs | `hero-section.tsx:312,330,345` (bg-image divs); `/hero/*.png` | High | High | Convert LCP slide to `next/image` priority, WebP/AVIF (§E/§F) |
| C17 | `fill` images missing `sizes` | `how-it-works.tsx:54`, `recently-viewed.tsx:90`, `search-bar.tsx:170` | Low | High | Add `sizes` (§D) |
| C18 | `priority` on below-fold images | `landing-sections.tsx:396` (mid-page story), `instagram-social-card.tsx:90` via `social-reel-carousel.tsx:74` | Low | High | Remove `priority` (§D) |
| C19 | Above-fold images NOT prioritized | `fabric-category-motion-grid.tsx:155` (under hero), `campaign-banner-section.tsx:55` | Low | Medium | Add `priority`/`fetchPriority` to true LCP only (§D) |
| C20 | Invalid `preload` prop on `<Image>` | `collection-hero-carousel.tsx:58` | Low | High | Remove invalid prop (§D) |
| C21 | Missing index: `orders.shipping_email` (guest lookup) | `db/queries/orders.ts:99-104`; no index in `db/schema.ts` | Medium | High | Add `lower(shipping_email)` index (§F) |
| C22 | Optional index: `orders (user_id, created_at)` | `orders.ts:111-119` filter+sort; only `(user_id)` exists `schema.ts:427` | Low | Medium | Composite index (§F) |
| C23 | Latent regression: stale backup polls per card | `components/product/product-card-commerce-row(orginal).tsx:34` `useLiveProductStock` **enabled** (NOT imported by current ProductCard) | Low | High | Delete the `(orginal)` backup file (§D) |

---

## D. Safe fixes (no risk — do not change behavior/colors/layout)

- **Add `sizes` to the 3 fill images** missing it: `how-it-works.tsx:54`, `recently-viewed.tsx:90`, `search-bar.tsx:170`. (C17)
- **Remove `priority` from below-fold images**: `landing-sections.tsx:396`, `instagram-social-card.tsx` (`social-reel-carousel.tsx:74`). (C18)
- **Remove the invalid `preload` prop** on `collection-hero-carousel.tsx:58` (it's not a valid `next/image` prop). (C20)
- **Add `prefetch={false}`** to grid/related `<Link>`s that point to PDPs (`ProductCard`, RecentlyViewed, related) to stop background route requests on viewport. (C11) — verify in prod (§9) first.
- **Stabilize `useLiveProductStock` inputs** so the Electric effect doesn't re-subscribe (pass a stable `initialStatus`/memoized props). (C10)
- **Delete the dead backup** `components/product/product-card-commerce-row(orginal).tsx` so it can never be re-wired to poll per card. (C23)
- **Parallelize the 3 `db-ping` queries** (`Promise.all`) — debug route only. (C6)
- No `router.refresh` is misused in the storefront (only `account-shell.tsx:110`, appropriate) — nothing to remove there.

## E. Medium-risk fixes (cache/route changes — keep behavior identical, add draft bypass)

- **Wrap the public catalog path in `unstable_cache` with tags** (`searchProducts` / `postgres-catalog-search`) mirroring the PDP's existing `unstable_cache(revalidate:300, tags)` pattern. Invalidate via the existing `revalidateProductsCache` tag hooks on product writes. (C2)
- **Cache facets independently** — they are catalog-wide and filter-independent, so compute once per `revalidate` window instead of per render. (C3)
- **Cache `getGlobals` + `getCollections`** with `unstable_cache` + tags. (C4)
- **Make `/collection` and the PDP ISR-cacheable for public traffic**, with `draftMode()` branching to a dynamic render only in preview (split the public vs draft path so `draftMode()` doesn't opt the whole public route out of the full-route cache). (C1, C7)
- **`SessionProvider`**: pass `refetchOnWindowFocus={false}` (and consider seeding `session` from the server in the layout) to cut repeated `/api/auth/session`. (C12)
- **Batch / share the PDP stock subscription** so the two `AddToCartButton` instances use one source, and raise the 60s poll or gate it behind interaction. (C9)
- **Homepage hero**: render the active LCP slide via `next/image` with `priority` + responsive `sizes` (keep the others as-is), and serve WebP/AVIF. Add `priority`/`fetchPriority="high"` to the true above-fold image only (`fabric-category-motion-grid:155` or `campaign-banner-section:55`, whichever is the measured LCP). (C16, C19)

## F. Higher-risk fixes (DB / architecture — require testing)

- **Region-pin the deployment to us-east-1** (`vercel.json` `regions: ["iad1"]`) so serverless functions are co-located with Neon, cutting every round-trip. (C5)
- **Reconsider the DB driver for hot read paths** — neon-http pays per-query HTTPS/TLS; a pooled driver (or Neon's pooled/WebSocket path, or heavier caching per §E) reduces round-trip cost. Validate carefully against the serverless runtime. (C5)
- **Add `orders` indexes**: a functional `lower(shipping_email)` index (guest-order lookup) and optional composite `(user_id, created_at)`. (C21, C22)
- **Stock/reservation architecture**: if live stock matters at scale, prefer the Electric shape subscription over the 60s poll, or push stock via a single shared channel. (C9) — do NOT change reservation/checkout logic per audit constraints.

## G. Proposed implementation order

- **Phase 1 — instrumentation only:** run the prod build comparison (§9); add timing logs around `searchProducts`/`buildFacets` and the DB round-trips to quantify the split; confirm which repeated calls persist in production.
- **Phase 2 — repeated-call fixes (§D):** `prefetch={false}` on grid/related links, `sizes` on the 3 fill images, remove wrong `priority`/invalid `preload`, stabilize the stock hook, delete the dead backup file, `SessionProvider` focus-refetch off.
- **Phase 3 — cache/query fixes (§E):** cache `searchProducts` + facets + `getGlobals`/`getCollections`; make `/collection` and PDP ISR with draft bypass; batch the PDP stock subscription.
- **Phase 4 — DB/index fixes (§F):** region pin; `orders` indexes; driver/pooling review.
- **Phase 5 — UX pending states:** the filter `FilterLink` already shows a `data-[pending]` dim during transitions; extend pending/skeleton affordances where caching can't fully hide latency.

---

## §9. Dev vs production note (to run during Phase 1)

Run:
```
rm -rf .next && pnpm build && pnpm start
```
Then compare logs for `/collection`, `/collection?tags=everyday`, `/collection/[slug]`, `/api/v2/products/[slug]/stock`, `/api/v2/wishlist`, `/api/auth/session`.

**Expected dev-only vs prod-reproducible:**
- **`<Link>` prefetch** behaves very differently: in dev it re-runs routes aggressively (so repeated `GET /collection/[slug]` and route prefetches are inflated). In production, prefetch of a **dynamic** route fetches only the `loading.tsx` boundary, not full data — so C11 should largely **not** reproduce in prod (confirm).
- **The 2.1s `/collection` latency (C1–C4)** is **not** prefetch — it's the uncached dynamic render + neon-http round-trips, and **will reproduce in production** until §E caching lands.
- **`/api/auth/session` on focus (C12)** reproduces in both.
- **Stock 60s poll (C9)** reproduces in both (it's a real interval, visible-tab only).

---

*End of audit. No fixes implemented — awaiting review before Phase 2.*
