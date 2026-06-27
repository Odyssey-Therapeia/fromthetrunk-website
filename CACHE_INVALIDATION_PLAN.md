# CACHE_INVALIDATION_PLAN.md

Date: 2026-06-27

Scope: Phase 4.4E cache and invalidation strategy.

## Rules

- Public catalog/read pages can cache.
- User-specific pages must not use shared/global cache.
- Auth, OTP, payment, webhook, and order mutation paths must not cache enforcement decisions.
- Stock display can be briefly stale, but create-order and payment completion must always use fresh database checks.

## Cache Map

| Data | Cache | TTL / Revalidate | Invalidated By |
|---|---|---:|---|
| Homepage public content/products | Route ISR/static data cache | 60s where configured | Product/content admin updates. |
| Collection page CMS global | `getCachedCollectionPage` | 300s | `global:collectionPage`, `catalog`. |
| Visible collections | `getCachedVisibleCollections` | 300s | `collections`, `products`, `catalog`. |
| Catalog search results | `getCachedSearchProducts` | 60s | `products`, `catalog`. |
| Catalog facets | `getCachedCatalogFacets` | 300s | `products`, `catalog`, `facets`. |
| Product detail | `getPublicProductBySlugPersistent` | 300s | `PRODUCTS_CACHE_TAG`, product slug tag. |
| Product stock display route | HTTP cache header | 5s, stale 30s | Fresh lifecycle checks remain authoritative. |
| Wishlist | React Query per user | Client stale time only | Wishlist add/remove/merge invalidates `["wishlist"]`. |
| Addresses | React Query per user | Client stale time only | Address create/update/delete invalidates `["addresses"]`. |
| Orders | React Query per user | Client stale time only | Payment/order mutation invalidation; no shared cache. |
| OTP/auth/payment/webhooks | None | 0 | N/A. |

## Required Revalidation Points

- Admin product create/update/delete: revalidate product slug tags, `products`, `catalog`, and `facets`.
- Product sold/payment completion: revalidate affected product slug and catalog tags.
- Cart reserve/release: do not rely on cache for enforcement; optionally revalidate product slug/catalog if storefront stock display must update quickly.
- Collection create/update/delete: revalidate `collections`, `catalog`, and collection-specific paths.
- CMS/global content edit: revalidate matching global tag.
- Wishlist/address/order mutations: invalidate only the current user's client-side query keys.

## Phase 4.4E Decisions

- Keep collection search/facet cache split.
- Keep product detail cache separate from stock enforcement.
- Do not cache auth/payment/OTP.
- Cap public collection visible products to prevent cache keys from becoming unbounded deep-page scans.

## Remaining Work

- Add explicit tests around cache invalidation hooks for product/admin writes if not already covered.
- Capture staging cache hit/miss evidence with `PERF_DEBUG=1` and route headers.

