/**
 * Shared cart money math.
 *
 * All arithmetic runs on integer paise so a markdown total never drifts through
 * unrounded floating-point rupee addition. `price` on a cart line is the rupee
 * value the customer is charged (pricePaise / 100); `originalPricePaise` is the
 * catalogue's pre-markdown listing price and is optional — carts persisted
 * before this field existed simply contribute zero savings.
 *
 * Scope: PRODUCT MARKDOWN ONLY. Coupon codes, shipping offers, payment offers,
 * tax and loyalty are deliberately excluded so nothing is double-counted
 * against the checkout discount line.
 */

/** The minimum line shape this module needs — structurally satisfied by CartItem. */
export interface CartTotalsLine {
  price: number;
  quantity: number;
  originalPricePaise?: null | number;
}

export interface CartTotals {
  totalItems: number;
  subtotalPaise: number;
  originalSubtotalPaise: number;
  savingsPaise: number;
}

const toPositiveInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

/**
 * The original price a surface should strike through, or null when there is no
 * genuine markdown to advertise.
 *
 * A catalogue row can carry an "original" price that is missing, zero, or —
 * through a data-entry slip — LOWER than what the piece actually sells for.
 * None of those is a discount. Display code and savings math both go through
 * this, so the struck-through price on a card, on the PDP, and the cart savings
 * banner always tell the same story.
 */
export function getDisplayOriginalPricePaise(
  pricePaise: number,
  originalPricePaise: null | number | undefined,
): number | null {
  if (typeof pricePaise !== "number" || !Number.isFinite(pricePaise)) return null;
  if (
    typeof originalPricePaise !== "number" ||
    !Number.isFinite(originalPricePaise)
  ) {
    return null;
  }

  return originalPricePaise > pricePaise ? originalPricePaise : null;
}

/** Current charged unit price of a line, in paise. */
export function getUnitPricePaise(line: CartTotalsLine): number {
  return toPositiveInteger(line.price * 100);
}

/**
 * Pre-markdown unit price, in paise. Falls back to the current price when the
 * original is missing, invalid, or not actually higher — so savings can never
 * be negative or invented.
 */
export function getOriginalUnitPricePaise(line: CartTotalsLine): number {
  const currentUnitPricePaise = getUnitPricePaise(line);
  const originalUnitPricePaise = toPositiveInteger(line.originalPricePaise);

  return originalUnitPricePaise > currentUnitPricePaise
    ? originalUnitPricePaise
    : currentUnitPricePaise;
}

/** Markdown saved on one cart line, in paise. Clamped at zero. */
export function getLineSavingsPaise(line: CartTotalsLine): number {
  const quantity = toPositiveInteger(line.quantity);
  if (quantity === 0) return 0;

  return (
    Math.max(0, getOriginalUnitPricePaise(line) - getUnitPricePaise(line)) *
    quantity
  );
}

/** Integer-paise totals for a cart. Pure — safe to call during render. */
export function getCartTotalsPaise(lines: CartTotalsLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (totals, line) => {
      const quantity = toPositiveInteger(line.quantity);

      totals.totalItems += quantity;
      totals.subtotalPaise += getUnitPricePaise(line) * quantity;
      totals.originalSubtotalPaise += getOriginalUnitPricePaise(line) * quantity;
      totals.savingsPaise += getLineSavingsPaise(line);

      return totals;
    },
    {
      totalItems: 0,
      subtotalPaise: 0,
      originalSubtotalPaise: 0,
      savingsPaise: 0,
    },
  );
}
