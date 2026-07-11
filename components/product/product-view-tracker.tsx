"use client";

import { useEffect } from "react";

import { trackOncePerSession } from "@/lib/analytics/client";
import { buildViewItemEvent } from "@/lib/analytics/ga4-ecommerce";
import { trackRecentlyViewed } from "@/lib/store/recently-viewed";

interface ProductViewTrackerProps {
  category?: string | null;
  id: string;
  image: string;
  name: string;
  price: number;
  slug: string;
  variant?: string | null;
}

/**
 * Invisible component that records a product view in localStorage
 * when mounted. Place it on the product detail page.
 */
export function ProductViewTracker({
  category,
  id,
  image,
  name,
  price,
  slug,
  variant,
}: ProductViewTrackerProps) {
  useEffect(() => {
    trackRecentlyViewed({ id, slug, name, price, image });

    const pricePaise = Math.round(price * 100);

    trackOncePerSession(
      `product_view:${id}`,
      "product_view",
      {
        pricePaise,
        productId: id,
        slug,
        source: "pdp",
      },
      buildViewItemEvent(
        {
          id,
          name,
          pricePaise,
          ...(category ? { category } : {}),
          ...(variant ? { variant } : {}),
        },
        {
          source: "pdp",
        },
      ),
    );
  }, [category, id, image, name, price, slug, variant]);

  return null;
}
