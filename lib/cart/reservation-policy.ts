export const CART_RESERVATION_MINUTES = 60;

/**
 * A payment link may use at most fifteen minutes of the cart's original
 * window. It never extends that original cart deadline.
 *
 * Fifteen, not ten, because Razorpay refuses a Payment Link whose expire_by is
 * less than 15 minutes away. A shorter database hold would mean releasing a
 * saree while its link was still payable for several more minutes. The
 * provider link still carries a one-minute latency margin on top of this
 * (lib/payments/razorpay.ts); reconciliation cancels a link that is still open
 * once this deadline has passed, so that last minute is never payable against
 * a released piece.
 */
export const PAYMENT_LINK_HOLD_MINUTES = 15;

const MINUTE_MS = 60 * 1000;

/** The cart lifetime is fixed in every environment. */
export function getCartReservationMinutes(): number {
  return CART_RESERVATION_MINUTES;
}

/** The immutable deadline for a cart line: its original add time plus one hour. */
export function getCartReservationExpiresAt(addedAt = new Date()): Date {
  return new Date(addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS);
}

/**
 * One common payment deadline, capped by every participating cart line.
 * Made-to-order carts without a stock hold use the full payment window.
 */
export function getPaymentLinkDeadline({
  cartDeadlines,
  paymentStartedAt,
}: {
  cartDeadlines: Date[];
  paymentStartedAt: Date;
}): Date {
  const paymentWindowDeadline = new Date(
    paymentStartedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
  );
  const earliestCartDeadline = cartDeadlines.reduce<Date | null>(
    (earliest, deadline) =>
      earliest == null || deadline < earliest ? deadline : earliest,
    null,
  );

  return earliestCartDeadline != null && earliestCartDeadline < paymentWindowDeadline
    ? new Date(earliestCartDeadline)
    : paymentWindowDeadline;
}

/**
 * Razorpay receives whole Unix seconds. A deadline that rounds down to the
 * current second is already unusable. This is the database hold; Razorpay's
 * 15-minute expire_by minimum is applied only to the provider link, in
 * lib/payments/razorpay.ts.
 */
export function isPaymentLinkDeadlineUsable(
  deadline: Date,
  now = new Date(),
): boolean {
  return (
    Number.isFinite(deadline.getTime()) &&
    Math.floor(deadline.getTime() / 1000) > Math.floor(now.getTime() / 1000)
  );
}
