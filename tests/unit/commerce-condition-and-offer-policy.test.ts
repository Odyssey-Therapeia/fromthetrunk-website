/**
 * SEO remediation pass 1 — finding B.
 *
 * Three defects are pinned here:
 *
 *  1. `itemCondition` was hardcoded to UsedCondition in Product JSON-LD and
 *     `condition` was hardcoded to "used" in the channel feeds, so a newly
 *     manufactured blouse was advertised as second-hand.
 *  2. The free-text `detailsCondition` field is a merchandising phrase, not a
 *     condition signal. Real catalogue values include "Pre-loved, quality
 *     checked", "Excellent", "Superior" and — on one live saree — "NEW", while
 *     the same document declared UsedCondition. Condition must therefore be
 *     resolved from the product's structural type, never from that string.
 *  3. Offers carried no shippingDetails and no hasMerchantReturnPolicy, so the
 *     real free shipping and the real 7-day return window were invisible to
 *     structured-data consumers.
 */

import { describe, expect, it } from "vitest";

import type { Product } from "@/types/domain";
import {
  RETURN_WINDOW_DAYS,
  SHIPPING_COUNTRY,
  currentShippingRateInr,
  merchantReturnPolicy,
  offerShippingDetails,
} from "@/lib/commerce/offer-policy";
import {
  SCHEMA_NEW_CONDITION,
  SCHEMA_USED_CONDITION,
  resolveCommerceCondition,
  resolveFeedCondition,
  resolveSchemaItemCondition,
} from "@/lib/commerce/product-condition";
import { productJsonLd } from "@/lib/seo/json-ld";

const baseProduct = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Kanjivaram Mayil",
  slug: "kanjivaram-mayil",
  pricePaise: 524900,
  stockStatus: "available" as const,
  storyNarrative: "A peacock-motif Kanjeevaram mix saree.",
  images: [],
  tags: [],
  typeSlug: null,
} as unknown as Product;

const productWith = (overrides: Record<string, unknown>) =>
  ({ ...baseProduct, ...overrides }) as unknown as Product;

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

describe("resolveCommerceCondition", () => {
  it("resolves a pre-loved saree to used", () => {
    const saree = productWith({ typeSlug: "saree" });
    expect(resolveCommerceCondition(saree)).toBe("used");
    expect(resolveSchemaItemCondition(saree)).toBe(SCHEMA_USED_CONDITION);
    expect(resolveFeedCondition(saree)).toBe("used");
  });

  it("resolves a product with no type at all to used (safe default)", () => {
    expect(resolveCommerceCondition(productWith({ typeSlug: null }))).toBe(
      "used",
    );
  });

  it("resolves an UNWORN but previously owned saree to used", () => {
    // The display phrase says "Unworn"; the product is still a sourced saree.
    const unworn = productWith({
      typeSlug: "saree",
      detailsCondition: "Unworn",
    });
    expect(resolveCommerceCondition(unworn)).toBe("used");
    expect(resolveSchemaItemCondition(unworn)).toBe(SCHEMA_USED_CONDITION);
  });

  it("resolves a newly manufactured blouse to new", () => {
    const blouse = productWith({
      typeSlug: "blouse",
      name: "White Sleeveless Rayon StretchFit Blouse",
    });
    expect(resolveCommerceCondition(blouse)).toBe("new");
    expect(resolveSchemaItemCondition(blouse)).toBe(SCHEMA_NEW_CONDITION);
    expect(resolveFeedCondition(blouse)).toBe("new");
  });

  it("ignores loose display phrases entirely (B.12)", () => {
    // Every one of these is a real or plausible merchandising phrase. None of
    // them may flip a saree to NewCondition.
    for (const phrase of [
      "NEW",
      "New arrival",
      "Unworn",
      "Quality checked",
      "Vintage",
      "Superior",
      "Excellent",
      "Pre-loved, quality checked",
    ]) {
      const saree = productWith({
        typeSlug: "saree",
        detailsCondition: phrase,
      });
      expect(resolveCommerceCondition(saree)).toBe("used");
    }
  });

  it("detects a blouse from tags when typeSlug is absent", () => {
    const tagged = productWith({
      typeSlug: null,
      tags: [{ name: "Blouse", slug: "blouse" }],
    });
    expect(resolveCommerceCondition(tagged)).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// Shipping schema
// ---------------------------------------------------------------------------

describe("offerShippingDetails", () => {
  const shipping = offerShippingDetails();

  it("is a well-formed OfferShippingDetails", () => {
    expect(shipping["@type"]).toBe("OfferShippingDetails");
  });

  it("ships only to India, matching the published policy", () => {
    const destination = shipping.shippingDestination as Record<string, unknown>;
    expect(destination["@type"]).toBe("DefinedRegion");
    expect(destination.addressCountry).toBe("IN");
    expect(SHIPPING_COUNTRY).toBe("IN");
  });

  it("derives the shipping rate from live pricing config, never a hardcoded claim", () => {
    const rate = shipping.shippingRate as Record<string, unknown>;
    expect(rate["@type"]).toBe("MonetaryAmount");
    expect(rate.currency).toBe("INR");
    // Follows ENABLE_SHIPPING_CHARGES: free when charges are off, the standard
    // tier when they are on. The suite runs with charges ON (vitest.config.ts),
    // so this asserts the derivation rather than a fixed number.
    expect(rate.value).toBe(currentShippingRateInr());
    expect(typeof rate.value).toBe("number");
    expect(rate.value as number).toBeGreaterThanOrEqual(0);
  });

  it("declares handling and transit times from the shipping policy", () => {
    const delivery = shipping.deliveryTime as Record<string, unknown>;
    const handling = delivery.handlingTime as Record<string, unknown>;
    const transit = delivery.transitTime as Record<string, unknown>;
    // "processed within 2–5 business days"
    expect(handling.minValue).toBe(2);
    expect(handling.maxValue).toBe(5);
    // metro 3–7, other Indian locations 5–10
    expect(transit.minValue).toBe(3);
    expect(transit.maxValue).toBe(10);
    expect(handling.unitCode).toBe("DAY");
    expect(transit.unitCode).toBe("DAY");
  });
});

// ---------------------------------------------------------------------------
// Return schema
// ---------------------------------------------------------------------------

describe("merchantReturnPolicy", () => {
  const policy = merchantReturnPolicy(
    "https://www.fromthetrunk.shop/policies/return-refund-policy",
  );

  it("is a well-formed MerchantReturnPolicy for India", () => {
    expect(policy["@type"]).toBe("MerchantReturnPolicy");
    expect(policy.applicableCountry).toBe("IN");
  });

  it("uses the real 7-day window", () => {
    expect(policy.merchantReturnDays).toBe(7);
    expect(RETURN_WINDOW_DAYS).toBe(7);
  });

  it("does NOT claim returns are forbidden, because qualifying returns are accepted", () => {
    expect(policy.returnPolicyCategory).not.toBe(
      "https://schema.org/MerchantReturnNotPermitted",
    );
    expect(policy.returnPolicyCategory).toBe(
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    );
  });

  it("links to the customer-facing policy that carries the eligibility limits", () => {
    expect(policy.merchantReturnLink).toContain(
      "/policies/return-refund-policy",
    );
  });

  it("links the FINAL policy URL, not a redirecting legacy alias", () => {
    // /return-policy 308s to /policies/return-refund-policy in next.config.ts.
    const link = String(policy.merchantReturnLink);
    expect(new URL(link).pathname).toBe("/policies/return-refund-policy");
    expect(link).not.toContain("//return-policy");
  });

  it("omits returnFees, because the published policy does not settle it", () => {
    // The shipping-charges clause says return postage "MAY be non-refundable
    // unless the return is due to our error, a wrong item, or an approved
    // significant misdescription" — but the eligibility list also admits
    // transit damage and a failed authentication promise, neither of which is
    // named in that carve-out. Claiming FreeReturn would assert a guarantee the
    // site does not make; claiming customer responsibility would contradict the
    // wrong-item case. This assertion exists so the field is not re-added
    // without a policy owner's decision.
    expect(policy).not.toHaveProperty("returnFees");
    expect(JSON.stringify(policy)).not.toContain("FreeReturn");
    expect(JSON.stringify(policy)).not.toContain(
      "ReturnFeesCustomerResponsibility",
    );
  });

  it("states a return method supported by the policy text", () => {
    // "we will share return-shipping instructions or arrange a pickup".
    expect(policy.returnMethod).toBe("https://schema.org/ReturnByMail");
  });
});

// ---------------------------------------------------------------------------
// Product JSON-LD integration
// ---------------------------------------------------------------------------

describe("productJsonLd offers", () => {
  const parse = (product: Product) =>
    JSON.parse(JSON.stringify(productJsonLd(product)));

  it("emits exactly one return policy, inside Offer", () => {
    const serialised = JSON.stringify(productJsonLd(productWith({ typeSlug: "saree" })));
    expect(serialised.split('"hasMerchantReturnPolicy"').length - 1).toBe(1);
    expect(serialised.split('"MerchantReturnPolicy"').length - 1).toBe(1);
    expect(serialised.split('"shippingDetails"').length - 1).toBe(1);
  });

  it("emits shipping and return policy inside Offer, not on Product", () => {
    const parsed = parse(productWith({ typeSlug: "saree" }));
    expect(parsed.offers.shippingDetails["@type"]).toBe(
      "OfferShippingDetails",
    );
    expect(parsed.offers.hasMerchantReturnPolicy["@type"]).toBe(
      "MerchantReturnPolicy",
    );
    expect(parsed.shippingDetails).toBeUndefined();
    expect(parsed.hasMerchantReturnPolicy).toBeUndefined();
  });

  it("emits exactly one condition value, at Product level only", () => {
    for (const product of [
      productWith({ typeSlug: "saree" }),
      productWith({ typeSlug: "blouse" }),
      productWith({ typeSlug: null }),
    ]) {
      const serialised = JSON.stringify(productJsonLd(product));
      const parsed = JSON.parse(serialised);

      // Exactly one itemCondition key in the whole document.
      const occurrences = serialised.split('"itemCondition"').length - 1;
      expect(occurrences).toBe(1);

      // And it is one of the two allowed values, never both.
      expect([SCHEMA_NEW_CONDITION, SCHEMA_USED_CONDITION]).toContain(
        parsed.itemCondition,
      );
      expect(serialised).not.toContain(
        `${SCHEMA_NEW_CONDITION}","itemCondition`,
      );
      const hasNew = serialised.includes(SCHEMA_NEW_CONDITION);
      const hasUsed = serialised.includes(SCHEMA_USED_CONDITION);
      expect(hasNew && hasUsed).toBe(false);
    }
  });

  it("marks a blouse as NewCondition end-to-end", () => {
    const parsed = parse(productWith({ typeSlug: "blouse" }));
    expect(parsed.itemCondition).toBe(SCHEMA_NEW_CONDITION);
  });

  it("marks a saree as UsedCondition end-to-end even when detailsCondition says NEW", () => {
    const parsed = parse(
      productWith({ typeSlug: "saree", detailsCondition: "NEW" }),
    );
    expect(parsed.itemCondition).toBe(SCHEMA_USED_CONDITION);
  });

  it("keeps shipping and return data on a sold-out product, with one condition", () => {
    const sold = productWith({ typeSlug: "saree", stockStatus: "sold" });
    const parsed = parse(sold);

    expect(parsed.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(parsed.offers.shippingDetails["@type"]).toBe(
      "OfferShippingDetails",
    );
    expect(parsed.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
    expect(parsed.itemCondition).toBe(SCHEMA_USED_CONDITION);
  });

  it("keeps a reserved product on LimitedAvailability", () => {
    const reserved = productWith({
      typeSlug: "saree",
      stockStatus: "reserved",
    });
    expect(parse(reserved).offers.availability).toBe(
      "https://schema.org/LimitedAvailability",
    );
  });
});
