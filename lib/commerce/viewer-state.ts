/**
 * What one saree should offer one shopper, decided on the server.
 *
 * The browser used to infer this by comparing a localStorage timestamp against
 * live stock, which let a card's badge and its own button disagree — "Reserved"
 * stamped over "In your bag" on the same card. The server holds both facts, so
 * it decides once and every surface renders the answer. No cart row on the
 * client may override it.
 *
 * Pure and synchronous: rows in, verdicts out, nothing to mock.
 */

import { verifyReservationToken } from "@/lib/cart/reservation-token";

/** Authoritative states. The client adds its own transient ones on top. */
export type ViewerProductState =
  | "available"
  | "in_my_cart"
  | "payment_pending"
  | "reserved_by_other"
  | "sold";

/**
 * A safe client-only placeholder while no valid server verdict is available.
 * It is deliberately not part of `ViewerProductState`: the server never owns
 * a "checking" inventory state and the client may not treat it as available.
 */
export type ViewerProductDisplayState = ViewerProductState | "checking";

export type ViewerStateVerdict = {
  reservedUntil: null | string;
  state: ViewerProductState;
};

/**
 * The most product ids one viewer-state request may ask about. The poller
 * sends one request per cycle, so a full collection page plus its rails,
 * Drape entries and bag lines must fit; anything past it reads as checking.
 */
export const MAX_VIEWER_STATE_IDS = 200;

const VIEWER_PRODUCT_STATES = new Set<ViewerProductState>([
  "available",
  "in_my_cart",
  "payment_pending",
  "reserved_by_other",
  "sold",
]);

/** Parse an untrusted API value without manufacturing availability. */
export function readViewerProductState(value: unknown): ViewerProductState | null {
  return VIEWER_PRODUCT_STATES.has(value as ViewerProductState)
    ? (value as ViewerProductState)
    : null;
}

export type ViewerStateInput = {
  cartReservationToken: null | string;
  cartReservedUntil: Date | null;
  /** This viewer's live bag row status, or null when they have no row. */
  cartStatus: null | string;
  /** A pending order of this viewer reserves the product at its exact expiry. */
  hasPendingPayment: boolean;
  /**
   * A made-to-order blouse line in this viewer's bag. It never carries a hold,
   * so there is no expiry to compare; the line itself is the answer.
   */
  madeToOrderInBag: boolean;
  /** The request-time sweep found an exact pending order for this product. */
  paymentProtected?: boolean;
  productId: string;
  reservedUntil: Date | null;
  stockStatus: string;
};

export function resolveViewerState(
  row: ViewerStateInput,
  now = new Date(),
): ViewerStateVerdict {
  if (row.stockStatus === "sold") {
    return { reservedUntil: null, state: "sold" };
  }

  if (row.madeToOrderInBag) {
    return { reservedUntil: null, state: "in_my_cart" };
  }

  /*
   * Only the exact current payment hold is this viewer's payment: their
   * pending order at the product's expiry AND their own bag row moved into
   * payment at that same instant. A leftover pending order, or a row that
   * merely says payment_pending, proves nothing on its own.
   */
  const ownsPaymentHold =
    row.hasPendingPayment &&
    row.cartStatus === "payment_pending" &&
    row.cartReservedUntil != null &&
    row.reservedUntil != null &&
    row.cartReservedUntil.getTime() === row.reservedUntil.getTime();

  /*
   * The route just attempted its ordinary expiry sweep. If the database still
   * protects this row because an exact pending order exists, the local clock
   * cannot make it available. Only provider-aware reconciliation resolves it.
   */
  if (row.paymentProtected) {
    return {
      reservedUntil: row.reservedUntil?.toISOString() ?? null,
      state: ownsPaymentHold ? "payment_pending" : "reserved_by_other",
    };
  }

  /*
   * A hold whose window has passed is not a hold. Reading it that way here
   * means a saree comes back the moment anyone looks at it, whether or not the
   * cleanup job has run — correctness never waits for a scheduler.
   */
  const holdIsLive =
    row.stockStatus === "reserved" &&
    row.reservedUntil != null &&
    row.reservedUntil > now;

  if (!holdIsLive) {
    return { reservedUntil: null, state: "available" };
  }

  const reservedUntil = row.reservedUntil!.toISOString();

  if (ownsPaymentHold) {
    return { reservedUntil, state: "payment_pending" };
  }

  /* Theirs only when the signature, product id and all three copies of the
   * expiry agree exactly. An older valid token for the same saree is not proof
   * of a newer hold. */
  const verifiedToken = verifyReservationToken(row.cartReservationToken);
  const ownsHold =
    row.cartReservedUntil != null &&
    row.cartReservedUntil.getTime() === row.reservedUntil!.getTime() &&
    verifiedToken?.productId === row.productId &&
    verifiedToken.reservedUntil.getTime() === row.cartReservedUntil.getTime();

  if (ownsHold) {
    return { reservedUntil, state: "in_my_cart" };
  }

  return { reservedUntil, state: "reserved_by_other" };
}

export function resolveViewerStates(
  rows: ViewerStateInput[],
  now = new Date(),
): Record<string, ViewerStateVerdict> {
  const verdicts: Record<string, ViewerStateVerdict> = {};
  for (const row of rows) {
    verdicts[row.productId] = resolveViewerState(row, now);
  }
  return verdicts;
}
