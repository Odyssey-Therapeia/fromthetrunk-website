"use client";

import { toast } from "sonner";

import { CART_RESERVATION_MINUTES } from "@/lib/cart/reservation-policy";

/**
 * The add-to-cart confirmation shown on every buying surface.
 *
 * Pieces are one-of-one, so adding to the bag places a real server-side hold
 * that lapses. The shopper has to be told that plainly at the moment they add,
 * or the piece can quietly leave the bag with no explanation.
 *
 * The window is read from CART_RESERVATION_MINUTES rather than written out, so
 * the copy can never drift from the policy that actually releases the hold.
 */

function formatHoldWindow(minutes: number): string {
  if (minutes === 60) return "one hour";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hours`;
  }
  return `${minutes} minutes`;
}

/** e.g. "one hour" — the shopper-facing name for the reservation window. */
export const CART_HOLD_WINDOW_LABEL = formatHoldWindow(CART_RESERVATION_MINUTES);

export function showAddedToCartToast({
  title,
  noun = "saree",
}: {
  title: string;
  /** "saree" reads wrong on a blouse; callers pass the right word. */
  noun?: string;
}) {
  toast.success(title, {
    description: (
      <>
        This {noun} will stay in your cart for the next{" "}
        <strong>{CART_HOLD_WINDOW_LABEL}</strong>, so please complete your
        purchase before it leaves your bag.
      </>
    ),
    duration: 7000,
  });
}
