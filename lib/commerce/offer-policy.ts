import { ENABLE_SHIPPING_CHARGES, SHIPPING_TIERS } from "@/lib/config/order-pricing";

/**
 * Structured-data representations of the SHIPPING and RETURN policies actually
 * published on the site and actually applied at checkout.
 *
 * Every value below is either read from the live pricing configuration or taken
 * verbatim from `lib/legal/policies.ts`. Nothing here is aspirational: if the
 * checkout starts charging for shipping, `shippingRate` follows automatically.
 *
 * Sources:
 *  - Shipping & Delivery Policy (`shipping-delivery-policy`)
 *      · "We currently ship across PAN India only. International shipping is
 *         not available."            → shippingDestination = IN, no other region
 *      · "Orders are usually processed within 2–5 business days"
 *                                     → handlingTime 2–5
 *      · "Metro cities in India: 3–7 business days after dispatch."
 *        "Other Indian locations: 5–10 business days after dispatch."
 *                                     → transitTime 3–10
 *  - lib/config/order-pricing.ts
 *      · ENABLE_SHIPPING_CHARGES === false → every order ships free today.
 *  - Return, Refund & Exchange Policy (`return-refund-policy`)
 *      · "You may request a return within 7 days of delivery"
 *                                     → merchantReturnDays = 7
 *      · Returns are accepted for misdescription, wrong item, undisclosed major
 *        defect, transit damage, or a failed authentication/condition promise —
 *        so returns ARE permitted and MerchantReturnNotPermitted would be wrong.
 *      · Return shipping is UNRESOLVED — see `returnFees` note below.
 */

/** ISO 3166-1 alpha-2 for the only country the store ships to. */
export const SHIPPING_COUNTRY = "IN" as const;

/** Return window in days, from the published Return & Refund policy. */
export const RETURN_WINDOW_DAYS = 7;

/**
 * The shipping rate a customer is charged today, in rupees.
 *
 * Derived from the same flag the checkout estimate and the server-side
 * Razorpay total use, so the schema cannot drift from the amount charged.
 */
export function currentShippingRateInr(): number {
  return ENABLE_SHIPPING_CHARGES ? SHIPPING_TIERS.standard : 0;
}

/**
 * `Offer.shippingDetails` for an India-only store.
 */
export function offerShippingDetails(): Record<string, unknown> {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: currentShippingRateInr(),
      currency: "INR",
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: SHIPPING_COUNTRY,
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 2,
        maxValue: 5,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: 3,
        maxValue: 10,
        unitCode: "DAY",
      },
    },
  };
}

/**
 * `Offer.hasMerchantReturnPolicy`.
 *
 * This is a RESTRICTED policy: there is a finite window, but it covers only
 * seller-fault reasons (misdescription, wrong item, undisclosed defect, transit
 * damage, failed authentication). It is deliberately NOT
 * MerchantReturnNotPermitted, because qualifying returns are accepted.
 *
 * `returnPolicyCategory` uses the finite-window value because that is the only
 * schema.org category that expresses "returns accepted, within N days"; the
 * eligibility restriction itself is carried in the customer-facing policy page
 * linked via `merchantReturnLink`.
 *
 * `returnFees` is DELIBERATELY OMITTED — do not add it without a policy owner's
 * decision. The published wording is:
 *
 *   "Original shipping, premium packaging, international shipping, customs
 *    duties, taxes, and return-shipping charges MAY be non-refundable unless the
 *    return is due to our error, a wrong item, or an approved significant
 *    misdescription."
 *
 * That does not cover every eligible return. The eligibility list also admits
 * "the item was damaged in transit" and "the product fails our stated
 * authentication or condition promise", neither of which is named in the
 * free-return carve-out, and the sentence is hedged with "may" throughout. So
 * the site does not actually state that every qualifying return is free to the
 * customer. Emitting FreeReturn would assert a refund guarantee the policy does
 * not make; emitting ReturnFeesCustomerResponsibility would contradict the
 * wrong-item case. Omission is the only claim the source text supports.
 */
export function merchantReturnPolicy(
  returnPolicyUrl: string,
): Record<string, unknown> {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: SHIPPING_COUNTRY,
    returnPolicyCategory:
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    // returnFees intentionally absent — see the note above. Unsupported by the
    // published policy in either direction.
    merchantReturnLink: returnPolicyUrl,
  };
}
