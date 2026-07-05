import { revalidateTag } from "next/cache";

import { clearProductCacheProbe } from "@/lib/cache/product-cache-probe";

export const PRODUCTS_CACHE_TAG = "products";

export const productCacheTag = (slug: string) =>
  `product:${slug.trim().toLowerCase()}`;

export const revalidateProductsCache = (slugs: Array<null | string | undefined> = []) => {
  clearProductCacheProbe(slugs);

  try {
    revalidateTag(PRODUCTS_CACHE_TAG, "max");
  } catch {
    // Some unit tests and script contexts do not have a Next.js static store.
  }

  for (const slug of slugs) {
    if (!slug) continue;
    try {
      revalidateTag(productCacheTag(slug), "max");
    } catch {
      // Best-effort invalidation; the 5 minute cache TTL is the fallback.
    }
  }
};
