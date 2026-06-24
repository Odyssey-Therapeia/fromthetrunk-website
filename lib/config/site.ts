export function getSiteOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL;
  if (url) return url.replace(/\/$/, "");  // strip trailing slash
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SERVER_URL is required in production");
  }
  return "https://www.fromthetrunk.shop";  // dev/test default (the actual canonical)
}

/** Digits-only WhatsApp number (country code + number, no "+"). */
export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919731910202"
).replace(/\D/g, "");

export const DEFAULT_WHATSAPP_MESSAGE =
  "Hi From the Trunk! I'd love some help with a piece.";

/** Build a wa.me deep link with an optional prefilled message. */
export const whatsappLink = (
  message: string = DEFAULT_WHATSAPP_MESSAGE,
): string =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
