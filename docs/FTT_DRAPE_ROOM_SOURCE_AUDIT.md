# FTT Drape Room — Source-Confirmed Storefront Audit

**Audit date:** 26 August 2026  
**Target source reviewed:** `/Users/JP/Documents/codding projects/git/fromthetrunk-website`  
**Reference source reviewed read-only:** `/Users/JP/Documents/codding projects/git/ftt-drape-room`  
**Product authority:** `docs/plan.md` in the target repository; inspected and not modified  
**Verdict:** GO, with a storefront-native implementation

## 1. Executive conclusion

The target FTT website is a mature Next.js 16 storefront. It already has the systems this feature must integrate with:

- Next.js App Router and React 19
- Drizzle ORM with Neon Postgres
- Hono under `/api/v2`
- NextAuth
- Zustand
- TanStack Query
- Upstash Redis and rate limiting
- Sharp
- Vercel Blob-backed product media derivatives
- Radix/shadcn Dialog, Sheet, Popover, Tooltip, Progress, and Embla Carousel
- existing wishlist, cart reservation, stock, product, media, privacy, FAQ, analytics, Vitest, Playwright, and Lighthouse infrastructure

The correct implementation is not to move the standalone Drape Room into this repository. It is to build a small FTT Drape Room bounded context that uses the storefront’s existing authorities.

## 2. Important correction to the provisional plan

The real storefront does not have one global client provider around every route.

- `app/(site)/layout.tsx` is the true site-wide server layout.
- `components/providers.tsx` is mounted only by selected route layouts, including collection, search, top-viewed, blouses, checkout, and account.
- `components/layout/site-header-server.tsx` is the active sticky header and is rendered outside those route-specific providers.
- `components/layout/site-header-controls.tsx` and `components/layout/site-header.tsx` should not be treated as active integration points unless a fresh source search proves otherwise.

Therefore, do not move the entire storefront under a global `SessionProvider` or `QueryClientProvider`.

The source-confirmed architecture should be:

1. Add one lightweight site-wide `DrapeRoomPortalHost` client island to `app/(site)/layout.tsx`.
2. Keep the heavy Drape Room UI dynamically imported and unmounted until it is opened.
3. Keep selected product/open state in a small non-persisted global Zustand store.
4. Wrap only the lazily mounted Drape Room commerce shell in the auth/query providers required by the existing wishlist component.
5. Keep the navbar photo control as an independent client island that reads IndexedDB after hydration.
6. Preserve all existing route-level providers.

This gives every `ProductCard` instance—including CMS/SEO/homepage uses—a working global Drape Room without increasing the client/provider cost of the whole storefront.

## 3. Exact active integration points

### Global site host

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/app/(site)/layout.tsx`

- renders `SiteHeaderServer`
- renders the site body and footer
- already mounts site-wide client widgets
- should mount the lightweight `DrapeRoomPortalHost`
- must remain a server component

### Route commerce providers

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/components/providers.tsx`

- owns `SessionProvider` and `QueryClientProvider`
- also mounts `WishlistMergeOnLogin`
- should be refactored only enough to expose a reusable lightweight commerce-provider wrapper for the lazy Drape Room shell
- must not be moved globally

### Active header

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/components/layout/site-header-server.tsx`

- is the actual header used by the root layout
- should receive a small `DrapeRoomNavbarPhotoButton` client island in the icon row
- should not guess browser storage on the server

### Product card

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/components/product/product-card.tsx`

- is a client component
- already uses the current product-image resolver
- product image is a product link
- wishlist occupies the upper-right overlay
- recommended Drape Room placement: lower-right of the product-image area
- trigger must be a sibling of the product link
- trigger should use the current effective card stock and exclude blouses
- trigger must use one shared `DrapeRoomTrigger` component

`ProductCard` is reused across collection, search, top-viewed, account wishlist, SEO keyword landing pages, CMS product grids, and PDP related products. This is why the Drape Room host must be site-wide rather than mounted only in the collection layout.

### Product page

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/app/(site)/collection/[slug]/page.tsx`

- is a server component
- resolves effective stock using `resolveProductRowStockStatus`
- has desktop Add to Bag/Wishlist controls
- has a mobile sticky purchase bar
- should build a small serializable `DrapeSaree` projection
- should use the shared trigger in desktop and mobile action areas
- should not pass the full product into the client Drape UI

### Existing commerce authorities

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/components/cart/add-to-cart-button.tsx`

- owns current stock recheck, `/api/v2/cart/reserve`, reservation token handling, cart-store insertion, and analytics
- should be extended with presentation/source props or split into a reusable hook plus presentational button
- Drape Room must not reimplement reservation/cart logic

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/components/product/wishlist-button.tsx`

- owns NextAuth/TanStack wishlist state, mutations, optimistic updates, and authentication dialog
- should be extended with a reusable action-tile presentation or split into a reusable hook
- Drape Room must not create another wishlist implementation

Nested wishlist authentication inside the Drape Room dialog must be tested for focus, stacking, and scroll locking.

## 4. Product and media authority

Relevant files:

- `db/queries/products.ts`
- `db/inventory.ts`
- `lib/products/product-type.ts`
- `lib/media/product-image-resolver.ts`
- `lib/media/derivative-policy.ts`
- `db/queries/media-derivatives.ts`
- `db/schema.ts`

Key findings:

- `getProduct(productId)` already hydrates type, tags, images, and current ready derivatives.
- `resolveProductRowStockStatus` is the current storefront read authority.
- `isBlouseProduct` is the current blouse exclusion helper.
- the image resolver supports a `pdp` role.
- the PDP derivative budget is already 1,200–1,600 px WebP with a hard ceiling of 700 KB.
- approved media URLs are restricted to known HTTPS Vercel Blob hosts and `/media/` paths.
- media derivatives include `sourceHash`, `generationVersion`, `sourceUpdatedAt`, and immutable object keys.

The Drape Room should use the existing PDP derivative as the initial product reference instead of adding another media pipeline. A dedicated try-on derivative should be introduced only if controlled fidelity testing proves the PDP reference inadequate.

The browser may use the current image URL for display, but the generation route receives only `productId` and resolves the product/reference again server-side.

A stable reference version should be derived from server-owned fields such as media asset ID, derivative object key, source hash, generation version, dimensions, and byte size. Product name is metadata, not cache identity.

## 5. API and Vercel boundary

The existing Hono catch-all is:

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/app/api/v2/[...route]/route.ts`

It has `maxDuration = 120`.

The Drape Room needs dedicated Node route handlers outside the Hono catch-all:

- `app/api/tryon/config/route.ts`
- `app/api/tryon/generate/route.ts`

Reasons:

- longer dedicated duration
- multipart binary request
- raw binary image response
- Sharp decoding/transcoding
- strict Drape-specific Origin/session controls
- isolation from the general JSON/OpenAPI API

The existing Hono same-origin middleware allows a missing `Origin` and also accepts host-derived origins. That is appropriate for its current broader API compatibility, but not strict enough for a paid public image-generation action. The Drape route should require an exact configured Origin and a signed anonymous session.

## 6. Distributed controls

Existing reusable pieces:

- `lib/ports/rate-limiter.ts`
- `lib/http/rate-limit.ts`
- `lib/adapters/upstash-rate-limiter.ts`
- `@upstash/redis`
- `@upstash/ratelimit`

The existing rate limiter can be reused for session/IP/global sliding windows, provided the Drape Room:

- fails closed in production when durable Redis is absent
- HMACs session and IP identities
- never stores raw IP
- uses a separate small Redis guard for session locks, idempotency/coalescing state, and global semaphore operations

Do not force concurrency/idempotency into the narrow existing `RateLimiterPort`.

## 7. Database and migration

The project uses Drizzle schema plus SQL migrations under `drizzle/`.

The next Drape Room migration should add metadata-only budget/request records. It must not add image, prompt, photo digest, object URL, or provider-response columns.

Because the repository uses the Neon HTTP driver and no established multi-step transaction pattern was found, the monthly budget reservation must be one atomic SQL statement/CTE or a narrowly scoped database function. Do not implement “read budget, then update budget” as two separate operations.

Do not apply the migration to any database during this task.

## 8. Canonical legal and FAQ sources

Canonical privacy source:

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/lib/legal/policies.ts`

Canonical renderer:

`app/(site)/policies/[slug]/page.tsx`

`/privacy-policy` redirects to `/policies/privacy-policy`, so the legacy standalone page should not receive separate divergent text.

Canonical FAQ source:

`/Users/JP/Documents/codding projects/git/fromthetrunk-website/lib/seo/faq-content.ts`

The FAQ page and FAQ JSON-LD both derive from it. Add Drape Room questions there and preserve the existing owner-approved SEO question list unless intentionally extending it with matching tests.

## 9. Existing UI libraries to reuse

Use the repository’s existing components and dependencies:

- `components/ui/carousel.tsx` + `embla-carousel-react`
- `components/ui/dialog.tsx`
- `components/ui/sheet.tsx`
- `components/ui/popover.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/progress.tsx`
- `lucide-react`
- `zustand`
- `@tanstack/react-query`
- `sonner`
- Tailwind v4 and FTT design tokens
- `sharp`
- `zod`

Do not add another carousel, modal, tooltip, state-machine, notification, CSS-in-JS, or server-image package.

Recommended minimal additions:

- `idb`
- `browser-image-compression`
- `openai`
- a current Node-20-compatible `<3` release of `@google/genai`
- `fake-indexeddb` as a development dependency for deterministic storage tests

The browser-image-compression worker must not load from a third-party CDN. Use a same-origin worker configuration or a main-thread fallback. Do not relax CSP to accommodate a CDN.

## 10. Performance architecture

- Keep the global host tiny.
- Dynamically import the heavy Drape UI only after opening.
- Do not import provider SDKs into client modules.
- Mark server modules `server-only`.
- Load only the configured provider adapter at runtime.
- Pass a minimal `DrapeSaree` projection, not the whole product, into client state.
- Use event handlers for generation; never use an effect that causes a paid call.
- Use IndexedDB for `Blob`s and object URLs for display.
- Revoke object URLs.
- Use direct imports, not broad barrel imports.
- Start independent server work early and await it late where safe.
- Keep modules and components cohesive; do not recreate the reference repository’s 800–900-line route/components.
- Preserve the existing root and route provider boundaries.

## 11. No-copy boundary

Useful references from the standalone Drape Room:

- `lib/prompt.ts`
- `lib/image.ts`
- `lib/useModelPhoto.ts`
- `components/ModelPhoto.tsx`
- `components/TryOnStage.tsx`
- `lib/drapeSession.ts`
- `lib/requestOrigin.ts`
- `lib/providers/imageGenerationProvider.ts`
- `lib/gemini.ts`
- provider/session/safety tests

Do not port:

- catalogue ingestion/sync/review
- custom wardrobe
- multi-drape selection
- arbitrary notes
- custom drape references
- `.data/`
- process-local guards
- encrypted server result cache
- audit renders
- filesystem usage ledger
- direct route-to-Gemini coupling
- base64 JSON request/response

## 12. Verification boundary

The repository’s package manager authority is `pnpm@10.28.0`. `package.json` and the lockfile are authoritative for verification commands.

Dependency installation for this implementation disabled lifecycle scripts and Husky so the no-version-control execution boundary remained intact. Provider tests use injected fake clients and fixed binary fixtures; they do not use real credentials or make paid image-generation calls. Database verification is offline only and the migration is not applied.

## 13. Final recommendation

Use `docs/plan.md` as the immutable product and architecture authority, plus the accompanying implementation prompt as the source-confirmed execution contract.

The source-confirmed implementation should add a bounded Drape Room subsystem without destabilising the storefront:

- global lazy portal host
- shared card/PDP trigger
- header IndexedDB client island
- typed browser storage
- fixed Nivi compiler
- dedicated binary routes
- environment-selected provider adapters
- strict distributed safety
- metadata-only Neon ledger
- canonical legal/FAQ updates
- exhaustive fake-provider tests
- feature off by default
