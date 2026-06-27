import type { Metadata } from "next";

import { CartHeroShell } from "@/components/cart/cart-hero-shell";
import { CartPageClient } from "@/components/cart/cart-page-client";

export const metadata: Metadata = {
  title: "Shopping Bag",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  return (
    <main className="min-h-screen bg-[#FDF7F1] text-[#0E0D0E]">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
        <CartHeroShell />
        <CartPageClient
          embedded
          showHero={false}
          featuredPicks={[]}
        />
      </div>
    </main>
  );
}
