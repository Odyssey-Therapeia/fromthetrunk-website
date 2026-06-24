/**
 * Inventory compatibility helpers.
 *
 * The products row remains the canonical public source while checkout still
 * claims one-of-one pieces through an atomic products.stock_status update. The
 * quantity_available + reservations helpers are kept for compatibility checks
 * until the v2 reservation service becomes the only write authority.
 *
 * No database I/O — intentionally pure so it can be unit-tested without mocks.
 */

export type StockStatus = "available" | "reserved" | "sold";

export interface InventoryState {
  /** products.quantity_available — the new v2 column */
  quantityAvailable: number;
  /** count of non-expired rows in the reservations table for this product */
  activeReservationsCount: number;
}

export interface ProductRowStockState {
  reservedUntil: Date | null;
  stockStatus: StockStatus;
}

/**
 * Resolve public availability from the canonical product row.
 *
 * An expired reservation is treated as available for reads; cleanup jobs still
 * clear the row later. A reserved row with no expiry is conservatively reserved.
 */
export function resolveProductRowStockStatus(
  { reservedUntil, stockStatus }: ProductRowStockState,
  now = new Date(),
): StockStatus {
  if (stockStatus === "sold") return "sold";
  if (stockStatus === "reserved") {
    if (!reservedUntil || reservedUntil > now) return "reserved";
    return "available";
  }
  return "available";
}

/**
 * Derive a stockStatus value from inventory v2 state.
 *
 * Rules (one-of-one model):
 *   - qty = 0                      → "sold"  (physically gone, reservations irrelevant)
 *   - qty >= 1 and reservations > 0 → "reserved"  (someone holds it)
 *   - qty >= 1 and reservations = 0 → "available"
 *
 * This function is not the public source of truth while products.stock_status
 * remains the checkout/PDP authority; use resolveProductRowStockStatus() for
 * current storefront reads.
 */
export function deriveStockStatus({
  quantityAvailable,
  activeReservationsCount,
}: InventoryState): StockStatus {
  if (quantityAvailable <= 0) {
    return "sold";
  }
  if (activeReservationsCount > 0) {
    return "reserved";
  }
  return "available";
}
