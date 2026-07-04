import {
  getOneOfOneConflictCopy,
  isOneOfOneConflictCode,
} from "@/lib/checkout/one-of-one-conflict-copy";

export const availabilityErrorMessages = {
  INVALID_PRODUCT_IDS: getOneOfOneConflictCopy("PRODUCT_UNAVAILABLE").message,
  PRODUCT_RESERVED: getOneOfOneConflictCopy("PRODUCT_RESERVED").message,
  PRODUCT_SOLD: getOneOfOneConflictCopy("PRODUCT_SOLD").message,
  PRODUCT_UNAVAILABLE: getOneOfOneConflictCopy("PRODUCT_UNAVAILABLE").message,
  RESERVATION_CONFLICT: getOneOfOneConflictCopy("PRODUCT_RESERVED").message,
  RESERVATION_EXPIRED: getOneOfOneConflictCopy("PRODUCT_UNAVAILABLE").message,
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
  if (isOneOfOneConflictCode(code)) {
    return getOneOfOneConflictCopy(code).message;
  }
  if (isAvailabilityErrorCode(code)) return availabilityErrorMessages[code];
  return fallback;
}
