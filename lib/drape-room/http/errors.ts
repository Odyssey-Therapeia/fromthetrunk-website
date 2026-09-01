export const TRYON_PUBLIC_ERROR_CODES = [
  "TRYON_DISABLED",
  "TRYON_CONFIGURATION_INVALID",
  "TRYON_SESSION_REQUIRED",
  "TRYON_FORBIDDEN_ORIGIN",
  "PHOTO_REQUIRED",
  "PHOTO_INVALID",
  "PHOTO_TOO_LARGE",
  "CONSENT_REQUIRED",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_NOT_ELIGIBLE",
  "REFERENCE_UNAVAILABLE",
  "TRYON_RATE_LIMITED",
  "TRYON_PRODUCT_DAILY_LIMIT",
  "TRYON_ALREADY_PROCESSING",
  "TRYON_ALREADY_COMPLETED",
  "TRYON_BUDGET_PAUSED",
  "PROVIDER_REJECTED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "OUTPUT_INVALID",
  "LOCAL_STORAGE_UNAVAILABLE",
  "UNKNOWN",
] as const;

export type TryonPublicErrorCode = (typeof TRYON_PUBLIC_ERROR_CODES)[number];

const PUBLIC_MESSAGES: Record<TryonPublicErrorCode, string> = {
  TRYON_DISABLED: "The Drape Room is not available yet.",
  TRYON_CONFIGURATION_INVALID: "The Drape Room is temporarily unavailable.",
  TRYON_SESSION_REQUIRED: "Please refresh the page before creating a drape.",
  TRYON_FORBIDDEN_ORIGIN: "This Drape Room request was not allowed.",
  PHOTO_REQUIRED: "Add your photo before creating a drape.",
  PHOTO_INVALID: "That photo could not be used. Try a clear JPG photo.",
  PHOTO_TOO_LARGE: "That photo is too large. Please choose another photo.",
  CONSENT_REQUIRED: "Confirm the current photo-processing disclosure first.",
  PRODUCT_NOT_FOUND: "We could not find that saree.",
  PRODUCT_UNAVAILABLE: "That one-of-one saree is no longer available.",
  PRODUCT_NOT_ELIGIBLE: "That product is not eligible for the Drape Room.",
  REFERENCE_UNAVAILABLE: "That saree's approved reference is unavailable.",
  TRYON_RATE_LIMITED: "Please wait before creating another drape.",
  TRYON_PRODUCT_DAILY_LIMIT:
    "You have used today’s three previews for this saree. Your saved images remain available, and you can create more after midnight.",
  TRYON_ALREADY_PROCESSING: "A drape is already being created for this browser.",
  TRYON_ALREADY_COMPLETED:
    "This request already completed, but no server copy is kept to replay. Check your local previews before creating another.",
  TRYON_BUDGET_PAUSED: "The Drape Room has reached its current studio limit.",
  PROVIDER_REJECTED: "The AI provider could not use that photo.",
  PROVIDER_TIMEOUT:
    "The provider did not finish in time. We did not retry automatically, so you are not silently charged for another attempt.",
  PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable.",
  OUTPUT_INVALID: "The generated preview could not be verified.",
  LOCAL_STORAGE_UNAVAILABLE:
    "This browser cannot keep try-on images locally right now.",
  UNKNOWN: "We could not create this drape. Please try again later.",
};

export function tryonErrorResponse(
  code: TryonPublicErrorCode,
  status: number,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));

  return Response.json(
    { code, message: PUBLIC_MESSAGES[code] },
    {
      status,
      headers: responseHeaders,
    },
  );
}
