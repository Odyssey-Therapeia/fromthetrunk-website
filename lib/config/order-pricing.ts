/** GST rate for textile and apparel products in India. */
export const GST_RATE = 0.12;

/** Shipping cost tiers in INR. */
export const SHIPPING_TIERS = {
  /** Free shipping threshold in INR. */
  freeThreshold: 25000,
  standard: 500,
  express: 1200,
} as const;

export type ShippingMethod = "standard" | "express";
