export const availabilityErrorMessages = {
  PRODUCT_RESERVED: "This piece has just been reserved.",
  PRODUCT_SOLD: "This saree has found its next home.",
  RESERVATION_CONFLICT: "This piece has just been reserved.",
  RESERVATION_EXPIRED: "Your reservation expired. Please add it again if still available.",
} as const;

export type AvailabilityErrorCode = keyof typeof availabilityErrorMessages;

export function isAvailabilityErrorCode(
  code: null | string | undefined
): code is AvailabilityErrorCode {
  return Boolean(code && code in availabilityErrorMessages);
}

export function getAvailabilityErrorMessage(
  code: null | string | undefined,
  fallback = "This piece is no longer available."
): string {
  if (isAvailabilityErrorCode(code)) return availabilityErrorMessages[code];
  return fallback;
}
