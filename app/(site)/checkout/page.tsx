import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutPageClient } from "@/components/checkout/checkout-page-client";
import { getServerAuthSession } from "@/lib/auth/get-session";
import { getFeaturedProducts, getProducts } from "@/lib/data/products";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  // Account gate: guests must sign in (or register) before checkout, and are
  // returned here afterwards via callbackUrl.
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect(`/account/sign-in?callbackUrl=${encodeURIComponent("/checkout")}`);
  }

  const featured = await getFeaturedProducts(3);
  const docs = featured.docs.length ? featured.docs : (await getProducts(3)).docs;

  return <CheckoutPageClient featuredPicks={docs as Product[]} />;
}
