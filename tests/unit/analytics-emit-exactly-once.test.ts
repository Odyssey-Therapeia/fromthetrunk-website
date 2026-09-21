/**
 * P2-07: payment_completed exactly-once + fire-and-forget proofs.
 *
 * Tests completePaidOrder in isolation with emitAnalyticsEvent mocked to verify:
 *   L3: payment_completed fires EXACTLY ONCE — only in the winner branch.
 *   L2 (money path): analytics delivery is not awaited by completePaidOrder.
 *
 * These are in a separate file because vi.mock("@/lib/analytics/emit") conflicts
 * with the direct emitAnalyticsEvent tests in analytics-emit.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any import that uses these modules
// ---------------------------------------------------------------------------

const addOrderEventMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());
const getOrderNotificationRecipientsMock = vi.hoisted(() => vi.fn());
const orderConfirmationEmailMock = vi.hoisted(() => vi.fn());
const orderPurchaseNotificationEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const completePaidCommerceStateMock = vi.hoisted(() => vi.fn());

// emitAnalyticsEvent spy — mocked so we can assert call count without network
const emitAnalyticsEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/db/queries/orders", () => ({
  addOrderEvent: addOrderEventMock,
  getOrder: getOrderMock,
}));

vi.mock("@/db/queries/user-cart", () => ({
  completePaidCommerceState: completePaidCommerceStateMock,
}));

vi.mock("@/db/queries/discounts", () => ({
  incrementDiscountUsage: vi.fn(),
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
  emitAnalyticsEvent: emitAnalyticsEventMock,
  _resetSinks: vi.fn(),
}));

vi.mock("@/lib/cache/product-cache", () => ({
  revalidateProductsCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { completePaidOrder } from "@/lib/orders/complete-paid-order";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PENDING_ORDER = {
  id: "order-1",
  items: [{ productId: "prod-1", name: "Saree", pricePaise: 100000, quantity: 1 }],
  paymentStatus: "pending",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("completePaidOrder — payment_completed exactly-once (L3)", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    sendEmailMock.mockReset();
    getOrderNotificationRecipientsMock.mockReset();
    orderConfirmationEmailMock.mockReset();
    orderPurchaseNotificationEmailMock.mockReset();
    emitAnalyticsEventMock.mockReset();
    emitAnalyticsEventMock.mockResolvedValue(undefined);
    completePaidCommerceStateMock.mockReset();

    getOrderNotificationRecipientsMock.mockReturnValue(["admin@example.com"]);
    orderConfirmationEmailMock.mockReturnValue({ subject: "Order confirmed", html: "<p>confirmed</p>" });
    orderPurchaseNotificationEmailMock.mockReturnValue({ subject: "New purchase", html: "<p>purchase</p>" });
    sendEmailMock.mockResolvedValue(undefined);
    addOrderEventMock.mockResolvedValue(undefined);
  });

  it("emits payment_completed exactly once for the atomic commerce winner", async () => {
    completePaidCommerceStateMock.mockResolvedValue({
      kind: "completed",
      soldCount: 1,
      soldSlugs: [],
    });

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)  // existing check
      .mockResolvedValueOnce(CONFIRMED_ORDER); // confirmed load (winner path)

    const result = await completePaidOrder(INPUT);

    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);

    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_completed",
        payload: expect.objectContaining({
          orderId: "order-1",
          paymentId: "pay_abc123",
        }),
      })
    );
  });

  it("does NOT emit payment_completed in loser (already-paid) branch", async () => {
    completePaidCommerceStateMock.mockResolvedValue({
      kind: "already_paid",
      soldCount: 0,
      soldSlugs: [],
    });

    getOrderMock
      .mockResolvedValueOnce(CONFIRMED_ORDER)  // existing check passes (order exists)
      .mockResolvedValueOnce(CONFIRMED_ORDER); // current state read in loser path

    const result = await completePaidOrder(INPUT);

    expect(result.alreadyPaid).toBe(true);
    expect(result.emailsSent).toBe(false);
    expect(emitAnalyticsEventMock).not.toHaveBeenCalled();
  });

  it("emits exactly once under concurrent winner + loser calls", async () => {
    completePaidCommerceStateMock
      .mockResolvedValueOnce({
        kind: "completed",
        soldCount: 1,
        soldSlugs: [],
      })
      .mockResolvedValueOnce({
        kind: "already_paid",
        soldCount: 0,
        soldSlugs: [],
      });

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)   // call 1 existing check
      .mockResolvedValueOnce(PENDING_ORDER)   // call 2 existing check (concurrent)
      .mockResolvedValueOnce(CONFIRMED_ORDER) // call 1 confirmed (winner path)
      .mockResolvedValueOnce(CONFIRMED_ORDER); // call 2 current state (loser path)

    const [r1, r2] = await Promise.all([
      completePaidOrder(INPUT),
      completePaidOrder(INPUT),
    ]);

    const winners = [r1, r2].filter((r) => !r.alreadyPaid);
    const losers = [r1, r2].filter((r) => r.alreadyPaid);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Only the winner emits — total call count is exactly 1
    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    expect(emitAnalyticsEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "payment_completed" })
    );
  });

  it("does not await analytics delivery before returning the confirmed order", async () => {
    // The production analytics adapter absorbs sink failures. A promise that
    // never settles proves this money path is fire-and-forget without creating
    // an artificial unhandled rejection in Vitest.
    emitAnalyticsEventMock.mockReturnValue(new Promise(() => undefined));
    completePaidCommerceStateMock.mockResolvedValue({
      kind: "completed",
      soldCount: 1,
      soldSlugs: [],
    });

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)
      .mockResolvedValueOnce(CONFIRMED_ORDER);

    const result = await completePaidOrder(INPUT);

    // The order must be confirmed and emails sent despite analytics failure
    expect(result.alreadyPaid).toBe(false);
    expect(result.emailsSent).toBe(true);
    expect(result.order).toBeDefined();
  });

  it("payment_completed event_id is a valid UUID string (generated server-side)", async () => {
    completePaidCommerceStateMock.mockResolvedValue({
      kind: "completed",
      soldCount: 1,
      soldSlugs: [],
    });

    getOrderMock
      .mockResolvedValueOnce(PENDING_ORDER)
      .mockResolvedValueOnce(CONFIRMED_ORDER);

    await completePaidOrder(INPUT);

    expect(emitAnalyticsEventMock).toHaveBeenCalledTimes(1);
    const [event] = emitAnalyticsEventMock.mock.calls[0] as [{ event_id: string }];
    // Validate that event_id is a UUID (generated via crypto.randomUUID())
    expect(event.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
