"use client";

import { formatCurrency } from "@/lib/formatters";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";

export function CartHeroStats() {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const { subtotal, totalItems } = getCartTotals(items);

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      <CartHeroStat label="Pieces">
        {hasHydrated ? totalItems : "-"}
      </CartHeroStat>
      <CartHeroStat label="Subtotal">
        {hasHydrated ? formatCurrency(subtotal) : "-"}
      </CartHeroStat>
      <CartHeroStat label="Promise">Verified</CartHeroStat>
    </div>
  );
}

function CartHeroStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/9 p-4 backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[#FDF7F1]/55">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl text-[#FDF7F1]">{children}</p>
    </div>
  );
}
