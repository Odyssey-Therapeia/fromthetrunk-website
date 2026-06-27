export const CART_RESERVATION_MINUTES = 60;

const MIN_OVERRIDE_MINUTES = 1;
const MAX_OVERRIDE_MINUTES = 180;

const canUseReservationOverride = () =>
  process.env.NODE_ENV !== "production" ||
  process.env.VERCEL_ENV === "preview" ||
  process.env.VERCEL_ENV === "development" ||
  process.env.VITEST === "true";

export function getCartReservationMinutes(): number {
  if (!canUseReservationOverride()) return CART_RESERVATION_MINUTES;

  const raw = process.env.FTT_RESERVATION_MINUTES;
  if (!raw) return CART_RESERVATION_MINUTES;

  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_OVERRIDE_MINUTES ||
    parsed > MAX_OVERRIDE_MINUTES
  ) {
    return CART_RESERVATION_MINUTES;
  }

  return parsed;
}

export function getCartReservationExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + getCartReservationMinutes() * 60 * 1000);
}
