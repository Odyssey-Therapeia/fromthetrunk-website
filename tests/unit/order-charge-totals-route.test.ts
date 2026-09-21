/**
 * P2-04 REPAIR — Route-level regression lock for the customer-charged amount.
 *
 * calculateOrderTotals is now the SINGLE source of order-charge math for the
 * supported checkout money path. These tests assert the EXACT charged +
 * persisted numbers, so any drift fails loudly.
 *
 * CRITICAL (flag OFF): the charged total and persisted (subtotal, tax, total)
 * must equal the pre-P2-04 inline-math numbers exactly. This is live prod money.
 *
 * Cases:
 *   payments.create-order  flag OFF  -> charges & persists locked numbers
 *   payments.create-order  flag ON   -> charges inclusive total (tax backed out)
 *   orders POST            disabled  -> cannot bypass payment/reservation flow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── hoisted mocks ────────────────────────────────────────────────────────────
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

const getOrderMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const listOrdersMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());

const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());
const fillMissingCheckoutProfileMock = vi.hoisted(() => vi.fn());

const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const emitAnalyticsEventMock = vi.hoisted(() => vi.fn());
const getLivePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());
const listUserCartItemsMock = vi.hoisted(() => vi.fn());
const startPaymentForOwnedCartItemsMock = vi.hoisted(() => vi.fn());
const releasePaymentCartItemsMock = vi.hoisted(() => vi.fn());
const listLapsedOwnPaymentOrderIdsMock = vi.hoisted(() => vi.fn());
const reconcilePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());

// ── module mocks ─────────────────────────────────────────────────────────────
vi.mock("@/db", () => ({
  db: { select: dbSelectMock, update: dbUpdateMock },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  getOrderByIdempotencyKey: vi.fn(),
  createOrder: createOrderMock,
  listOrders: listOrdersMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/db/queries/users", () => ({
  fillMissingCheckoutProfile: fillMissingCheckoutProfileMock,
  getOrCreateCheckoutCustomer: getOrCreateCheckoutCustomerMock,
}));

vi.mock("@/db/queries/user-cart", () => ({
  getLivePaymentHoldForOrder: getLivePaymentHoldForOrderMock,
  listLapsedOwnPaymentOrderIds: listLapsedOwnPaymentOrderIdsMock,
  listUserCartItems: listUserCartItemsMock,
  releasePaymentCartItems: releasePaymentCartItemsMock,
  startPaymentForOwnedCartItems: startPaymentForOwnedCartItemsMock,
}));

vi.mock("@/lib/payments/reconcile-expired-holds", () => ({
  reconcilePaymentHoldForOrder: reconcilePaymentHoldForOrderMock,
}));

// Only the network/SDK boundary is mocked — calculateOrderTotals stays REAL so
// the money math under test is exercised end-to-end.
vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

vi.mock("@/lib/analytics/emit", () => ({
  emitAnalyticsEvent: emitAnalyticsEventMock,
}));

// ── imports (after mocks) ──────────────────────────────────────────────────
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { CART_RESERVATION_MINUTES } from "@/lib/cart/reservation-policy";
import { createReservationToken } from "@/lib/cart/reservation-token";
import { GST_RATE } from "@/lib/config/order-pricing";
import { createRouteHarness } from "../helpers/route-harness";

// ── fixtures ─────────────────────────────────────────────────────────────────
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUBTOTAL_PAISE = 1_500_000; // 15000 INR, qty 1
const CART_RESERVED_UNTIL = new Date(Date.now() + 60 * 60 * 1000);
// The route requires an active hold to equal addedAt + 60 minutes exactly.
const CART_ADDED_AT = new Date(
  CART_RESERVED_UNTIL.getTime() - CART_RESERVATION_MINUTES * 60 * 1000,
);

const makeProduct = () => ({
  id: PRODUCT_ID,
  name: "Silk Saree",
  pricePaise: SUBTOTAL_PAISE,
  stockStatus: "reserved",
  reservedUntil: CART_RESERVED_UNTIL,
  status: "published",
});

const makeOrder = () => ({
  createdAt: new Date(),
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  placedAt: new Date(),
  razorpayOrderId: null,
  status: "pending",
  userId: null,
  items: [],
  events: [],
});

const validPaymentBody = () => ({
  items: [{ productId: PRODUCT_ID, quantity: 1 }],
  shippingAddress: {
    city: "Mumbai",
    country: "India",
    email: "buyer@example.com",
    line1: "1 Marine Drive",
    name: "Test Buyer",
    postalCode: "400001",
  },
  shippingMethod: "standard",
});

const makeSelectChain = (resolvedValue: unknown[]) => {
  const limitMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { limit: limitMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  return { from: fromMock, where: whereMock, limit: limitMock };
};

const makeUpdateChain = (resolvedValue: unknown[] = []) => {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { returning: returningMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  return { set: setMock, where: whereMock, returning: returningMock };
};

// Expected locked (flag OFF / exclusive) numbers — current config defaults.
const OFF_SHIPPING = 250 * 100; // 25000 (standard, below threshold; free shipping disabled)
const OFF_TAX = Math.round(SUBTOTAL_PAISE * GST_RATE); // 180000
const OFF_TOTAL = SUBTOTAL_PAISE + OFF_SHIPPING + OFF_TAX; // 1705000

// Expected (flag ON / inclusive) numbers — GST backed OUT, no GST on top.
const ON_TAX = Math.round((SUBTOTAL_PAISE * GST_RATE) / (1 + GST_RATE)); // 160714
const ON_TOTAL = SUBTOTAL_PAISE + OFF_SHIPPING; // 1525000

const setGstFlag = (value: "true" | "false") => {
  vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", value);
};

const paymentAuthUser = { id: "user-1", email: "buyer@example.com", role: "customer" };

// ── payments.create-order ─────────────────────────────────────────────────
describe("create-order route — charged + persisted totals", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    createOrderMock.mockReset();
    addOrderEventMock.mockReset();
    getOrCreateCheckoutCustomerMock.mockReset();
    fillMissingCheckoutProfileMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();
    getLivePaymentHoldForOrderMock.mockReset();
    listUserCartItemsMock.mockReset();
    startPaymentForOwnedCartItemsMock.mockReset();
    releasePaymentCartItemsMock.mockReset();
    listLapsedOwnPaymentOrderIdsMock.mockReset();
    reconcilePaymentHoldForOrderMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    createOrderMock.mockResolvedValue(makeOrder());
    addOrderEventMock.mockResolvedValue(undefined);
    getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "customer-1" });
    fillMissingCheckoutProfileMock.mockResolvedValue({
      nameFilled: false,
      phoneFilled: false,
    });
    getLivePaymentHoldForOrderMock.mockResolvedValue(null);
    listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([]);
    reconcilePaymentHoldForOrderMock.mockResolvedValue({ kind: "none" });
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_test123",
      short_url: "https://rzp.io/l/test123",
    });
    listUserCartItemsMock.mockResolvedValue([
      {
        addedAt: CART_ADDED_AT,
        productId: PRODUCT_ID,
        reservationToken: createReservationToken({
          productId: PRODUCT_ID,
          reservedUntil: CART_RESERVED_UNTIL,
        }),
        reservedUntil: CART_RESERVED_UNTIL,
        selectedOptions: null,
        status: "active",
      },
    ]);
    startPaymentForOwnedCartItemsMock.mockResolvedValue([
      { productId: PRODUCT_ID, slug: "silk-saree" },
    ]);
    releasePaymentCartItemsMock.mockResolvedValue({
      kind: "released",
      releasedProductIds: [PRODUCT_ID],
      releasedSlugs: ["silk-saree"],
      restoredProductIds: [],
      restoredSlugs: [],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const wireDbChains = () => {
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([makeProduct()]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock
      .mockReturnValueOnce(makeUpdateChain([{ id: PRODUCT_ID }]))
      .mockReturnValueOnce(makeUpdateChain([]));
  };

  it("flag OFF — REGRESSION LOCK: charges & persists exact pre-P2-04 numbers", async () => {
    setGstFlag("false");
    wireDbChains();

	    const { request } = createRouteHarness({
	      authUser: paymentAuthUser,
	      register: registerPaymentRoutes,
	    });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPaymentBody()),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;

    // Customer is CHARGED the locked total (Razorpay amount + response amount).
    expect(json.amountPaise).toBe(OFF_TOTAL); // 1695000
    expect(json.amount).toBe(OFF_TOTAL);
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    expect(createRazorpayPaymentLinkMock.mock.calls[0][0].amountPaise).toBe(OFF_TOTAL);

    // The order PERSISTS the same locked breakdown.
    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE); // 1500000
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING); // 15000
	    expect(persisted.taxAmountPaise).toBe(OFF_TAX); // 180000
	    expect(persisted.totalPaise).toBe(OFF_TOTAL); // 1695000
	    expect(persisted.taxRate).toBe(String(GST_RATE));
	    expect(persisted.userId).toBe(paymentAuthUser.id);
	  });

  it("flag ON — charges the inclusive total (GST backed out, none added on top)", async () => {
    setGstFlag("true");
    wireDbChains();

	    const { request } = createRouteHarness({
	      authUser: paymentAuthUser,
	      register: registerPaymentRoutes,
	    });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPaymentBody()),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;

    // Inclusive: charged total = subtotal + shipping only.
    expect(json.amountPaise).toBe(ON_TOTAL); // 1550000
    expect(createRazorpayPaymentLinkMock.mock.calls[0][0].amountPaise).toBe(ON_TOTAL);
    // Inclusive total is strictly LESS than the exclusive total (no GST on top).
    expect(ON_TOTAL).toBeLessThan(OFF_TOTAL);

    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE);
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING);
    expect(persisted.taxAmountPaise).toBe(ON_TAX); // 160714, backed out
    expect(persisted.totalPaise).toBe(ON_TOTAL); // 1515000
  });
});

// ── orders POST ────────────────────────────────────────────────────────────
describe("orders POST route — disabled for checkout security", () => {
  const authUser = { id: "user-1", email: "buyer@example.com", role: "customer" };

  const validOrderBody = () => ({
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
    shippingAddress: {
      city: "Mumbai",
      country: "India",
      email: "buyer@example.com",
      line1: "1 Marine Drive",
      name: "Test Buyer",
      postalCode: "400001",
    },
    shippingMethod: "standard",
  });

  beforeEach(() => {
    dbSelectMock.mockReset();
    createOrderMock.mockReset();
    createOrderMock.mockResolvedValue(makeOrder());
  });

  it("returns 405 and does not create an order", async () => {
    const { request } = createRouteHarness({ register: registerOrderRoutes, authUser });
    const response = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validOrderBody()),
    });

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      code: "ORDER_CREATION_DISABLED",
    });
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});
