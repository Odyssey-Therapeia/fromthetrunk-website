import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- hoisted mocks ----
const addOrderEventMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());
const getOrderNotificationRecipientsMock = vi.hoisted(() => vi.fn());
const orderConfirmationEmailMock = vi.hoisted(() => vi.fn());
const orderPurchaseNotificationEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const completePaidCommerceStateMock = vi.hoisted(() => vi.fn());
// P6-02: incrementDiscountUsage mock — hoisted so it's available before imports.
const incrementDiscountUsageMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));

// P6-02: Mock @/db/queries/discounts at the module boundary (lowest real dependency).
// Tests the REAL completePaidOrder with only the DB layer mocked.
vi.mock("@/db/queries/discounts", () => ({
  incrementDiscountUsage: incrementDiscountUsageMock,
}));

vi.mock("@/db/queries/user-cart", () => ({
  completePaidCommerceState: completePaidCommerceStateMock,
}));

vi.mock("@/db/queries/orders", () => ({
  addOrderEvent: addOrderEventMock,
  getOrder: getOrderMock,
}));

// Blouses are excluded from the paid→sold claim. Default: no blouses, so every
// product is reservable (one-of-one) — preserves the pre-blouse behaviour.
vi.mock("@/db/queries/products", () => ({
  getBlouseProductIdSet: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/email/recipients", () => ({
  getOrderNotificationRecipients: getOrderNotificationRecipientsMock,
}));

vi.mock("@/lib/email/templates", () => ({
  orderConfirmationEmail: orderConfirmationEmailMock,
  orderPurchaseNotificationEmail: orderPurchaseNotificationEmailMock,
}));

vi.mock("@/lib/analytics/emit", () => ({
  emitAnalyticsEvent: vi.fn(),
}));

import { completePaidOrder } from "@/lib/orders/complete-paid-order";

// ---- helper data ----
const PENDING_ORDER = {
  id: "order-1",
  items: [{ productId: "prod-1", name: "Saree", pricePaise: 100000, quantity: 1 }],
  paymentStatus: "pending",
  status: "pending",
  shippingCity: "Mumbai",
  shippingCountry: "India",
  shippingCostPaise: 0,
  shippingEmail: "buyer@example.com",
  shippingLine1: "123 Street",
  shippingLine2: null,
  shippingName: "Test Buyer",
  shippingPhone: "9999999999",
  shippingPostalCode: "400001",
  shippingState: "MH",
  subtotalPaise: 100000,
  taxAmountPaise: 0,
  totalPaise: 100000,
  userId: "11111111-1111-4111-8111-111111111111",
};

const CONFIRMED_ORDER = { ...PENDING_ORDER, paymentStatus: "paid", status: "confirmed" };

const INPUT = {
  orderId: "order-1",
  paymentId: "pay_abc123",
  paymentMethod: "razorpay",
  paymentReference: "ref_xyz",
  paymentUrl: null,
  source: "razorpay-webhook",
};

describe("completePaidOrder", () => {
  beforeEach(() => {
    completePaidCommerceStateMock.mockReset();
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    sendEmailMock.mockReset();
    getOrderNotificationRecipientsMock.mockReset();
    orderConfirmationEmailMock.mockReset();
    orderPurchaseNotificationEmailMock.mockReset();

    completePaidCommerceStateMock.mockResolvedValue({
      kind: "completed",
      soldCount: 1,
      soldSlugs: ["saree"],
    });

    // Set up email mocks
    getOrderNotificationRecipientsMock.mockReturnValue(["admin@example.com"]);
    orderConfirmationEmailMock.mockReturnValue({ subject: "Order confirmed", html: "<p>confirmed</p>" });
    orderPurchaseNotificationEmailMock.mockReturnValue({ subject: "New purchase", html: "<p>purchase</p>" });
    sendEmailMock.mockResolvedValue(undefined);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  describe("Test 1: concurrent calls — exactly one email sent", () => {
    it("first call wins (rows returned), second call loses (no rows returned)", async () => {
      completePaidCommerceStateMock
        .mockResolvedValueOnce({ kind: "completed", soldCount: 1, soldSlugs: ["saree"] })
        .mockResolvedValueOnce({ kind: "already_paid", soldCount: 0, soldSlugs: [] });

      // getOrder calls:
      // Call 1: existing check for first invocation (pending)
      // Call 2: existing check for second invocation (pending — race condition)
      // Call 3: confirmed load for first invocation (winner path)
      // Call 4: current state for second invocation (loser path)
      getOrderMock
        .mockResolvedValueOnce(PENDING_ORDER) // first call existing check
        .mockResolvedValueOnce(PENDING_ORDER) // second call existing check
        .mockResolvedValueOnce(CONFIRMED_ORDER) // first call confirmed load (winner)
        .mockResolvedValueOnce(CONFIRMED_ORDER); // second call current state (loser)

      const [result1, result2] = await Promise.all([
        completePaidOrder(INPUT),
        completePaidOrder(INPUT),
      ]);

      const results = [result1, result2];
      const winners = results.filter((r) => r.emailsSent);
      const losers = results.filter((r) => !r.emailsSent);

      // Exactly one winner, one loser
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      // The loser must carry alreadyPaid: true
      expect(losers[0]).toHaveProperty("alreadyPaid", true);

      // sendEmail called exactly twice (customer + admin notification from winner only)
      expect(sendEmailMock).toHaveBeenCalledTimes(2);

      expect(completePaidCommerceStateMock).toHaveBeenCalledTimes(2);
      expect(completePaidCommerceStateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "order-1",
          paymentId: "pay_abc123",
          userId: PENDING_ORDER.userId,
        }),
      );
    });
  });

  describe("Test 2: idempotent re-call on already-paid order", () => {
    it("returns alreadyPaid=true and does not send emails when order is already paid", async () => {
      // getOrder returns the order (not-found check passes).
      // The existing order is already in confirmed/paid state, reflecting the scenario name.
      // The atomic orders UPDATE finds nothing (order already paid) → returns []
      // loser path: another getOrder call fetches current state
      getOrderMock
        .mockResolvedValueOnce(CONFIRMED_ORDER) // existing check — already-paid order (passes not-found guard)
        .mockResolvedValueOnce(CONFIRMED_ORDER); // current state read in loser path

      completePaidCommerceStateMock.mockResolvedValue({
        kind: "already_paid",
        soldCount: 0,
        soldSlugs: [],
      });

      const result = await completePaidOrder(INPUT);

      expect(result.emailsSent).toBe(false);
      expect(result).toHaveProperty("alreadyPaid", true);
      expect(sendEmailMock).not.toHaveBeenCalled();

      expect(completePaidCommerceStateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Test 3: inventory race during payment completion", () => {
    it("rejects with PRODUCT_SOLD and does not send emails when the product claim fails", async () => {
      getOrderMock.mockResolvedValueOnce(PENDING_ORDER);
      completePaidCommerceStateMock.mockResolvedValueOnce({
        kind: "inventory_conflict",
        soldCount: 0,
        soldSlugs: [],
      });

      await expect(completePaidOrder(INPUT)).rejects.toThrow("PRODUCT_SOLD");

      expect(addOrderEventMock).toHaveBeenCalledWith(
        "order-1",
        "Payment completion inventory conflict",
        "pending",
        expect.objectContaining({
          code: "PRODUCT_SOLD",
          requestedProductIds: ["prod-1"],
          soldCount: 0,
        })
      );
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });

  describe("Test 4: a capture lands on an order that is no longer pending", () => {
    it("records the captured payment for review before rejecting with PAYMENT_CLAIM_CONFLICT", async () => {
      getOrderMock.mockResolvedValueOnce({ ...PENDING_ORDER, paymentStatus: "failed" });
      completePaidCommerceStateMock.mockResolvedValueOnce({
        kind: "order_state_conflict",
        soldCount: 0,
        soldSlugs: [],
      });

      await expect(completePaidOrder(INPUT)).rejects.toThrow("PAYMENT_CLAIM_CONFLICT");

      expect(addOrderEventMock).toHaveBeenCalledOnce();
      expect(addOrderEventMock).toHaveBeenCalledWith(
        "order-1",
        "Captured payment on non-pending order",
        "pending",
        {
          code: "PAYMENT_ON_CLOSED_ORDER",
          paymentId: "pay_abc123",
          paymentReference: "ref_xyz",
          previousPaymentStatus: "failed",
          source: "razorpay-webhook",
        },
      );
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("does not report a different payment id as a closed-order capture", async () => {
      getOrderMock.mockResolvedValueOnce(PENDING_ORDER);
      completePaidCommerceStateMock.mockResolvedValueOnce({
        kind: "payment_conflict",
        soldCount: 0,
        soldSlugs: [],
      });

      await expect(completePaidOrder(INPUT)).rejects.toThrow("PAYMENT_ID_MISMATCH");

      expect(addOrderEventMock).not.toHaveBeenCalled();
    });
  });
});

// ── P6-02: incrementDiscountUsage wiring — mutation-proof ────────────────────
//
// These tests prove that completePaidOrder increments usageCount when an order
// has a discountId, and does NOT increment it when there is no discountId or
// when the order is already paid (loser path). Mock discipline: @/db/queries/discounts
// is mocked at the module boundary; completePaidOrder is the REAL function.
describe("completePaidOrder — discount usage increment (P6-02 mutation-proof)", () => {
  const PENDING_ORDER_WITH_DISCOUNT = {
    id: "order-2",
    items: [{ productId: "prod-1", name: "Saree", pricePaise: 100000, quantity: 1 }],
    paymentStatus: "pending",
    status: "pending",
    shippingCity: "Mumbai",
    shippingCountry: "India",
    shippingCostPaise: 0,
    shippingEmail: "buyer@example.com",
    shippingLine1: "123 Street",
    shippingLine2: null,
    shippingName: "Test Buyer",
    shippingPhone: "9999999999",
    shippingPostalCode: "400001",
    shippingState: "MH",
    subtotalPaise: 100000,
    taxAmountPaise: 0,
    totalPaise: 100000,
    userId: "11111111-1111-4111-8111-111111111111",
    // P6-02: order has a discount applied
    discountId: "disc-uuid-001",
    discountCode: "SAVE10",
  };

  const CONFIRMED_ORDER_WITH_DISCOUNT = {
    ...PENDING_ORDER_WITH_DISCOUNT,
    paymentStatus: "paid",
    status: "confirmed",
  };

  const INPUT_2 = {
    orderId: "order-2",
    paymentId: "pay_def456",
    paymentMethod: "razorpay_payment_link",
    paymentReference: "plink_xyz",
    paymentUrl: null,
    source: "Razorpay payment link callback",
  };

  beforeEach(() => {
    incrementDiscountUsageMock.mockReset().mockResolvedValue(true);
    completePaidCommerceStateMock.mockReset().mockResolvedValue({
      kind: "completed",
      soldCount: 1,
      soldSlugs: ["saree"],
    });
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    sendEmailMock.mockReset();
    getOrderNotificationRecipientsMock.mockReset();
    orderConfirmationEmailMock.mockReset();
    orderPurchaseNotificationEmailMock.mockReset();

    getOrderNotificationRecipientsMock.mockReturnValue(["admin@example.com"]);
    orderConfirmationEmailMock.mockReturnValue({ subject: "Order confirmed", html: "<p>confirmed</p>" });
    orderPurchaseNotificationEmailMock.mockReturnValue({ subject: "New purchase", html: "<p>purchase</p>" });
    sendEmailMock.mockResolvedValue(undefined);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  it("mutation-proof: incrementDiscountUsage is called ONCE on the winner path when discountId is set", async () => {
    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER_WITH_DISCOUNT) // existing check
      .mockResolvedValueOnce(CONFIRMED_ORDER_WITH_DISCOUNT); // confirmed load

    await completePaidOrder(INPUT_2);

    // The REAL completePaidOrder must call incrementDiscountUsage with the discount ID.
    // If the wiring were removed, this assertion would fail.
    expect(incrementDiscountUsageMock).toHaveBeenCalledTimes(1);
    expect(incrementDiscountUsageMock).toHaveBeenCalledWith("disc-uuid-001");
  });

  it("mutation-proof: incrementDiscountUsage is NOT called on the loser path (already-paid order)", async () => {
    completePaidCommerceStateMock.mockResolvedValueOnce({
      kind: "already_paid",
      soldCount: 0,
      soldSlugs: [],
    });
    getOrderMock
      .mockResolvedValueOnce(CONFIRMED_ORDER_WITH_DISCOUNT) // existing check — already paid
      .mockResolvedValueOnce(CONFIRMED_ORDER_WITH_DISCOUNT); // current state in loser path

    const result = await completePaidOrder(INPUT_2);

    expect(result.alreadyPaid).toBe(true);
    // incrementDiscountUsage must NOT be called on the loser branch (would double-count).
    expect(incrementDiscountUsageMock).not.toHaveBeenCalled();
  });

  it("mutation-proof: incrementDiscountUsage is NOT called when order has no discountId", async () => {
    // Order without a discount: discountId is absent/undefined → no increment.
    const pendingOrderNoDiscount = {
      id: "order-3",
      items: [{ productId: "prod-1", name: "Saree", pricePaise: 100000, quantity: 1 }],
      paymentStatus: "pending",
      status: "pending",
      shippingCity: "Mumbai",
      shippingCountry: "India",
      shippingCostPaise: 0,
      shippingEmail: "buyer@example.com",
      shippingLine1: "123 Street",
      shippingLine2: null,
      shippingName: "Test Buyer",
      shippingPhone: "9999999999",
      shippingPostalCode: "400001",
      shippingState: "MH",
      subtotalPaise: 100000,
      taxAmountPaise: 0,
      totalPaise: 100000,
      userId: "11111111-1111-4111-8111-111111111111",
      // No discountId
    };
    const confirmedOrderNoDiscount = { ...pendingOrderNoDiscount, paymentStatus: "paid", status: "confirmed" };

    getOrderMock
      .mockResolvedValueOnce(pendingOrderNoDiscount) // existing check
      .mockResolvedValueOnce(confirmedOrderNoDiscount); // confirmed load

    await completePaidOrder({ ...INPUT_2, orderId: "order-3" });

    // No discount on order → usage increment must not fire.
    expect(incrementDiscountUsageMock).not.toHaveBeenCalled();
  });

  // FIX #2 (BLOCKER): over-redemption false-return branch in the winner path.
  //
  // Gap: the existing tests mock incrementDiscountUsage to mockResolvedValue(undefined)
  // (which is falsy but not the correct Promise<boolean> shape). They never exercise
  // the branch at complete-paid-order.ts:146-155 where incrementDiscountUsage
  // returns false (over-redemption at confirmation time) and addOrderEvent is called
  // with the "discount_usage_limit_exceeded" event. Deleting that branch fails no test.
  //
  // This test models the REAL Promise<boolean> return type by resolving to false,
  // then asserts:
  //   1. addOrderEvent is called with the review-log event.
  //   2. The order still completes (emailsSent=true, alreadyPaid=false).
  //   3. incrementDiscountUsage is still called exactly once (winner path).
  it("FIX #2: when incrementDiscountUsage returns false (over-redemption race), review-log event is emitted and order still completes", async () => {
    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER_WITH_DISCOUNT) // existing check
      .mockResolvedValueOnce(CONFIRMED_ORDER_WITH_DISCOUNT); // confirmed load after winner work

    // The critical setup: incrementDiscountUsage resolves to FALSE (at-limit race).
    incrementDiscountUsageMock.mockResolvedValueOnce(false);

    const result = await completePaidOrder(INPUT_2);

    // 1. The order must still complete — the customer is not penalised for the race.
    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);

    // 2. incrementDiscountUsage was called exactly once on the winner branch.
    expect(incrementDiscountUsageMock).toHaveBeenCalledTimes(1);
    expect(incrementDiscountUsageMock).toHaveBeenCalledWith("disc-uuid-001");

    // 3. The review-log event must be emitted (complete-paid-order.ts:147-155).
    // addOrderEvent is called twice in the winner path:
    //   call 1: "...payment confirmed" event (always emitted)
    //   call 2: "discount_usage_limit_exceeded: ..." (emitted when false-return)
    // We assert the discount-exceeded event is present.
    const eventCalls = addOrderEventMock.mock.calls as Array<[string, string, string, unknown]>;
    const reviewLogCall = eventCalls.find(
      ([, message]) => typeof message === "string" && message.includes("discount_usage_limit_exceeded")
    );
    expect(
      reviewLogCall,
      "A 'discount_usage_limit_exceeded' order event must be emitted when incrementDiscountUsage returns false — " +
      "deleting the false-return branch at complete-paid-order.ts:146-155 causes this assertion to fail"
    ).toBeDefined();
    // The event must carry the discountId for traceability.
    expect(reviewLogCall![0]).toBe("order-2"); // orderId
    expect(reviewLogCall![2]).toBe("confirmed"); // status
    const eventData = reviewLogCall![3] as Record<string, unknown>;
    expect(eventData).toHaveProperty("discountId", "disc-uuid-001");

    // 4. Emails are still sent (customer receives their order confirmation).
    expect(sendEmailMock).toHaveBeenCalledTimes(2); // customer + admin notification
  });

  it("true-return path: when incrementDiscountUsage returns true, NO review-log event is emitted", async () => {
    // Regression lock for the true (normal) path: no review-log event.
    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER_WITH_DISCOUNT)
      .mockResolvedValueOnce(CONFIRMED_ORDER_WITH_DISCOUNT);

    // Correct path: increment succeeds.
    incrementDiscountUsageMock.mockResolvedValueOnce(true);

    const result = await completePaidOrder(INPUT_2);

    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);

    // On the true-return path, only the "payment confirmed" event is emitted;
    // the "discount_usage_limit_exceeded" event must NOT appear.
    const eventCalls = addOrderEventMock.mock.calls as Array<[string, string, string, unknown]>;
    const reviewLogCall = eventCalls.find(
      ([, message]) => typeof message === "string" && message.includes("discount_usage_limit_exceeded")
    );
    expect(
      reviewLogCall,
      "No review-log event should be emitted when incrementDiscountUsage succeeds"
    ).toBeUndefined();
  });
});
