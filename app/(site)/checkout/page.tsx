import type { Metadata } from "next";

import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { CheckoutPageClient } from "@/components/checkout/checkout-page-client";
import { CUSTOMER_NOINDEX_FOLLOW_ROBOTS } from "@/lib/seo/route-metadata";

export const metadata: Metadata = {
  title: "Checkout",
  robots: CUSTOMER_NOINDEX_FOLLOW_ROBOTS,
};

export default async function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-7xl grow px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
      <CheckoutShell />
      <CheckoutPageClient embedded featuredPicks={[]} />
    </main>
  );
}
