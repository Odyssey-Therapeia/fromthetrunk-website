import type { Metadata } from "next";

import { CartPageClient } from "@/components/cart/cart-page-client";
import { getFeaturedProducts, getProducts } from "@/lib/data/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Bag",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const featured = await getFeaturedProducts(3);
  const featuredPicks = featured.docs.length ? featured.docs : (await getProducts(3)).docs;

  return <CartPageClient featuredPicks={featuredPicks} />;
}
