export type CacheProbeStatus = "HIT" | "MISS";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const productCacheExpiresAt = new Map<string, number>();
const productListCacheExpiresAt = new Map<string, number>();

const normalizeKey = (value: string) => value.trim().toLowerCase();

const probe = (
  store: Map<string, number>,
  key: string,
  ttlMs = FIVE_MINUTES_MS,
): CacheProbeStatus => {
  const now = Date.now();
  const normalizedKey = normalizeKey(key);
  const expiresAt = store.get(normalizedKey);
  const status: CacheProbeStatus =
    typeof expiresAt === "number" && expiresAt > now ? "HIT" : "MISS";
  store.set(normalizedKey, now + ttlMs);
  return status;
};

export const probePublicProductCache = (slug: string) =>
  probe(productCacheExpiresAt, slug);

export const probePublicProductsListCache = (key: string) =>
  probe(productListCacheExpiresAt, key);

export const clearProductCacheProbe = (
  slugs: Array<null | string | undefined> = [],
) => {
  if (slugs.length === 0) {
    productCacheExpiresAt.clear();
  } else {
    for (const slug of slugs) {
      if (!slug) continue;
      productCacheExpiresAt.delete(normalizeKey(slug));
    }
  }

  productListCacheExpiresAt.clear();
};
