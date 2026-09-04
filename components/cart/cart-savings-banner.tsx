import { BadgeIndianRupee, Check } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export type CartSurfaceVariant = "drawer" | "page";

/**
 * Product markdown savings, shown as a green card near the top of the cart.
 *
 * The amount is the difference between the original listed prices and the
 * current prices of the pieces in the bag — it deliberately excludes coupon
 * codes, shipping offers, and tax so nothing is counted twice against the
 * checkout discount line. Renders nothing when there is nothing to celebrate.
 */
export function CartSavingsBanner({
  savingsPaise,
  variant = "page",
  className,
}: {
  savingsPaise: number;
  variant?: CartSurfaceVariant;
  className?: string;
}) {
  if (!Number.isFinite(savingsPaise) || savingsPaise <= 0) return null;

  const isDrawer = variant === "drawer";

  return (
    <div
      data-ftt-cart-savings
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-[#1B7A4B]/30 bg-[#E7F5EC] text-[#0F5132]",
        isDrawer ? "p-3" : "p-4 sm:p-5",
        className,
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-[#1B7A4B]/14 text-[#0F5132]",
          isDrawer ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        {isDrawer ? (
          <Check className="h-4 w-4" aria-hidden="true" strokeWidth={2.6} />
        ) : (
          <BadgeIndianRupee className="h-5 w-5" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0">
        {/* The word "saving" carries the meaning, so the green is reinforcement
            rather than the only signal. */}
        <p
          className={cn(
            "font-semibold leading-snug",
            isDrawer ? "text-sm" : "text-base sm:text-lg",
          )}
        >
          You&rsquo;re saving {formatCurrency(savingsPaise / 100)} on this order
        </p>
        <p
          className={cn(
            "mt-1 leading-5 text-[#0F5132]/78",
            isDrawer ? "text-[11px]" : "text-xs sm:text-sm",
          )}
        >
          Compared with the original listed prices of the selected pieces.
        </p>
      </div>
    </div>
  );
}
