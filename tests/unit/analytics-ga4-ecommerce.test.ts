import { describe, expect, it } from "vitest";

import {
  buildAddToCartEvent,
  buildGa4Item,
  buildSelectItemEvent,
  buildViewItemEvent,
  paiseToRupees,
} from "@/lib/analytics/ga4-ecommerce";

describe("GA4 ecommerce builders", () => {
  it("converts paise into rupees", () => {
    expect(paiseToRupees(500000)).toBe(5000);
    expect(paiseToRupees(325050)).toBe(3250.5);
  });

  it("protects GA4 from invalid or negative monetary values", () => {
    expect(paiseToRupees(-100)).toBe(0);
    expect(paiseToRupees(Number.NaN)).toBe(0);
    expect(paiseToRupees(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("builds a canonical GA4 item", () => {
    expect(
      buildGa4Item({
        category: " Saree ",
        id: "product-123",
        name: "Heritage Silk Saree",
        pricePaise: 476000,
        quantity: 2.8,
        variant: " Silk ",
      }),
    ).toEqual({
      item_category: "Saree",
      item_id: "product-123",
      item_name: "Heritage Silk Saree",
      item_variant: "Silk",
      price: 4760,
      quantity: 2,
    });
  });

  it("omits empty optional item fields", () => {
    expect(
      buildGa4Item({
        category: " ",
        id: "product-456",
        name: "Ivory Saree",
        pricePaise: 350000,
        variant: null,
      }),
    ).toEqual({
      item_id: "product-456",
      item_name: "Ivory Saree",
      price: 3500,
      quantity: 1,
    });
  });

  it("builds a canonical view_item event", () => {
    expect(
      buildViewItemEvent(
        {
          category: "Saree",
          id: "product-123",
          name: "Heritage Silk Saree",
          pricePaise: 476000,
          variant: "Silk",
        },
        {
          source: "pdp",
          stockStatus: "available",
        },
      ),
    ).toEqual({
      name: "view_item",
      params: {
        currency: "INR",
        items: [
          {
            item_category: "Saree",
            item_id: "product-123",
            item_name: "Heritage Silk Saree",
            item_variant: "Silk",
            price: 4760,
            quantity: 1,
          },
        ],
        source: "pdp",
        stock_status: "available",
        value: 4760,
      },
    });
  });

  it("uses the correct canonical event names", () => {
    const item = {
      id: "product-123",
      name: "Heritage Silk Saree",
      pricePaise: 476000,
    };

    expect(buildSelectItemEvent(item).name).toBe("select_item");
    expect(buildAddToCartEvent(item).name).toBe("add_to_cart");
  });
});
