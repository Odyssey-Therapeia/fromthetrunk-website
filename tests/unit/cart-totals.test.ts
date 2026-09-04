import { describe, expect, it } from "vitest";

import {
  getCartTotalsPaise,
  getDisplayOriginalPricePaise,
  getLineSavingsPaise,
  getOriginalUnitPricePaise,
  type CartTotalsLine,
} from "@/lib/cart/cart-totals";

const line = (overrides: Partial<CartTotalsLine> = {}): CartTotalsLine => ({
  price: 2850,
  quantity: 1,
  ...overrides,
});

describe("cart savings totals", () => {
  it("computes savings for a single discounted item", () => {
    const totals = getCartTotalsPaise([
      line({ price: 2850, originalPricePaise: 400_000 }),
    ]);

    expect(totals.subtotalPaise).toBe(285_000);
    expect(totals.originalSubtotalPaise).toBe(400_000);
    expect(totals.savingsPaise).toBe(115_000);
  });

  it("sums savings across two discounted items", () => {
    const totals = getCartTotalsPaise([
      line({ price: 2850, originalPricePaise: 400_000 }),
      line({ price: 1200, originalPricePaise: 150_000 }),
    ]);

    expect(totals.savingsPaise).toBe(115_000 + 30_000);
    expect(totals.subtotalPaise).toBe(285_000 + 120_000);
    expect(totals.totalItems).toBe(2);
  });

  it("multiplies savings by quantity", () => {
    expect(
      getLineSavingsPaise(
        line({ price: 2850, originalPricePaise: 400_000, quantity: 3 }),
      ),
    ).toBe(345_000);
  });

  it("contributes zero when the original price is missing", () => {
    expect(getLineSavingsPaise(line({ originalPricePaise: undefined }))).toBe(0);
    expect(getLineSavingsPaise(line({ originalPricePaise: null }))).toBe(0);
  });

  it("contributes zero when the original price is below the current price", () => {
    expect(
      getLineSavingsPaise(line({ price: 2850, originalPricePaise: 100_000 })),
    ).toBe(0);
  });

  it("contributes zero when the original price equals the current price", () => {
    expect(
      getLineSavingsPaise(line({ price: 2850, originalPricePaise: 285_000 })),
    ).toBe(0);
  });

  it("never reports negative savings", () => {
    const totals = getCartTotalsPaise([
      line({ price: 2850, originalPricePaise: -5_000 }),
    ]);

    expect(totals.savingsPaise).toBe(0);
    expect(totals.originalSubtotalPaise).toBe(totals.subtotalPaise);
  });

  it("keeps every figure an integer number of paise", () => {
    const totals = getCartTotalsPaise([
      line({ price: 1999.99, originalPricePaise: 250_000 }),
      line({ price: 0.1, originalPricePaise: 33 }),
    ]);

    for (const value of [
      totals.subtotalPaise,
      totals.originalSubtotalPaise,
      totals.savingsPaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }

    // 199999 charged vs 250000 listed, plus 10 charged vs 33 listed.
    expect(totals.savingsPaise).toBe(50_001 + 23);
  });

  it("drops the removed line's savings from the total", () => {
    const items = [
      line({ price: 2850, originalPricePaise: 400_000 }),
      line({ price: 1200, originalPricePaise: 150_000 }),
    ];

    expect(getCartTotalsPaise(items).savingsPaise).toBe(145_000);
    expect(getCartTotalsPaise(items.slice(1)).savingsPaise).toBe(30_000);
  });

  it("recalculates when quantity changes", () => {
    expect(
      getCartTotalsPaise([
        line({ price: 2850, originalPricePaise: 400_000, quantity: 1 }),
      ]).savingsPaise,
    ).toBe(115_000);
    expect(
      getCartTotalsPaise([
        line({ price: 2850, originalPricePaise: 400_000, quantity: 2 }),
      ]).savingsPaise,
    ).toBe(230_000);
  });

  it("ignores non-finite original prices instead of throwing", () => {
    expect(
      getOriginalUnitPricePaise(line({ originalPricePaise: Number.NaN })),
    ).toBe(285_000);
    expect(getCartTotalsPaise([]).savingsPaise).toBe(0);
  });

  it("excludes coupon-style discounts — only listed-price markdown counts", () => {
    // A coupon lowers what is charged at checkout; it must never appear here,
    // so a cart with no catalogue markdown reports zero regardless of price.
    const totals = getCartTotalsPaise([
      line({ price: 2000, originalPricePaise: 200_000 }),
    ]);

    expect(totals.savingsPaise).toBe(0);
  });
});

describe("markdown display rule", () => {
  it("shows the original price only when it is above the selling price", () => {
    expect(getDisplayOriginalPricePaise(379_900, 600_000)).toBe(600_000);
  });

  it("hides a struck-through price that is below the selling price", () => {
    // Real catalogue slip: Rose silk listed at ₹2,799 with an "original" of
    // ₹2,500. Advertising that would promise a discount the cart cannot credit.
    expect(getDisplayOriginalPricePaise(279_900, 250_000)).toBeNull();
  });

  it("hides equal, zero, missing, and invalid original prices", () => {
    expect(getDisplayOriginalPricePaise(279_900, 279_900)).toBeNull();
    expect(getDisplayOriginalPricePaise(279_900, 0)).toBeNull();
    expect(getDisplayOriginalPricePaise(279_900, null)).toBeNull();
    expect(getDisplayOriginalPricePaise(279_900, undefined)).toBeNull();
    expect(getDisplayOriginalPricePaise(279_900, Number.NaN)).toBeNull();
  });

  it("agrees with the savings math on every case", () => {
    const cases: Array<[number, number | null]> = [
      [379_900, 600_000],
      [279_900, 250_000],
      [279_900, 279_900],
      [279_900, null],
    ];

    for (const [pricePaise, originalPricePaise] of cases) {
      const shown = getDisplayOriginalPricePaise(pricePaise, originalPricePaise);
      const savings = getLineSavingsPaise({
        price: pricePaise / 100,
        quantity: 1,
        originalPricePaise,
      });

      // A struck-through price is shown if and only if the cart credits savings.
      expect(shown !== null).toBe(savings > 0);
    }
  });

  it("sums the real basket from the bug report correctly", () => {
    // Pink Katan ₹3,799 (was ₹6,000) + Rose silk ₹2,799 ("was" ₹2,500).
    const totals = getCartTotalsPaise([
      { price: 3799, quantity: 1, originalPricePaise: 600_000 },
      { price: 2799, quantity: 1, originalPricePaise: 250_000 },
    ]);
    expect(totals.savingsPaise).toBe(220_100);

    // Swap in a genuinely discounted second piece and the total moves.
    const bothDiscounted = getCartTotalsPaise([
      { price: 3799, quantity: 1, originalPricePaise: 600_000 },
      { price: 3299, quantity: 1, originalPricePaise: 500_000 },
    ]);
    expect(bothDiscounted.savingsPaise).toBe(220_100 + 170_100);
  });
});
