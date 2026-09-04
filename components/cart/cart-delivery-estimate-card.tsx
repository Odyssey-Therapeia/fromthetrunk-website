import { Truck } from "lucide-react";

import type { CartSurfaceVariant } from "@/components/cart/cart-savings-banner";
import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate";
import { cn } from "@/lib/utils";

/**
 * The shared delivery promise card for a non-empty cart.
 *
 * Copy comes from CART_DELIVERY_ESTIMATE so the drawer, the cart page, and the
 * checkout order summary can never drift apart. This is intentionally separate
 * from shipping price, reservation holds, and returns — it only answers "when
 * will it arrive?".
 */
export function CartDeliveryEstimateCard({
  variant = "page",
  className,
}: {
  variant?: CartSurfaceVariant;
  className?: string;
}) {
  const isDrawer = variant === "drawer";

  return (
    <div
      data-ftt-cart-delivery
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-[#E7DDD4] bg-[#FFFCF8]",
        isDrawer ? "p-3" : "p-4 sm:p-5",
        className,
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-[#B39152]/14 text-[#601D1C]",
          isDrawer ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <Truck className={isDrawer ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.18em] text-[#74531B]",
            isDrawer ? "text-[10px]" : "text-[11px]",
          )}
        >
          {CART_DELIVERY_ESTIMATE.title}
        </p>
        <p
          className={cn(
            "mt-1 font-serif leading-none text-[#141D46]",
            isDrawer ? "text-xl" : "text-2xl",
          )}
        >
          {CART_DELIVERY_ESTIMATE.shortLabel}
        </p>
        <p
          className={cn(
            "mt-1.5 leading-5 text-[#6B625B]",
            isDrawer ? "text-[11px]" : "text-xs sm:text-sm",
          )}
        >
          {CART_DELIVERY_ESTIMATE.description}
        </p>
      </div>
    </div>
  );
}
