/**
 * What this particular shopper should be offered for this particular saree.
 *
 * The database owns availability, the signed reservation owns identity, and
 * local storage owns browser continuity. This is the one place those three are
 * read together, so a card, a bag row and the checkout can never disagree
 * about the same piece.
 *
 * Pure and synchronous on purpose: it takes a snapshot and returns a verdict,
 * with no fetching, no clock of its own, and nothing to mock in a test.
 */

export type ProductStockStatus = "available" | "reserved" | "sold";

export type ViewerAvailability =
  | { kind: "available" }
  | { kind: "held-by-me"; expiresAt: null | string }
  | { kind: "held-by-other"; expiresAt: null | string }
  | { kind: "releasing" }
  | { kind: "sold" };

export type ViewerAvailabilityInput = {
  /** Live status from the database. */
  publicStockStatus: ProductStockStatus;
  /** Live reservation expiry from the database, when held. */
  publicReservedUntil?: null | string;
  /** This browser's bag line for the product, if it has one. */
  localCartItem?: null | {
    reservedUntil?: null | string;
  };
  /** True while this browser's release is in flight. */
  releasePending?: boolean;
  now?: Date;
};

/**
 * Two timestamps describe the same hold if they agree to the second.
 *
 * The server proves ownership the same way when releasing, so a browser whose
 * timestamp has drifted is not the holder as far as anything else is
 * concerned either.
 */
const RESERVATION_MATCH_TOLERANCE_MS = 1_000;

const sameReservation = (
  publicReservedUntil: null | string | undefined,
  localReservedUntil: null | string | undefined,
): boolean => {
  if (!publicReservedUntil || !localReservedUntil) return false;

  const live = new Date(publicReservedUntil).getTime();
  const mine = new Date(localReservedUntil).getTime();
  if (Number.isNaN(live) || Number.isNaN(mine)) return false;

  return Math.abs(live - mine) < RESERVATION_MATCH_TOLERANCE_MS;
};

export function resolveViewerAvailability({
  localCartItem,
  now = new Date(),
  publicReservedUntil = null,
  publicStockStatus,
  releasePending = false,
}: ViewerAvailabilityInput): ViewerAvailability {
  // Handing the hold back is a state of its own. Offering the saree again
  // mid-release is what let a shopper race their own removal.
  if (releasePending) return { kind: "releasing" };

  if (publicStockStatus === "sold") return { kind: "sold" };

  const holdExpiry = publicReservedUntil ? new Date(publicReservedUntil) : null;
  const holdIsLive =
    publicStockStatus === "reserved" &&
    holdExpiry != null &&
    !Number.isNaN(holdExpiry.getTime()) &&
    holdExpiry > now;

  if (!holdIsLive) {
    /*
     * No live hold. A bag line still means "in your bag" — made-to-order
     * blouses are never reserved, and a saree whose hold lapsed is still the
     * piece this shopper was looking at.
     */
    return localCartItem ? { kind: "held-by-me", expiresAt: null } : { kind: "available" };
  }

  if (localCartItem && sameReservation(publicReservedUntil, localCartItem.reservedUntil)) {
    return { kind: "held-by-me", expiresAt: publicReservedUntil };
  }

  // Held, and not by this browser — including the case where it sits in this
  // bag under a stale timestamp, because someone else owns it now.
  return { kind: "held-by-other", expiresAt: publicReservedUntil };
}

/** True when this shopper may put the piece in their bag right now. */
export const canAddToBag = (availability: ViewerAvailability): boolean =>
  availability.kind === "available";

/**
 * True when the piece is out of reach for this shopper but may return —
 * someone else's hold can lapse, where a sold piece is gone for good.
 */
export const canAwaitReturn = (availability: ViewerAvailability): boolean =>
  availability.kind === "held-by-other";
