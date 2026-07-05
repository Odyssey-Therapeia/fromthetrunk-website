import { describe, expect, it } from "vitest";

import {
  OFFERED_BLOUSE_SIZES,
  convertInchesValueToCm,
  getAvailableBlouseSizes,
  getSelectedSizeLabel,
  isValidBlouseSize,
  normalizeBlouseSize,
} from "@/lib/catalog/blouse-size-chart";
import { isBlouseProduct } from "@/lib/products/product-type";

describe("blouse size chart utilities", () => {
  it("normalizes and validates supported blouse sizes", () => {
    expect(normalizeBlouseSize("m")).toBe("M");
    expect(normalizeBlouseSize("2xl")).toBe("2XL");
    expect(isValidBlouseSize("8XL")).toBe(true);
    expect(isValidBlouseSize("free-size")).toBe(false);
  });

  it("falls back to the offered sizes when a product has no valid availableSizes", () => {
    expect(getAvailableBlouseSizes({ attributes: null })).toEqual(
      OFFERED_BLOUSE_SIZES,
    );
    expect(getAvailableBlouseSizes({ attributes: { availableSizes: ["bad"] } })).toEqual(
      OFFERED_BLOUSE_SIZES,
    );
  });

  it("returns only offered sizes, dropping anything outside S/M/L", () => {
    expect(
      getAvailableBlouseSizes({
        attributes: { availableSizes: ["xl", "S", "m", "S"] },
      }),
    ).toEqual(["S", "M"]);
  });

  it("converts inches and ranges to centimeters", () => {
    expect(convertInchesValueToCm("32-33")).toBe("81.3-83.8");
    expect(convertInchesValueToCm("37")).toBe("94");
  });

  it("formats selected size labels only for valid sizes", () => {
    expect(getSelectedSizeLabel({ size: "m" })).toBe("Size: M");
    expect(getSelectedSizeLabel({ size: "petite" })).toBeNull();
  });
});

describe("isBlouseProduct", () => {
  it("uses typeSlug as the primary blouse signal", () => {
    expect(isBlouseProduct({ typeSlug: "blouse" })).toBe(true);
    expect(isBlouseProduct({ typeSlug: "preloved-saree" })).toBe(false);
  });

  it("uses an explicit blouse tag only when typeSlug is missing", () => {
    expect(
      isBlouseProduct({ tags: [{ slug: "blouse", name: "Blouse" }] }),
    ).toBe(true);
    expect(
      isBlouseProduct({
        tags: [{ slug: "blouse", name: "Blouse" }],
        typeSlug: "preloved-saree",
      }),
    ).toBe(false);
  });
});
