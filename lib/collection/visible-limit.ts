/**
 * How many products the UNFILTERED /collection view renders server-side.
 *
 * The canonical listing must expose a crawlable href for every published saree
 * in its initial HTML. At the default 10-per-page this left most of the
 * catalogue reachable only through pagination, so those products had no
 * internal link path from page 1 and depended entirely on the sitemap.
 *
 * Set to the site's existing MAX_VISIBLE_PRODUCTS ceiling rather than a tighter
 * number: the live catalogue already holds 50 visible sarees, so a limit of 50
 * would silently start dropping products from the crawlable listing as soon as
 * one more was published. `resolveCollectionVisibleLimit` clamps to the caller's
 * maxVisibleProducts regardless, so this can never exceed that ceiling.
 *
 * Only the unfiltered view uses it; filtered views and explicit `perPage`
 * navigation keep the normal page size. Product-card images are lazy-loaded, so
 * rendering more links does not download more image bytes.
 */
export const UNFILTERED_COLLECTION_LIMIT = 100;

export type CollectionVisibleLimitInput = {
  /** True only when the canonical location is exactly "/collection". */
  isUnfilteredCanonicalView: boolean;
  currentPage: number;
  itemsPerPage: number;
  maxVisibleProducts: number;
};

/**
 * Resolves the server-side product limit for a collection request.
 *
 * The unfiltered canonical view renders the whole catalogue up to
 * UNFILTERED_COLLECTION_LIMIT. Every other view keeps the existing cumulative
 * `page * perPage` behaviour. Both are clamped by maxVisibleProducts.
 */
export function resolveCollectionVisibleLimit({
  isUnfilteredCanonicalView,
  currentPage,
  itemsPerPage,
  maxVisibleProducts,
}: CollectionVisibleLimitInput): number {
  const requested = isUnfilteredCanonicalView
    ? UNFILTERED_COLLECTION_LIMIT
    : currentPage * itemsPerPage;

  return Math.min(requested, maxVisibleProducts);
}
