import { isBlouseProduct } from "@/lib/products/product-type";

/**
 * THE canonical commerce-condition resolver.
 *
 * Every commerce surface that has to state a product's condition — Product
 * JSON-LD, the Google Merchant feed, the Meta catalogue feed — must resolve it
 * here so the same product can never be advertised as both new and used.
 *
 * The decision is made from the product's STRUCTURAL type (`typeSlug`, resolved
 * from the productTypes taxonomy), never from display copy. Free-text fields
 * such as `detailsCondition` are merchandising phrases — real catalogue values
 * include "Pre-loved, quality checked", "Excellent", "Superior" and, on at
 * least one saree, "NEW" — so they cannot be trusted to decide whether an item
 * is new or second-hand.
 */

/** Schema.org condition enum values, as emitted in JSON-LD. */
export const SCHEMA_NEW_CONDITION = "https://schema.org/NewCondition" as const;
export const SCHEMA_USED_CONDITION = "https://schema.org/UsedCondition" as const;

/** Google/Meta product-feed condition values. */
export type FeedCondition = "new" | "used";

export type CommerceCondition = "new" | "used";

export type CommerceConditionSource = {
  tags?: Array<{ name?: null | string; slug?: null | string }>;
  typeSlug?: null | string;
};

/**
 * Product types that are manufactured and sold new rather than sourced
 * second-hand. Sarees — the default and the core of the catalogue — are always
 * pre-loved. Blouses are stocked new to pair with them.
 *
 * Add a slug here only when that product type is genuinely sold new.
 */
const NEW_CONDITION_TYPE_PREDICATES: Array<
  (product: CommerceConditionSource) => boolean
> = [isBlouseProduct];

/**
 * Resolves a product to exactly one condition. Never returns both, and never
 * returns undefined — an unrecognised product type is treated as pre-loved,
 * which is the safe default for this catalogue.
 */
export function resolveCommerceCondition(
  product: CommerceConditionSource,
): CommerceCondition {
  return NEW_CONDITION_TYPE_PREDICATES.some((isNewType) => isNewType(product))
    ? "new"
    : "used";
}

/** Schema.org `itemCondition` URL for a product. */
export function resolveSchemaItemCondition(
  product: CommerceConditionSource,
): typeof SCHEMA_NEW_CONDITION | typeof SCHEMA_USED_CONDITION {
  return resolveCommerceCondition(product) === "new"
    ? SCHEMA_NEW_CONDITION
    : SCHEMA_USED_CONDITION;
}

/** Product-feed `condition` value for a product. */
export function resolveFeedCondition(
  product: CommerceConditionSource,
): FeedCondition {
  return resolveCommerceCondition(product);
}

// ---------------------------------------------------------------------------
// Public commerce-condition label vs. quality grade
// ---------------------------------------------------------------------------

/**
 * The ONLY customer-facing wording allowed for a product's commerce condition.
 * Derived from `resolveCommerceCondition`, so a page can never print "New"
 * while its JSON-LD emits UsedCondition.
 */
export const COMMERCE_CONDITION_LABELS: Record<CommerceCondition, string> = {
  new: "New",
  used: "Pre-loved",
};

export function commerceConditionLabel(
  product: CommerceConditionSource,
): string {
  return COMMERCE_CONDITION_LABELS[resolveCommerceCondition(product)];
}

type QualityGradeSource = CommerceConditionSource & {
  detailsCondition?: null | string;
};

/**
 * Free-text values that ASSERT novelty instead of describing quality. Printing
 * one of these as a grade is what produced the live contradiction: a pre-loved
 * Kanjeevaram whose grade field read "NEW" while its JSON-LD correctly said
 * UsedCondition.
 *
 * Matched as a TOKEN anywhere in the value, not as an exact string, so
 * merchandising phrasing like "New arrival" or "Like new" cannot slip a
 * new-claim in beside a "Pre-loved" label. Word boundaries keep genuine grades
 * such as "Renewed" safe.
 */
const COMMERCE_NEW_CLAIM = /\b(?:new|nwt|unused)\b/i;

/**
 * Free-text values that merely restate the commerce condition. They carry no
 * independent grading information, so they are not surfaced as a grade — the
 * commerce label already says it.
 */
const RESTATES_COMMERCE_CONDITION =
  /^(?:pre[\s-]?loved(?:,?\s*quality[\s-]?checked)?|used|second[\s-]?hand)$/i;

/**
 * Quality grade — INDEPENDENT of commerce condition.
 *
 * "Excellent", "Superior", "Restored", "Unworn" and similar all describe how
 * good a piece is; none of them decide whether it is new or second-hand. A
 * value that claims a commerce condition is rejected outright rather than
 * rendered, so the visible grade can never contradict `itemCondition`.
 */
export function resolveQualityGrade(
  product: QualityGradeSource,
): string | null {
  const raw = product.detailsCondition?.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (COMMERCE_NEW_CLAIM.test(raw)) return null;
  if (RESTATES_COMMERCE_CONDITION.test(raw)) return null;
  return raw;
}

export type ProductConditionDisplay = {
  /** Customer-facing commerce condition: "Pre-loved" or "New". */
  commerceLabel: string;
  /** Optional independent quality grade, or null when none is meaningful. */
  qualityGrade: string | null;
};

/**
 * Single entry point for every customer-facing condition surface (PDP dossier,
 * promise strip, info cards, JSON-LD additionalProperty).
 */
export function productConditionDisplay(
  product: QualityGradeSource,
): ProductConditionDisplay {
  return {
    commerceLabel: commerceConditionLabel(product),
    qualityGrade: resolveQualityGrade(product),
  };
}
