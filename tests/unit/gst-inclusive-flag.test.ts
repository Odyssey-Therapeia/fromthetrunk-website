/**
 * P2-04: GST-inclusive pricing feature flag tests.
 *
 * Covers:
 * - isGstInclusive() helper behaviour
 * - calculateOrderTotals flag-OFF regression lock (identical to pre-P2-04 numbers)
 * - calculateOrderTotals flag-ON inclusive math
 * - Property invariants: total >= subtotal + shippingCost, never negative
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";

// calculateOrderTotals operates in PAISE (the unit the charging routes carry).
// SHIPPING_TIERS are rupee tiers, so paise equivalents are scaled by 100.
const STANDARD_PAISE = SHIPPING_TIERS.standard * 100; // 50000
const EXPRESS_PAISE = SHIPPING_TIERS.express * 100; // 120000

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Toggle FTT_FEATURE_GST_INCLUSIVE in process.env for the duration of a test.
 * Uses vi.stubEnv so Vitest restores it automatically on afterEach.
 */
function setGstFlag(value: "true" | "false" | undefined) {
  if (value === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── isGstInclusive() ───────────────────────────────────────────────────────

describe("isGstInclusive()", () => {
  it('returns false when env var is absent (default OFF)', async () => {
    vi.unstubAllEnvs();
    delete process.env.FTT_FEATURE_GST_INCLUSIVE;
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(false);
  });

  it('returns false when env var is "false"', async () => {
    setGstFlag("false");
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(false);
  });

  it('returns true when env var is "true"', async () => {
    setGstFlag("true");
    const { isGstInclusive } = await import("@/lib/config/flags");
    expect(isGstInclusive()).toBe(true);
  });
});

// ── calculateOrderTotals — flag OFF (regression lock) ─────────────────────

describe("calculateOrderTotals — flag OFF (regression lock, exclusive pricing)", () => {
  beforeEach(() => {
    setGstFlag("false");
  });

  it("standard shipping + GST for small order — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_500_000; // 15000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    // Locked values (paise): subtotal=1500000, shipping=50000, tax=180000, total=1730000
    expect(result.subtotalPaise).toBe(1_500_000);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE); // 50000
    expect(result.shippingMethod).toBe("standard");
    expect(result.taxRate).toBe(GST_RATE);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 180000
    expect(result.totalPaise).toBe(
      subtotalPaise + STANDARD_PAISE + Math.round(subtotalPaise * GST_RATE)
    ); // 1730000
  });

  it("free shipping above threshold — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 3_000_000; // 30000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 360000
    expect(result.totalPaise).toBe(subtotalPaise + Math.round(subtotalPaise * GST_RATE)); // 3360000
  });

  it("express shipping for small order — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_000_000; // 10000 INR
    const result = calculateOrderTotals(subtotalPaise, "express");

    expect(result.shippingCostPaise).toBe(EXPRESS_PAISE); // 120000
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 120000
    expect(result.totalPaise).toBe(
      subtotalPaise + EXPRESS_PAISE + Math.round(subtotalPaise * GST_RATE)
    ); // 1240000
  });

  it("zero subtotal — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(0, "standard");

    expect(result.subtotalPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(0);
    expect(result.shippingCostPaise).toBe(STANDARD_PAISE); // 50000
    expect(result.totalPaise).toBe(STANDARD_PAISE); // 50000
  });

  it("exact free-threshold amount — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = SHIPPING_TIERS.freeThreshold * 100; // 2500000 paise (25000 INR)
    const result = calculateOrderTotals(subtotalPaise, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.taxAmountPaise).toBe(Math.round(subtotalPaise * GST_RATE)); // 300000
    expect(result.totalPaise).toBe(subtotalPaise + Math.round(subtotalPaise * GST_RATE)); // 2800000
  });

  it("free express shipping above threshold — numbers must match pre-P2-04 exactly", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(3_000_000, "express");

    expect(result.shippingCostPaise).toBe(0);
  });
});

// ── calculateOrderTotals — flag ON (inclusive math) ───────────────────────

describe("calculateOrderTotals — flag ON (GST-inclusive pricing)", () => {
  beforeEach(() => {
    setGstFlag("true");
  });

  it("does NOT add GST on top — total = subtotal + shipping only", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 1_500_000; // 15000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    // GST component back-calculated for transparency: round(price * rate / (1 + rate))
    const expectedGstComponent = Math.round((subtotalPaise * GST_RATE) / (1 + GST_RATE));
    const expectedTotal = subtotalPaise + STANDARD_PAISE;

    expect(result.taxAmountPaise).toBe(expectedGstComponent);
    expect(result.totalPaise).toBe(expectedTotal);
    // total must be LESS than flag-OFF total (no tax added on top)
    expect(result.totalPaise).toBeLessThan(
      subtotalPaise + STANDARD_PAISE + Math.round(subtotalPaise * GST_RATE)
    );
  });

  it("back-calculates GST component: round(subtotal * rate / (1 + rate))", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const subtotalPaise = 3_000_000; // 30000 INR
    const result = calculateOrderTotals(subtotalPaise, "standard");

    const expectedGstComponent = Math.round((subtotalPaise * GST_RATE) / (1 + GST_RATE));
    expect(result.taxAmountPaise).toBe(expectedGstComponent); // ~321429 for 3000000 @ 12%
  });

  it("shipping tiers are unchanged — free above threshold", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(3_000_000, "standard");

    expect(result.shippingCostPaise).toBe(0);
    expect(result.totalPaise).toBe(3_000_000); // no GST added, shipping free
  });

  it("shipping tiers are unchanged — standard paid below threshold", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(1_000_000, "express");

    expect(result.shippingCostPaise).toBe(EXPRESS_PAISE); // 120000
    expect(result.totalPaise).toBe(1_000_000 + EXPRESS_PAISE); // 1120000, no added tax
  });

  it("zero subtotal — total equals shipping only, no negative values", async () => {
    const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
    const result = calculateOrderTotals(0, "standard");

    expect(result.taxAmountPaise).toBe(0);
    expect(result.totalPaise).toBe(STANDARD_PAISE);
    expect(result.totalPaise).toBeGreaterThan(0);
  });
});

// ── Property invariants (both flag states) ─────────────────────────────────

describe("calculateOrderTotals — property invariants", () => {
  const cases: Array<[number, "standard" | "express", string]> = [
    [0, "standard", "zero subtotal standard"],
    [5000, "standard", "small subtotal standard"],
    [5000, "express", "small subtotal express"],
    [25000, "standard", "threshold standard"],
    [50000, "express", "large subtotal express"],
  ];

  for (const flagValue of ["false", "true"] as const) {
    describe(`flag ${flagValue}`, () => {
      beforeEach(() => setGstFlag(flagValue));

      for (const [subtotal, method, label] of cases) {
        it(`total is never negative and total >= subtotal + shippingCost [${label}]`, async () => {
          const { calculateOrderTotals } = await import("@/lib/payments/razorpay");
          const result = calculateOrderTotals(subtotal, method);

          expect(result.totalPaise).toBeGreaterThanOrEqual(0);
          expect(result.subtotalPaise).toBeGreaterThanOrEqual(0);
          expect(result.taxAmountPaise).toBeGreaterThanOrEqual(0);
          expect(result.shippingCostPaise).toBeGreaterThanOrEqual(0);
          // total must cover at minimum subtotal + shipping (tax is always >= 0)
          expect(result.totalPaise).toBeGreaterThanOrEqual(
            result.subtotalPaise + result.shippingCostPaise
          );
        });
      }
    });
  }
});
