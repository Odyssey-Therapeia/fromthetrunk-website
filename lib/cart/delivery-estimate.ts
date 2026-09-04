/**
 * The single source of truth for the delivery promise shown across commerce
 * surfaces: cart drawer, full cart page, and the checkout order summary.
 *
 * This is an ESTIMATE, not a guarantee, and it is business copy — do not change
 * the wording or the window without explicit business approval, and do not add
 * postcode-, courier-, or stock-aware timing here.
 */
export const CART_DELIVERY_ESTIMATE = {
  title: "Estimated delivery",
  shortLabel: "7–10 days",
  description: "Your order will be delivered in 7 to 10 days.",
} as const;

export type CartDeliveryEstimate = typeof CART_DELIVERY_ESTIMATE;
