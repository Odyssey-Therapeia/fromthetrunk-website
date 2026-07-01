import { describe, expect, it } from "vitest";

import {
  formatSelectedOptions,
  validateOrderItemSelectedOptions,
} from "@/lib/orders/selected-options";

const blouseProduct = {
  attributes: {
    availableSizes: ["S", "M", "L"],
  },
  id: "blouse-1",
  name: "Black Cotton Blouse",
  typeSlug: "blouse",
};

const sareeProduct = {
  attributes: {},
  id: "saree-1",
  name: "Ivory Handloom Saree",
  typeSlug: "saree",
};

describe("validateOrderItemSelectedOptions", () => {
  it("requires a size for blouse products", () => {
    const result = validateOrderItemSelectedOptions({
      product: blouseProduct,
      selectedOptions: {},
    });

    expect(result).toEqual({
      error: {
        code: "BLOUSE_SIZE_REQUIRED",
        details: {
          productId: blouseProduct.id,
          productName: blouseProduct.name,
        },
        message: "Please select a blouse size before checkout.",
      },
    });
  });

  it("rejects unavailable blouse sizes", () => {
    const result = validateOrderItemSelectedOptions({
      product: blouseProduct,
      selectedOptions: { size: "XL" },
    });

    expect(result).toEqual({
      error: {
        code: "BLOUSE_SIZE_INVALID",
        details: {
          productId: blouseProduct.id,
          productName: blouseProduct.name,
        },
        message: "The selected blouse size is not available for this piece.",
      },
    });
  });

  it("accepts and normalizes valid blouse sizes", () => {
    const result = validateOrderItemSelectedOptions({
      product: blouseProduct,
      selectedOptions: { size: "m" },
    });

    expect(result).toEqual({ selectedOptions: { size: "M" } });
  });

  it("ignores size options for non-blouse products", () => {
    const result = validateOrderItemSelectedOptions({
      product: sareeProduct,
      selectedOptions: { size: "M" },
    });

    expect(result).toEqual({ selectedOptions: {} });
  });
});

describe("formatSelectedOptions", () => {
  it("formats blouse size labels safely", () => {
    expect(formatSelectedOptions({ size: "xl" })).toBe("Size: XL");
    expect(formatSelectedOptions({})).toBeNull();
    expect(formatSelectedOptions(null)).toBeNull();
  });
});
