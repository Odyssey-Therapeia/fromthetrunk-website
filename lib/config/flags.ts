/**
 * Feature flags for From the Trunk.
 *
 * All flags default to OFF so that the codebase can be shipped to production
 * safely without any behavioural change. Each flag is activated by setting its
 * environment variable to the string "true".
 */

/**
 * When true, pricePaise values are treated as GST-INCLUSIVE all-in prices.
 * The GST component is back-calculated for display: round(price × rate / (1 + rate)).
 * Total = subtotal + shippingCost (no GST added on top).
 *
 * When false (default), pricePaise is GST-EXCLUSIVE and calculateOrderTotals
 * adds GST on top: taxAmount = round(subtotal × rate); total = subtotal + shipping + tax.
 *
 * Flip this flag only after the corresponding product-data migration is complete.
 */
export function isGstInclusive(): boolean {
  return process.env.FTT_FEATURE_GST_INCLUSIVE === "true";
}
