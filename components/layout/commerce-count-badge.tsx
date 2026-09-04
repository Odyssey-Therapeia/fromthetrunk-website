import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

/** Counts above this render as "99+" so the badge never outgrows the icon. */
const MAX_VISIBLE_COUNT = 99;

export function formatCommerceCount(count: number): string {
  return count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : String(count);
}

/**
 * The count bubble shared by the header cart and wishlist icons.
 *
 * Rendering rules that matter:
 *  - hidden entirely at zero (callers guard, this is the belt-and-braces);
 *  - aria-hidden — the accessible count lives in the control's own aria-label,
 *    so assistive tech reads "Open bag, 2 items" instead of a stray number;
 *  - z-10 + pointer-events-none so it paints above the icon without stealing
 *    the click from the button it decorates.
 */
export function CommerceCountBadge({
  count,
  className,
  ...rest
}: { count: number } & ComponentPropsWithoutRef<"span">) {
  if (count <= 0) return null;

  return (
    <span
      {...rest}
      className={cn(
        "pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full border border-[#B39152]/70 bg-[#141D46] px-1 text-[10px] font-semibold leading-none tabular-nums text-[#FDF7F1] shadow-[0_2px_6px_rgba(20,29,70,0.28)]",
        className,
      )}
      aria-hidden="true"
    >
      {formatCommerceCount(count)}
    </span>
  );
}
