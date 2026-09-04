/**
 * SEO remediation pass 1 — blocker 2.
 *
 * One live product carried the free-text condition "NEW" while its JSON-LD
 * correctly emitted UsedCondition:
 *
 *   slug      mayil-peacock-kanjivaram-mix
 *   productID aeec9835-62cf-408d-a307-dddf6f3f45b1
 *   field     products.details_condition = 'NEW'
 *
 * The previous pass fixed itemCondition and the channel feeds but left the
 * visible label reading from that raw field, so the page still said NEW.
 *
 * Commerce condition (new vs used) and quality grade (Excellent, Superior, …)
 * are now two separate concepts resolved in one place, and the visible label is
 * derived from the same resolver as the schema value. These tests assert the
 * invariant directly: no product can render "New" while emitting UsedCondition.
 */

import { describe, expect, it } from "vitest";

import type { Product } from "@/types/domain";
import {
  COMMERCE_CONDITION_LABELS,
  SCHEMA_NEW_CONDITION,
  SCHEMA_USED_CONDITION,
  commerceConditionLabel,
  productConditionDisplay,
  resolveQualityGrade,
  resolveSchemaItemCondition,
} from "@/lib/commerce/product-condition";
import { resolveFeedCondition } from "@/lib/commerce/product-condition";
import { productJsonLd } from "@/lib/seo/json-ld";

const base = {
  id: "aeec9835-62cf-408d-a307-dddf6f3f45b1",
  name: "Mayil Peacock Kanjivaram Mix",
  slug: "mayil-peacock-kanjivaram-mix",
  pricePaise: 524900,
  stockStatus: "available" as const,
  storyNarrative: "A peacock-motif Kanjeevaram mix saree.",
  images: [],
  tags: [],
  typeSlug: "saree",
} as unknown as Product;

const productWith = (overrides: Record<string, unknown>) =>
  ({ ...base, ...overrides }) as unknown as Product;

/** Every free-text value observed in the live catalogue, plus the danger set. */
const LIVE_AND_RISKY_CONDITION_VALUES = [
  "Pre-loved, quality checked",
  "Excellent",
  "Superior",
  "NEW",
  "New",
  "new",
  "Brand New",
  "brand-new",
  "New with tags",
  "NWT",
  "Unused",
  "Unworn",
  "New arrival",
  "Quality checked",
  "Vintage",
  "Restored",
  "",
  null,
];

// ---------------------------------------------------------------------------
// The exact live offender
// ---------------------------------------------------------------------------

describe("the live contradictory product", () => {
  const mayil = productWith({ detailsCondition: "NEW" });

  it("still resolves to UsedCondition", () => {
    expect(resolveSchemaItemCondition(mayil)).toBe(SCHEMA_USED_CONDITION);
    expect(resolveFeedCondition(mayil)).toBe("used");
  });

  it("no longer shows NEW anywhere customer-facing", () => {
    const display = productConditionDisplay(mayil);
    expect(display.commerceLabel).toBe("Pre-loved");
    expect(display.qualityGrade).toBeNull();
    expect(JSON.stringify(display)).not.toMatch(/\bnew\b/i);
  });

  it("emits no NEW claim in its Product JSON-LD", () => {
    const serialised = JSON.stringify(productJsonLd(mayil));
    expect(serialised).toContain(SCHEMA_USED_CONDITION);
    expect(serialised).not.toContain(SCHEMA_NEW_CONDITION);

    const parsed = JSON.parse(serialised);
    const condition = (parsed.additionalProperty as Array<Record<string, string>>)
      .find((property) => property.name === "Condition");
    expect(condition?.value).toBe("Pre-loved");
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe("visible label can never contradict schema condition", () => {
  it.each(LIVE_AND_RISKY_CONDITION_VALUES)(
    "holds for a saree whose free-text condition is %o",
    (value) => {
      const saree = productWith({ detailsCondition: value });
      const display = productConditionDisplay(saree);
      const itemCondition = resolveSchemaItemCondition(saree);

      expect(itemCondition).toBe(SCHEMA_USED_CONDITION);
      expect(display.commerceLabel).toBe("Pre-loved");

      // The whole rendered condition surface, grade included.
      const visible = [display.commerceLabel, display.qualityGrade ?? ""].join(
        " ",
      );
      expect(visible).not.toMatch(/\bnew\b/i);
      expect(visible).not.toMatch(/\bunused\b/i);
    },
  );

  it.each(LIVE_AND_RISKY_CONDITION_VALUES)(
    "keeps a NEW blouse self-consistent when its free text is %o",
    (value) => {
      const blouse = productWith({ typeSlug: "blouse", detailsCondition: value });
      expect(resolveSchemaItemCondition(blouse)).toBe(SCHEMA_NEW_CONDITION);
      expect(productConditionDisplay(blouse).commerceLabel).toBe("New");
    },
  );

  it("never emits both schema conditions in one document", () => {
    for (const value of LIVE_AND_RISKY_CONDITION_VALUES) {
      for (const typeSlug of ["saree", "blouse", null]) {
        const serialised = JSON.stringify(
          productJsonLd(productWith({ typeSlug, detailsCondition: value })),
        );
        const hasNew = serialised.includes(SCHEMA_NEW_CONDITION);
        const hasUsed = serialised.includes(SCHEMA_USED_CONDITION);
        expect(hasNew && hasUsed).toBe(false);
        expect(hasNew || hasUsed).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Quality grade stays a separate axis
// ---------------------------------------------------------------------------

describe("quality grade is independent of commerce condition", () => {
  it("keeps real grades on a pre-loved saree", () => {
    for (const grade of ["Excellent", "Superior", "Restored", "Unworn", "Vintage"]) {
      const display = productConditionDisplay(
        productWith({ detailsCondition: grade }),
      );
      expect(display.commerceLabel).toBe("Pre-loved");
      expect(display.qualityGrade).toBe(grade);
    }
  });

  it("drops values that merely restate the commerce condition", () => {
    for (const restatement of [
      "Pre-loved, quality checked",
      "Pre-loved",
      "pre loved",
      "Used",
      "Second-hand",
    ]) {
      expect(
        resolveQualityGrade(productWith({ detailsCondition: restatement })),
      ).toBeNull();
    }
  });

  it("rejects commerce-condition claims as grades", () => {
    for (const claim of ["NEW", "New", "Brand New", "brand-new", "NWT", "New with tags", "Unused"]) {
      expect(
        resolveQualityGrade(productWith({ detailsCondition: claim })),
      ).toBeNull();
    }
  });

  it("normalises whitespace instead of dropping a grade", () => {
    expect(
      resolveQualityGrade(productWith({ detailsCondition: "  Excellent  " })),
    ).toBe("Excellent");
  });

  it("exposes exactly two customer-facing commerce labels", () => {
    expect(COMMERCE_CONDITION_LABELS).toEqual({ new: "New", used: "Pre-loved" });
    expect(commerceConditionLabel(productWith({ typeSlug: "saree" }))).toBe(
      "Pre-loved",
    );
    expect(commerceConditionLabel(productWith({ typeSlug: "blouse" }))).toBe(
      "New",
    );
  });
});

// ---------------------------------------------------------------------------
// Every surface reads the same resolver
// ---------------------------------------------------------------------------

describe("all commerce surfaces agree", () => {
  it("PDP template renders the resolver, not the raw field", () => {
    const source = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "app/(site)/collection/[slug]/page.tsx",
      ),
      "utf8",
    ) as string;

    expect(source).toContain("productConditionDisplay(product)");
    // No customer-facing surface may print the raw free-text field again.
    expect(source).not.toContain("displayDetails.condition");
  });

  it("JSON-LD, feed and label agree for both product kinds", () => {
    for (const [typeSlug, feed, schema, label] of [
      ["saree", "used", SCHEMA_USED_CONDITION, "Pre-loved"],
      ["blouse", "new", SCHEMA_NEW_CONDITION, "New"],
    ] as const) {
      const product = productWith({ typeSlug, detailsCondition: "NEW" });
      expect(resolveFeedCondition(product)).toBe(feed);
      expect(resolveSchemaItemCondition(product)).toBe(schema);
      expect(commerceConditionLabel(product)).toBe(label);
      expect(
        JSON.parse(JSON.stringify(productJsonLd(product))).itemCondition,
      ).toBe(schema);
    }
  });
});
