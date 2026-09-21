/**
 * P1-19: Route-level tests for the payment-link money path.
 *
 * Scope: tests/unit/payments-route.test.ts
 * Cases covered:
 *   1. create-order happy path
 *   2. create-order reserved conflict (PRODUCT_RESERVED / 409)
 *   3. create-order AMOUNT_TOO_LOW (400)
 *   4. callback signature valid -> redirects with payment=paid
 *   5. callback signature invalid (tampered) -> redirects with payment=review
 *   6. callback expired-order (order not found) -> redirects with payment=review
 *
 * Production code is NOT modified here. If a real bug is found it is reported
 * in `bugsFound` and the test is left asserting the INTENDED behaviour.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any import that transitively touches
// the mocked module, because vi.hoisted() runs before module evaluation.
// ---------------------------------------------------------------------------

// db mocks
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbInsertMock = vi.hoisted(() => vi.fn());

// db/queries/orders mocks
const getOrderMock = vi.hoisted(() => vi.fn());
const getOrderByIdempotencyKeyMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());

// db/queries/users mocks
const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());
const fillMissingCheckoutProfileMock = vi.hoisted(() => vi.fn());

// lib/orders/complete-paid-order mock
const completePaidOrderMock = vi.hoisted(() => vi.fn());
const emitAnalyticsEventMock = vi.hoisted(() => vi.fn());

// lib/payments/razorpay mocks
const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const fetchRazorpayOrderMock = vi.hoisted(() => vi.fn());
const fetchRazorpayPaymentMock = vi.hoisted(() => vi.fn());
const fetchRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const lookupRazorpayPaymentLinkByReferenceIdMock = vi.hoisted(() => vi.fn());
const verifyPaymentLinkSignatureMock = vi.hoisted(() => vi.fn());
const verifyPaymentSignatureMock = vi.hoisted(() => vi.fn());
const isRazorpayAuthErrorMock = vi.hoisted(() => vi.fn());
const isRazorpayBadRequestMock = vi.hoisted(() => vi.fn());
const findReusablePaymentOrderMock = vi.hoisted(() => vi.fn());
const recordPaymentAttemptMock = vi.hoisted(() => vi.fn());
const getLivePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());
const listUserCartItemsMock = vi.hoisted(() => vi.fn());
const startPaymentForOwnedCartItemsMock = vi.hoisted(() => vi.fn());
const releasePaymentCartItemsMock = vi.hoisted(() => vi.fn());
const listLapsedOwnPaymentOrderIdsMock = vi.hoisted(() => vi.fn());
const reconcilePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks (registered before imports)
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  getOrderByIdempotencyKey: getOrderByIdempotencyKeyMock,
  createOrder: createOrderMock,
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

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

vi.mock("@/lib/analytics/emit", () => ({
  emitAnalyticsEvent: emitAnalyticsEventMock,
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  // Keep the real money math (calculateOrderTotals / toShippingCostPaise) and
  // only stub the network/SDK boundary, so the charged amount stays authentic.
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
    fetchRazorpayOrder: fetchRazorpayOrderMock,
    fetchRazorpayPayment: fetchRazorpayPaymentMock,
    fetchRazorpayPaymentLink: fetchRazorpayPaymentLinkMock,
    lookupRazorpayPaymentLinkByReferenceId: lookupRazorpayPaymentLinkByReferenceIdMock,
    getRazorpayPaymentLinkReferenceId: (orderId: string) =>
      `ftt_${orderId.replace(/-/g, "").slice(0, 32)}`,
    verifyPaymentLinkSignature: verifyPaymentLinkSignatureMock,
    verifyPaymentSignature: verifyPaymentSignatureMock,
    isRazorpayAuthError: isRazorpayAuthErrorMock,
    isRazorpayBadRequest: isRazorpayBadRequestMock,
    RAZORPAY_MIN_AMOUNT_PAISE: 100,
    // RAZORPAY_PAYMENT_LINK_HOLD_MINUTES is intentionally NOT overridden:
    // `...actual` carries the real payment window, so this suite can never
    // drift from lib/cart/reservation-policy.ts again.
  };
});

vi.mock("@/lib/payments/checkout-idempotency", () => ({
  findReusablePaymentOrder: findReusablePaymentOrderMock,
  recordPaymentAttempt: recordPaymentAttemptMock,
}));

// Rate-limit middleware always passes in tests
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock registrations)
// ---------------------------------------------------------------------------

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import {
  CART_RESERVATION_MINUTES,
  PAYMENT_LINK_HOLD_MINUTES,
} from "@/lib/cart/reservation-policy";
import { createReservationToken } from "@/lib/cart/reservation-token";
import { createOrderAccessToken } from "@/lib/orders/order-access-token";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const DEFAULT_CART_RESERVED_UNTIL = new Date(
  Date.now() + CART_RESERVATION_MINUTES * MINUTE_MS,
);

/** The immutable cart deadline written at Add-to-Bag: addedAt + 60 minutes. */
const addedAtFor = (cartDeadline: Date) =>
  new Date(cartDeadline.getTime() - CART_RESERVATION_MINUTES * MINUTE_MS);

/**
 * Spec deadline for a payment link, computed independently of the route:
 * min(paymentStartedAt + 10 minutes, original addedAt + 60 minutes).
 */
const specLinkDeadline = (placedAt: Date, addedAt: Date) =>
  new Date(
    Math.min(
      placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
      addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS,
    ),
  );

/** A valid one-of-one product already held by the authenticated account. */
const makeProduct = (overrides: Partial<{
  id: string;
  name: string;
  pricePaise: number;
  stockStatus: string;
  reservedUntil: Date | null;
  status: string;
  typeId: string | null;
}> = {}) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Silk Saree",
  pricePaise: 15000_00, // 15000 INR in paise — well above RAZORPAY_MIN_AMOUNT_PAISE
  stockStatus: "reserved",
  reservedUntil: DEFAULT_CART_RESERVED_UNTIL,
  status: "published",
  typeId: null,
  ...overrides,
});

/** Minimal order row returned by createOrder. */
const makeOrder = (overrides: Partial<{ id: string; placedAt: Date; razorpayOrderId: string | null; status: string; userId: string | null }> = {}) => ({
  createdAt: new Date(),
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  paymentStatus: "pending",
  placedAt: new Date(),
  razorpayOrderId: null,
  status: "pending",
  totalPaise: 1_770_000,
  userId: null,
  items: [],
  events: [],
  ...overrides,
});

const idempotencyConflict = () =>
  Object.assign(
    new Error('duplicate key value violates unique constraint "orders_idempotency_key_unique"'),
    {
      code: "23505",
      constraint: "orders_idempotency_key_unique",
    },
  );

const makeExistingAttemptOrder = (
  overrides: Record<string, unknown> = {},
) => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  cartFingerprint: null,
  createdAt: new Date(),
  events: [],
  items: [],
  paymentStatus: "pending",
  placedAt: new Date(),
  razorpayOrderId: null,
  status: "pending",
  totalPaise: 1_800_000,
  userId: AUTH_USER.id,
  ...overrides,
});

const AUTH_USER = {
  email: "customer@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "customer",
};

/**
 * A bag row as Add-to-Bag writes it. An active row's hold is its immutable
 * cart deadline, so addedAt is derived from reservedUntil unless the row was
 * already moved into a (shorter) payment window.
 */
const makeOwnedCartItem = ({
  addedAt,
  productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reservedUntil = DEFAULT_CART_RESERVED_UNTIL,
  status = "active",
}: {
  addedAt?: Date;
  productId?: string;
  reservedUntil?: Date;
  status?: string;
} = {}) => ({
  addedAt: addedAt ?? addedAtFor(reservedUntil),
  productId,
  reservationToken: createReservationToken({ productId, reservedUntil }),
  reservedUntil,
  selectedOptions: null,
  status,
});

/** Valid create-order request body. */
const validBody = () => ({
  items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
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

// ---------------------------------------------------------------------------
// Helper: build a fluent db.select() mock chain
// ---------------------------------------------------------------------------

/**
 * Returns a mock object that satisfies the Drizzle `.select()...from()...where()...limit()` chain.
 */
const makeSelectChain = (resolvedValue: unknown[]) => {
  const limitMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { limit: limitMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  return { from: fromMock, where: whereMock, limit: limitMock };
};

// ---------------------------------------------------------------------------
// Helper: build a fluent db.update() mock chain
// ---------------------------------------------------------------------------

/**
 * The route does:
 *   await db.update(X).set({...}).where(Y).returning({id: X.id})
 *   await db.update(X).set({...}).where(Y)   ← no .returning()
 */
const makeUpdateChain = (resolvedValue: unknown[] = []) => {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { returning: returningMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  return { set: setMock, where: whereMock, returning: returningMock };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("payments route — create-order", () => {
  /** Razorpay reference for the default order id bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb. */
  const REFERENCE_ID = "ftt_bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb";
  const OTHER_USER = {
    ...AUTH_USER,
    email: "other@example.com",
    id: "99999999-9999-4999-8999-999999999999",
  };

  const postCreateOrder = (
    authUser: typeof AUTH_USER = AUTH_USER,
    { attemptId }: { attemptId?: string } = {},
  ) =>
    createRouteHarness({ authUser, register: registerPaymentRoutes }).request(
      "/create-order",
      {
        body: JSON.stringify(
          attemptId ? { ...validBody(), checkoutAttemptId: attemptId } : validBody(),
        ),
        headers: {
          "Content-Type": "application/json",
          ...(attemptId ? { "Idempotency-Key": attemptId } : {}),
        },
        method: "POST",
      },
    );

  /** Razorpay's validation rejection, e.g. an expire_by it will not accept. */
  const providerValidationError = () =>
    Object.assign(new Error("expire_by must be at least 15 minutes in future"), {
      error: { code: "BAD_REQUEST_ERROR" },
      statusCode: 400,
    });

  beforeEach(() => {
    // Reset all mocks
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    getOrderMock.mockReset();
    getOrderByIdempotencyKeyMock.mockReset();
    createOrderMock.mockReset();
    addOrderEventMock.mockReset();
    getOrCreateCheckoutCustomerMock.mockReset();
    fillMissingCheckoutProfileMock.mockReset();
    completePaidOrderMock.mockReset();
    emitAnalyticsEventMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();
    fetchRazorpayOrderMock.mockReset();
    fetchRazorpayPaymentMock.mockReset();
    fetchRazorpayPaymentLinkMock.mockReset();
    lookupRazorpayPaymentLinkByReferenceIdMock.mockReset();
    verifyPaymentLinkSignatureMock.mockReset();
    verifyPaymentSignatureMock.mockReset();
    isRazorpayAuthErrorMock.mockReset();
    isRazorpayBadRequestMock.mockReset();
    findReusablePaymentOrderMock.mockReset();
    recordPaymentAttemptMock.mockReset();
    getLivePaymentHoldForOrderMock.mockReset();
    listUserCartItemsMock.mockReset();
    startPaymentForOwnedCartItemsMock.mockReset();
    releasePaymentCartItemsMock.mockReset();
    listLapsedOwnPaymentOrderIdsMock.mockReset();
    reconcilePaymentHoldForOrderMock.mockReset();

    // Default env stubs
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    // Default: createOrder and addOrderEvent succeed silently
    createOrderMock.mockResolvedValue(makeOrder());
    addOrderEventMock.mockResolvedValue(undefined);
    getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "customer-1" });
    fillMissingCheckoutProfileMock.mockResolvedValue({
      nameFilled: false,
      phoneFilled: false,
    });
    // A confirmed empty reference lookup: Razorpay holds no link yet.
    lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValue({ kind: "absent" });
    isRazorpayAuthErrorMock.mockReturnValue(false);
    isRazorpayBadRequestMock.mockReturnValue(false);
    findReusablePaymentOrderMock.mockResolvedValue(null);
    recordPaymentAttemptMock.mockResolvedValue(undefined);
    getLivePaymentHoldForOrderMock.mockResolvedValue(null);
    // No lapsed payment of the shopper's own is waiting to be reconciled.
    listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([]);
    reconcilePaymentHoldForOrderMock.mockResolvedValue({ kind: "none" });
    listUserCartItemsMock.mockResolvedValue([makeOwnedCartItem()]);
    startPaymentForOwnedCartItemsMock.mockImplementation(
      async ({ items }: { items: Array<{ productId: string }> }) =>
        items.map((item) => ({ productId: item.productId, slug: "silk-saree" })),
    );
    releasePaymentCartItemsMock.mockResolvedValue({
      kind: "released",
      releasedProductIds: [],
      releasedSlugs: ["silk-saree"],
      restoredProductIds: [],
      restoredSlugs: [],
    });
  });

  // -------------------------------------------------------------------------
  // Case 1: Happy path
  // -------------------------------------------------------------------------
  it("create-order returns 401 without an authenticated session", async () => {
    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(401);
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("create-order happy path returns orderId, paymentLinkUrl, and razorpayKeyId", async () => {
    const product = makeProduct();
    const order = makeOrder();
    createOrderMock.mockResolvedValue(order);

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const reserveUpdateChain = makeUpdateChain([{ id: product.id }]);
    const orderUpdateChain = makeUpdateChain([]);

    dbUpdateMock
      .mockReturnValueOnce(reserveUpdateChain)
      .mockReturnValueOnce(orderUpdateChain);

    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_test123",
      short_url: "https://rzp.io/l/test123",
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);

    const json = await response.json() as Record<string, unknown>;
    expect(typeof json.orderId).toBe("string");
    expect(json.paymentLinkId).toBe("plink_test123");
    expect(json.paymentLinkUrl).toBe("https://rzp.io/l/test123");
    expect(json.currency).toBe("INR");
    expect(json.razorpayKeyId).toBe("rzp_test_key_id");
    expect(typeof json.amountPaise).toBe("number");
    expect((json.amountPaise as number)).toBeGreaterThan(0);
    expect(typeof json.orderAccessToken).toBe("string");
    expect((json.orderAccessToken as string).length).toBeGreaterThan(0);

    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingEmail: "buyer@example.com",
        userId: AUTH_USER.id,
      })
    );

    // Test 9: the DB hold and the provider link share one deadline, ten
    // minutes after payment start because the cart hour has barely begun.
    const linkDeadline = specLinkDeadline(
      order.placedAt,
      addedAtFor(DEFAULT_CART_RESERVED_UNTIL),
    );
    expect(linkDeadline.getTime()).toBe(
      order.placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
    );
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            paymentReservationToken: createReservationToken({
              productId: product.id,
              reservedUntil: linkDeadline,
            }),
            productId: product.id,
          }),
        ],
        orderId: order.id,
        reservedUntil: linkDeadline,
        userId: AUTH_USER.id,
      }),
    );
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ expireBy: linkDeadline }),
    );
  });

  it("caps the payment deadline at the original cart deadline when payment starts 55 minutes after add", async () => {
    const addedAt = new Date(Date.now() - 55 * MINUTE_MS);
    const cartDeadline = new Date(
      addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS,
    );
    const product = makeProduct({ reservedUntil: cartDeadline });
    const order = makeOrder({ placedAt: new Date() });
    listUserCartItemsMock.mockResolvedValue([
      makeOwnedCartItem({ addedAt, reservedUntil: cartDeadline }),
    ]);
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createOrderMock.mockResolvedValue(order);
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_capped",
      short_url: "https://rzp.io/l/capped",
    });

    const response = await postCreateOrder();

    expect(response.status).toBe(200);
    // Five minutes of cart time remain, so the link may not take its ten.
    expect(specLinkDeadline(order.placedAt, addedAt)).toEqual(cartDeadline);
    expect(cartDeadline.getTime()).toBeLessThan(
      order.placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
    );
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ reservedUntil: cartDeadline }),
    );
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ expireBy: cartDeadline }),
    );
  });

  it("gives the payment claim a clock no earlier than the order's own payment start", async () => {
    // Required test 9 against the real route. A request takes time, so the
    // order's placedAt is stamped after the handler's first clock. The claim
    // must never judge the ten-minute cap against that earlier instant, or a
    // checkout the ten-minute window binds could never claim its own saree.
    const requestStartedAt = new Date("2026-09-11T10:05:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(requestStartedAt);
    try {
      // Added five minutes ago, so ten minutes from payment start binds.
      const addedAt = new Date(requestStartedAt.getTime() - 5 * MINUTE_MS);
      const cartDeadline = new Date(
        addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS,
      );
      listUserCartItemsMock.mockResolvedValue([
        makeOwnedCartItem({ addedAt, reservedUntil: cartDeadline }),
      ]);
      dbSelectMock
        .mockReturnValueOnce(makeSelectChain([makeProduct({ reservedUntil: cartDeadline })]))
        .mockImplementationOnce(() => {
          // The pending-count query runs after the line checks and before
          // createOrder stamps placedAt. The clock moves on meanwhile.
          vi.setSystemTime(requestStartedAt.getTime() + 40);
          return makeSelectChain([{ c: 0 }]);
        });
      dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
      let createdOrder: ReturnType<typeof makeOrder> | undefined;
      createOrderMock.mockImplementation(async (input: { placedAt: Date }) => {
        createdOrder = makeOrder({ placedAt: input.placedAt });
        return createdOrder;
      });
      createRazorpayPaymentLinkMock.mockResolvedValue({
        id: "plink_claim_clock",
        short_url: "https://rzp.io/l/claim-clock",
      });

      const response = await postCreateOrder();

      expect(response.status).toBe(200);
      expect(createdOrder?.placedAt.getTime()).toBe(requestStartedAt.getTime() + 40);
      const placedAt = createdOrder!.placedAt;
      expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledTimes(1);
      const [claim] = startPaymentForOwnedCartItemsMock.mock.calls[0]! as [
        { now: Date; reservedUntil: Date },
      ];
      expect(claim.now.getTime()).toBeGreaterThanOrEqual(placedAt.getTime());
      expect(claim.reservedUntil.getTime()).toBeLessThanOrEqual(
        claim.now.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
      );
      expect(claim.reservedUntil).toEqual(specLinkDeadline(placedAt, addedAt));
      expect(claim.reservedUntil.getTime()).toBe(
        placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fills the owner's missing profile from a non-gift checkout", async () => {
    const product = makeProduct();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_profile",
      short_url: "https://rzp.io/l/profile",
    });

    const response = await postCreateOrder();

    expect(response.status).toBe(200);
    expect(fillMissingCheckoutProfileMock).toHaveBeenCalledTimes(1);
    expect(fillMissingCheckoutProfileMock).toHaveBeenCalledWith({
      name: "Test Buyer",
      now: expect.any(Date),
      phone: undefined,
      userId: AUTH_USER.id,
    });
  });

  it("rejects a sold product before the mutable blouse exception", async () => {
    const typeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const product = makeProduct({ stockStatus: "sold", typeId });
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ id: typeId, slug: "blouse" }]));
    listUserCartItemsMock.mockResolvedValueOnce([
      {
        addedAt: new Date(),
        productId: product.id,
        reservationToken: null,
        reservedUntil: null,
        selectedOptions: { size: "M" },
        status: "active",
      },
    ]);

    const { request } = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PRODUCT_SOLD" });
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous provider-create hold intact for reference recovery", async () => {
    const product = makeProduct();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(
      new Error("provider response timed out"),
    );
    isRazorpayAuthErrorMock.mockReturnValueOnce(false);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-provider-unknown",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-provider-unknown",
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "RAZORPAY_PAYMENT_LINK_CREATE_UNKNOWN",
    });
    expect(response.headers.get("Retry-After")).toBe("2");
    // An empty lookup alone does not make a timeout definitive: the link may
    // simply not be listed yet.
    expect(lookupRazorpayPaymentLinkByReferenceIdMock).toHaveBeenCalledWith(REFERENCE_ID);
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      expect.any(String),
      "Razorpay payment link creation outcome unknown",
      "pending",
      { releaseDeferred: true, retryable: true },
    );
  });

  it("recovers an ambiguous provider-create response by its unique reference", async () => {
    const product = makeProduct();
    const order = makeOrder();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createOrderMock.mockResolvedValueOnce(order);
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(
      new Error("provider response timed out"),
    );
    isRazorpayAuthErrorMock.mockReturnValueOnce(false);
    lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValueOnce({
      kind: "found",
      paymentLink: {
        amount: order.totalPaise,
        currency: "INR",
        id: "plink_recovered_after_create",
        reference_id: REFERENCE_ID,
        short_url: "https://rzp.io/l/recovered-after-create",
        status: "created",
      },
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      orderId: order.id,
      paymentLinkId: "plink_recovered_after_create",
      paymentLinkUrl: "https://rzp.io/l/recovered-after-create",
    });
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
  });

  it("releases the exact payment claim after a definitive provider auth rejection", async () => {
    // Added 40 minutes ago: twenty minutes of the original cart hour remain.
    const cartDeadline = new Date(Date.now() + 20 * MINUTE_MS);
    const product = makeProduct({ reservedUntil: cartDeadline });
    const order = makeOrder();
    listUserCartItemsMock.mockResolvedValue([
      makeOwnedCartItem({ reservedUntil: cartDeadline }),
    ]);
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    createOrderMock.mockResolvedValueOnce(order);
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { statusCode: 401 }),
    );
    isRazorpayAuthErrorMock.mockReturnValueOnce(true);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "RAZORPAY_AUTH_FAILED" });

    // Test 10: the unpaid attempt restores only the original cart deadline
    // (addedAt + 60 minutes), never a fresh hour from now.
    const linkDeadline = specLinkDeadline(order.placedAt, addedAtFor(cartDeadline));
    expect(releasePaymentCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            cartDeadline,
            paymentReservationToken: createReservationToken({
              productId: product.id,
              reservedUntil: linkDeadline,
            }),
            productId: product.id,
            restorationReservationToken: createReservationToken({
              productId: product.id,
              reservedUntil: cartDeadline,
            }),
          },
        ],
        orderId: order.id,
        reservedUntil: linkDeadline,
        userId: AUTH_USER.id,
      }),
    );
    const [{ items }] = releasePaymentCartItemsMock.mock.calls[0] as [
      { items: Array<{ cartDeadline: Date }> },
    ];
    expect(items[0]!.cartDeadline.getTime()).toBeLessThan(
      Date.now() + (CART_RESERVATION_MINUTES - 30) * MINUTE_MS,
    );
  });

  it("keeps the checkout attempt retryable if auth-rejection cleanup is not exact", async () => {
    const product = makeProduct();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { statusCode: 401 }),
    );
    isRazorpayAuthErrorMock.mockReturnValueOnce(true);
    releasePaymentCartItemsMock.mockResolvedValueOnce({
      kind: "ownership_conflict",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
  });

  it("unwinds the claim to the original cart deadline when a rejection's reference lookup proves no link exists", async () => {
    const cartDeadline = new Date(Date.now() + 25 * MINUTE_MS);
    const product = makeProduct({ reservedUntil: cartDeadline });
    const order = makeOrder();
    listUserCartItemsMock.mockResolvedValue([
      makeOwnedCartItem({ reservedUntil: cartDeadline }),
    ]);
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    createOrderMock.mockResolvedValue(order);
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(providerValidationError());
    isRazorpayBadRequestMock.mockReturnValue(true);

    const response = await postCreateOrder();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "RAZORPAY_PAYMENT_LINK_REJECTED",
    });
    expect(lookupRazorpayPaymentLinkByReferenceIdMock).toHaveBeenCalledWith(REFERENCE_ID);
    const linkDeadline = specLinkDeadline(order.placedAt, addedAtFor(cartDeadline));
    expect(releasePaymentCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            cartDeadline,
            productId: product.id,
            restorationReservationToken: createReservationToken({
              productId: product.id,
              reservedUntil: cartDeadline,
            }),
          }),
        ],
        orderId: order.id,
        reservedUntil: linkDeadline,
        userId: AUTH_USER.id,
      }),
    );
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("reuses the open link a rejected duplicate reference proves already exists", async () => {
    const product = makeProduct();
    const order = makeOrder();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createOrderMock.mockResolvedValue(order);
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(providerValidationError());
    isRazorpayBadRequestMock.mockReturnValue(true);
    lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValueOnce({
      kind: "found",
      paymentLink: {
        amount: order.totalPaise,
        currency: "INR",
        id: "plink_already_created",
        reference_id: REFERENCE_ID,
        short_url: "https://rzp.io/l/already-created",
        status: "created",
      },
    });

    const response = await postCreateOrder();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      paymentLinkId: "plink_already_created",
      paymentLinkUrl: "https://rzp.io/l/already-created",
    });
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an ambiguous listing", () =>
      lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValueOnce({
        kind: "ambiguous",
      })],
    ["a failed lookup", () =>
      lookupRazorpayPaymentLinkByReferenceIdMock.mockRejectedValueOnce(
        new Error("lookup timed out"),
      )],
    ["a link that is no longer open", () =>
      lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValueOnce({
        kind: "found",
        paymentLink: {
          amount: 1_770_000,
          currency: "INR",
          id: "plink_expired",
          reference_id: REFERENCE_ID,
          short_url: "https://rzp.io/l/expired",
          status: "expired",
        },
      })],
  ])("keeps the hold protected when a provider rejection meets %s", async (_label, arrangeLookup) => {
    const product = makeProduct();
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    createRazorpayPaymentLinkMock.mockRejectedValueOnce(providerValidationError());
    isRazorpayBadRequestMock.mockReturnValue(true);
    arrangeLookup();

    const response = await postCreateOrder();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "RAZORPAY_PAYMENT_LINK_CREATE_UNKNOWN",
    });
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("stores a server-computed cart fingerprint for checkout attempts", async () => {
    const product = makeProduct();

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    dbUpdateMock
      .mockReturnValueOnce(makeUpdateChain([{ id: product.id, slug: "silk-saree" }]))
      .mockReturnValueOnce(makeUpdateChain([]));

    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_attempt",
      short_url: "https://rzp.io/l/attempt",
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-server-fingerprint",
      },
      body: JSON.stringify({
        ...validBody(),
        cartFingerprint: "client-forged-fingerprint",
        checkoutAttemptId: "attempt-server-fingerprint",
      }),
    });

    expect(response.status).toBe(200);
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    const createArg = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.idempotencyKey).toBe("attempt-server-fingerprint");
    expect(createArg.cartFingerprint).not.toBe("client-forged-fingerprint");
    expect(String(createArg.cartFingerprint)).toMatch(/^[a-f0-9]{64}$/);
    expect(recordPaymentAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-server-fingerprint",
        cartFingerprint: createArg.cartFingerprint,
      }),
    );
  });

  it("resumes the same pending order when its first link response was never stored", async () => {
    const product = makeProduct();
    // The attempt started three minutes ago; resuming must keep that start.
    const placedAt = new Date(Date.now() - 3 * MINUTE_MS);
    const existingOrder = makeExistingAttemptOrder({ placedAt, razorpayOrderId: null });

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]));

    getOrderByIdempotencyKeyMock.mockResolvedValueOnce(existingOrder);
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createRazorpayPaymentLinkMock.mockResolvedValueOnce({
      amount: 1_770_000,
      currency: "INR",
      id: "plink_resumed",
      reference_id: REFERENCE_ID,
      short_url: "https://rzp.io/l/resumed",
      status: "created",
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-in-progress",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-in-progress",
      }),
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.orderId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(json.paymentLinkId).toBe("plink_resumed");
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    // Only a confirmed empty lookup allows the link to be created again.
    expect(lookupRazorpayPaymentLinkByReferenceIdMock).toHaveBeenCalledWith(REFERENCE_ID);

    // Test 9: a retry never extends the window. The deadline is derived from
    // the persisted start, not from this request's clock.
    const linkDeadline = specLinkDeadline(
      placedAt,
      addedAtFor(DEFAULT_CART_RESERVED_UNTIL),
    );
    expect(linkDeadline.getTime()).toBe(
      placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
    );
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: existingOrder.id,
        reservedUntil: linkDeadline,
      }),
    );
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ expireBy: linkDeadline }),
    );
  });

  it("answers in progress, not resume, when the reference lookup for an unlinked attempt fails", async () => {
    const product = makeProduct();
    dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));
    getOrderByIdempotencyKeyMock.mockResolvedValueOnce(
      makeExistingAttemptOrder({ razorpayOrderId: null }),
    );
    lookupRazorpayPaymentLinkByReferenceIdMock.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );

    const response = await postCreateOrder(AUTH_USER, {
      attemptId: "attempt-lookup-failed",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    expect(response.headers.get("Retry-After")).toBe("2");
    // Creating the same reference again could open a second payable link.
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    expect(startPaymentForOwnedCartItemsMock).not.toHaveBeenCalled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("persists a provider link recovered by the order reference before reusing it", async () => {
    const product = makeProduct();
    const existingOrder = makeExistingAttemptOrder({ razorpayOrderId: null });
    const recoveredLink = {
      amount: existingOrder.totalPaise,
      currency: "INR",
      id: "plink_recovered",
      reference_id: REFERENCE_ID,
      short_url: "https://rzp.io/l/recovered",
      status: "created",
    };

    dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));
    getOrderByIdempotencyKeyMock.mockResolvedValueOnce(existingOrder);
    lookupRazorpayPaymentLinkByReferenceIdMock.mockResolvedValueOnce({
      kind: "found",
      paymentLink: recoveredLink,
    });
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([{ id: existingOrder.id }]));

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-recover-provider-link",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-recover-provider-link",
      }),
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.reused).toBe(true);
    expect(json.paymentLinkId).toBe(recoveredLink.id);
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      existingOrder.id,
      "Razorpay payment link recovered",
      "pending",
      {
        paymentLinkId: recoveredLink.id,
        paymentLinkUrl: recoveredLink.short_url,
      },
    );
  });

  it.each([
    ["ten minutes after its original start", 20],
    ["the original cart deadline", 55],
  ])(
    "reuses the exact payment_pending claim when the same attempt resumes, capped at %s",
    async (_label, minutesSinceAdd) => {
      const placedAt = new Date(Date.now() - 1_000);
      const addedAt = new Date(Date.now() - minutesSinceAdd * MINUTE_MS);
      const paymentReservedUntil = specLinkDeadline(placedAt, addedAt);
      const product = makeProduct({ reservedUntil: paymentReservedUntil });
      const cartItem = makeOwnedCartItem({
        addedAt,
        productId: product.id,
        reservedUntil: paymentReservedUntil,
        status: "payment_pending",
      });
      const existingOrder = makeExistingAttemptOrder({
        items: [{ productId: product.id }],
        placedAt,
        razorpayOrderId: null,
      });

      listUserCartItemsMock.mockResolvedValueOnce([cartItem]);
      dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));
      getOrderByIdempotencyKeyMock.mockResolvedValueOnce(existingOrder);
      dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
      createRazorpayPaymentLinkMock.mockResolvedValueOnce({
        amount: 1_770_000,
        currency: "INR",
        id: "plink_payment_pending_resume",
        reference_id: REFERENCE_ID,
        short_url: "https://rzp.io/l/payment-pending-resume",
        status: "created",
      });

      const response = await postCreateOrder(AUTH_USER, {
        attemptId: "attempt-payment-pending-resume",
      });

      expect(response.status).toBe(200);
      if (minutesSinceAdd === 55) {
        expect(paymentReservedUntil).toEqual(
          new Date(addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS),
        );
      } else {
        expect(paymentReservedUntil).toEqual(
          new Date(placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS),
        );
      }
      expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              currentReservationToken: cartItem.reservationToken,
              paymentReservationToken: cartItem.reservationToken,
              productId: product.id,
            }),
          ],
          orderId: existingOrder.id,
          reservedUntil: paymentReservedUntil,
          userId: AUTH_USER.id,
        }),
      );
      expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ expireBy: paymentReservedUntil }),
      );
    },
  );

  it("returns the existing same-user link when the same attempt already completed", async () => {
    const product = makeProduct();

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    const existingOrder = makeExistingAttemptOrder({
      events: [
        {
          payload: { paymentLinkUrl: "https://rzp.io/l/reuse" },
        },
      ],
      items: [{ productId: product.id }],
      razorpayOrderId: "plink_reuse",
    });
    getOrderByIdempotencyKeyMock
      .mockResolvedValueOnce(existingOrder)
      .mockResolvedValueOnce(existingOrder);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-reuse",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-reuse",
      }),
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.reused).toBe(true);
    expect(json.paymentLinkId).toBe("plink_reuse");
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("reuses the existing same-attempt link when that attempt already reserved the product", async () => {
    const placedAt = new Date(Date.now() - 1_000);
    const addedAt = new Date(Date.now() - 20 * MINUTE_MS);
    const paymentReservedUntil = specLinkDeadline(placedAt, addedAt);
    const product = makeProduct({
      reservedUntil: paymentReservedUntil,
      stockStatus: "reserved",
    });
    const existingOrder = makeExistingAttemptOrder({
      events: [
        {
          payload: { paymentLinkUrl: "https://rzp.io/l/reuse" },
        },
      ],
      items: [{ productId: product.id }],
      placedAt,
      razorpayOrderId: "plink_reuse",
    });
    listUserCartItemsMock.mockResolvedValueOnce([
      makeOwnedCartItem({
        addedAt,
        productId: product.id,
        reservedUntil: paymentReservedUntil,
        status: "payment_pending",
      }),
    ]);

    dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));

    getOrderByIdempotencyKeyMock.mockResolvedValueOnce(existingOrder);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-reuse-reserved",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-reuse-reserved",
      }),
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.reused).toBe(true);
    expect(json.paymentLinkId).toBe("plink_reuse");
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // The shopper's own payment_pending line (test 3, checkout side)
  // -------------------------------------------------------------------------
  const ownPaymentPendingLine = (placedAt: Date, addedAt: Date) => {
    const paymentReservedUntil = specLinkDeadline(placedAt, addedAt);
    const product = makeProduct({ reservedUntil: paymentReservedUntil });
    listUserCartItemsMock.mockResolvedValue([
      makeOwnedCartItem({
        addedAt,
        productId: product.id,
        reservedUntil: paymentReservedUntil,
        status: "payment_pending",
      }),
    ]);
    dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));
    return product;
  };

  const expectPaymentInProgress = async (response: Response, productId: string) => {
    expect(response.status).toBe(409);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toMatchObject({
      code: "PAYMENT_IN_PROGRESS",
      details: { productId },
    });
    // Never an expiry or another shopper's claim, which the client removes.
    expect(json.code).not.toMatch(/^RESERVATION_|^PRODUCT_/);
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(startPaymentForOwnedCartItemsMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  };

  it("answers PAYMENT_IN_PROGRESS when another attempt meets the shopper's own open payment", async () => {
    const product = ownPaymentPendingLine(
      new Date(Date.now() - 2 * MINUTE_MS),
      new Date(Date.now() - 20 * MINUTE_MS),
    );
    // The new attempt id owns no order, so it is not the claimed attempt.
    getOrderByIdempotencyKeyMock.mockResolvedValue(null);

    const response = await postCreateOrder(AUTH_USER, { attemptId: "attempt-new" });

    await expectPaymentInProgress(response, product.id);
  });

  it("answers PAYMENT_IN_PROGRESS for an open payment when no attempt id is sent", async () => {
    const product = ownPaymentPendingLine(
      new Date(Date.now() - 2 * MINUTE_MS),
      new Date(Date.now() - 20 * MINUTE_MS),
    );

    const response = await postCreateOrder();

    await expectPaymentInProgress(response, product.id);
  });

  it("keeps an expired but unreconciled payment protected instead of reporting it expired", async () => {
    // Started fifteen minutes ago, so the ten-minute link deadline has passed
    // while the product is still reserved to it.
    const placedAt = new Date(Date.now() - 15 * MINUTE_MS);
    const product = ownPaymentPendingLine(
      placedAt,
      new Date(Date.now() - 20 * MINUTE_MS),
    );
    getOrderByIdempotencyKeyMock.mockResolvedValue(
      makeExistingAttemptOrder({
        items: [{ productId: product.id }],
        placedAt,
        razorpayOrderId: "plink_still_created",
      }),
    );

    const response = await postCreateOrder(AUTH_USER, {
      attemptId: "attempt-same-but-lapsed",
    });

    await expectPaymentInProgress(response, product.id);
  });

  // -------------------------------------------------------------------------
  // The shopper's own lapsed payment is reconciled inline first (tests 9, 10)
  // -------------------------------------------------------------------------
  const LAPSED_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it.each([
    ["the full payment window after the new start", 20],
    ["the original cart deadline", 55],
  ])(
    "reconciles a lapsed own payment first and caps the restored line's new link at %s",
    async (_label, minutesSinceAdd) => {
      const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const requestedAt = Date.now();
      const addedAt = new Date(requestedAt - minutesSinceAdd * MINUTE_MS);
      const cartDeadline = new Date(
        addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS,
      );
      // The earlier attempt started one minute past the payment window, so its
      // link deadline has just passed. Derived from the constant, never a
      // literal, so the fixture cannot drift from the policy.
      const lapsedPaymentDeadline = specLinkDeadline(
        new Date(requestedAt - (PAYMENT_LINK_HOLD_MINUTES + 1) * MINUTE_MS),
        addedAt,
      );
      expect(lapsedPaymentDeadline.getTime()).toBeLessThan(requestedAt);

      // Until reconciliation runs, the bag and the product still show the
      // lapsed payment. Afterwards the line is active until its cart deadline.
      let restored = false;
      listUserCartItemsMock.mockImplementation(async () => [
        restored
          ? makeOwnedCartItem({ addedAt, productId, reservedUntil: cartDeadline })
          : makeOwnedCartItem({
              addedAt,
              productId,
              reservedUntil: lapsedPaymentDeadline,
              status: "payment_pending",
            }),
      ]);
      dbSelectMock
        .mockImplementationOnce(() =>
          makeSelectChain([
            makeProduct({
              reservedUntil: restored ? cartDeadline : lapsedPaymentDeadline,
            }),
          ]),
        )
        .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([LAPSED_ORDER_ID]);
      reconcilePaymentHoldForOrderMock.mockImplementation(async () => {
        restored = true;
        return {
          kind: "released",
          releasedProductIds: [],
          releasedSlugs: [],
          restoredProductIds: [productId],
          restoredSlugs: ["silk-saree"],
        };
      });
      dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
      const order = makeOrder({ placedAt: new Date() });
      createOrderMock.mockResolvedValue(order);
      createRazorpayPaymentLinkMock.mockResolvedValue({
        id: "plink_after_restore",
        short_url: "https://rzp.io/l/after-restore",
      });

      const response = await postCreateOrder();

      expect(response.status).toBe(200);
      expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        productIds: [productId],
        userId: AUTH_USER.id,
      });
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledTimes(1);
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        orderId: LAPSED_ORDER_ID,
      });
      expect(
        reconcilePaymentHoldForOrderMock.mock.invocationCallOrder[0],
      ).toBeLessThan(createOrderMock.mock.invocationCallOrder[0]!);

      // Tests 9 and 10: the new link takes at most one payment window from its
      // own start and never passes the original addedAt + 60 minutes.
      const linkDeadline = specLinkDeadline(order.placedAt, addedAt);
      expect(linkDeadline.getTime()).toBeLessThanOrEqual(cartDeadline.getTime());
      if (minutesSinceAdd === 55) {
        expect(linkDeadline).toEqual(cartDeadline);
      } else {
        expect(linkDeadline.getTime()).toBe(
          order.placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
        );
      }
      expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              currentReservationToken: createReservationToken({
                productId,
                reservedUntil: cartDeadline,
              }),
              paymentReservationToken: createReservationToken({
                productId,
                reservedUntil: linkDeadline,
              }),
              productId,
            }),
          ],
          reservedUntil: linkDeadline,
          userId: AUTH_USER.id,
        }),
      );
      expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ expireBy: linkDeadline }),
      );
    },
  );

  it.each([
    ["throws", () =>
      reconcilePaymentHoldForOrderMock.mockRejectedValue(
        new Error("provider lookup timed out"),
      )],
    ["defers", () =>
      reconcilePaymentHoldForOrderMock.mockResolvedValue({
        kind: "deferred",
        reason: "PAYMENT_LINK_NOT_TERMINAL",
      })],
  ])(
    "still answers PAYMENT_IN_PROGRESS with no provider call when inline reconciliation %s",
    async (_label, arrangeReconciliation) => {
      // Started fifteen minutes ago, so the ten-minute link deadline has passed.
      const product = ownPaymentPendingLine(
        new Date(Date.now() - 15 * MINUTE_MS),
        new Date(Date.now() - 20 * MINUTE_MS),
      );
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([LAPSED_ORDER_ID]);
      arrangeReconciliation();

      const response = await postCreateOrder();

      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        orderId: LAPSED_ORDER_ID,
      });
      // The bag is read again afterwards and still shows the protected payment.
      expect(listUserCartItemsMock).toHaveBeenCalledTimes(2);
      await expectPaymentInProgress(response, product.id);
      expect(lookupRazorpayPaymentLinkByReferenceIdMock).not.toHaveBeenCalled();
    },
  );

  it("answers PRODUCT_SOLD when inline reconciliation completes a captured payment", async () => {
    const lapsedPaymentDeadline = new Date(Date.now() - MINUTE_MS);
    let completed = false;
    listUserCartItemsMock.mockImplementation(async () =>
      completed
        ? []
        : [
            makeOwnedCartItem({
              addedAt: new Date(Date.now() - 20 * MINUTE_MS),
              reservedUntil: lapsedPaymentDeadline,
              status: "payment_pending",
            }),
          ],
    );
    dbSelectMock.mockImplementationOnce(() =>
      makeSelectChain([
        makeProduct(
          completed
            ? { reservedUntil: null, stockStatus: "sold" }
            : { reservedUntil: lapsedPaymentDeadline },
        ),
      ]),
    );
    listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([LAPSED_ORDER_ID]);
    reconcilePaymentHoldForOrderMock.mockImplementation(async () => {
      completed = true;
      return { kind: "completed" };
    });

    const response = await postCreateOrder();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PRODUCT_SOLD" });
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(startPaymentForOwnedCartItemsMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "is free again, since the shopper's own hold ended,",
      "RESERVATION_EXPIRED",
      { reservedUntil: null, stockStatus: "available" },
    ],
    [
      "another shopper has claimed since",
      "PRODUCT_RESERVED",
      { reservedUntil: new Date(Date.now() + 50 * MINUTE_MS), stockStatus: "reserved" },
    ],
  ])(
    "after inline reconciliation releases a line past its cart deadline, a piece that %s answers %s",
    async (_label, expectedCode, productAfterRelease) => {
      const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      // Added 65 minutes ago. Its payment was capped at the cart deadline,
      // which has passed, so reconciliation releases the piece and deletes
      // the bag row instead of restoring it.
      const addedAt = new Date(Date.now() - 65 * MINUTE_MS);
      const cartDeadline = new Date(
        addedAt.getTime() + CART_RESERVATION_MINUTES * MINUTE_MS,
      );
      let released = false;
      listUserCartItemsMock.mockImplementation(async () =>
        released
          ? []
          : [
              makeOwnedCartItem({
                addedAt,
                productId,
                reservedUntil: cartDeadline,
                status: "payment_pending",
              }),
            ],
      );
      dbSelectMock.mockImplementationOnce(() =>
        makeSelectChain([
          makeProduct(released ? productAfterRelease : { reservedUntil: cartDeadline }),
        ]),
      );
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([LAPSED_ORDER_ID]);
      reconcilePaymentHoldForOrderMock.mockImplementation(async () => {
        released = true;
        return {
          kind: "released",
          releasedProductIds: [productId],
          releasedSlugs: ["silk-saree"],
          restoredProductIds: [],
          restoredSlugs: [],
        };
      });

      const response = await postCreateOrder();

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: expectedCode,
        details: { productId },
      });
      // The bag was read again after the release and no longer has the line.
      expect(listUserCartItemsMock).toHaveBeenCalledTimes(2);
      // Refused before anything is created: no order, no claim, no new link.
      expect(createOrderMock).not.toHaveBeenCalled();
      expect(startPaymentForOwnedCartItemsMock).not.toHaveBeenCalled();
      expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
      expect(lookupRazorpayPaymentLinkByReferenceIdMock).not.toHaveBeenCalled();
    },
  );

  it("never reconciles when the shopper's open payment has not lapsed", async () => {
    const product = ownPaymentPendingLine(
      new Date(Date.now() - 2 * MINUTE_MS),
      new Date(Date.now() - 20 * MINUTE_MS),
    );

    const response = await postCreateOrder();

    expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledWith({
      now: expect.any(Date),
      productIds: [product.id],
      userId: AUTH_USER.id,
    });
    expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    expect(listUserCartItemsMock).toHaveBeenCalledTimes(1);
    await expectPaymentInProgress(response, product.id);
  });

  it("does not look for lapsed payments when no checkout line is payment_pending", async () => {
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([makeProduct()]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_active_line",
      short_url: "https://rzp.io/l/active-line",
    });

    const response = await postCreateOrder();

    expect(response.status).toBe(200);
    expect(listLapsedOwnPaymentOrderIdsMock).not.toHaveBeenCalled();
    expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    expect(listUserCartItemsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the payment protected when the lapsed-payment lookup itself fails", async () => {
    const product = ownPaymentPendingLine(
      new Date(Date.now() - 15 * MINUTE_MS),
      new Date(Date.now() - 20 * MINUTE_MS),
    );
    listLapsedOwnPaymentOrderIdsMock.mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await postCreateOrder();

    expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    await expectPaymentInProgress(response, product.id);
  });

  it("reconciles at most three lapsed orders in one request", async () => {
    const product = ownPaymentPendingLine(
      new Date(Date.now() - 15 * MINUTE_MS),
      new Date(Date.now() - 20 * MINUTE_MS),
    );
    listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([
      "c1111111-1111-4111-8111-111111111111",
      "c2222222-2222-4222-8222-222222222222",
      "c3333333-3333-4333-8333-333333333333",
      "c4444444-4444-4444-8444-444444444444",
    ]);
    reconcilePaymentHoldForOrderMock.mockResolvedValue({
      kind: "deferred",
      reason: "PAYMENT_LINK_NOT_TERMINAL",
    });

    const response = await postCreateOrder();

    expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledTimes(3);
    await expectPaymentInProgress(response, product.id);
  });

  it("does not leak a payment link across users or cart fingerprints", async () => {
    const product = makeProduct();

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([product]));

    createOrderMock
      .mockRejectedValueOnce(idempotencyConflict())
      .mockRejectedValueOnce(idempotencyConflict());
    const crossUserOrder = makeExistingAttemptOrder({
      events: [{ payload: { paymentLinkUrl: "https://rzp.io/l/private" } }],
      items: [{ productId: product.id }],
      razorpayOrderId: "plink_private",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    const changedCartOrder = makeExistingAttemptOrder({
      cartFingerprint: "different-server-fingerprint",
      events: [{ payload: { paymentLinkUrl: "https://rzp.io/l/private" } }],
      items: [{ productId: product.id }],
      razorpayOrderId: "plink_private",
    });
    getOrderByIdempotencyKeyMock
      .mockResolvedValueOnce(crossUserOrder)
      .mockResolvedValueOnce(changedCartOrder);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const crossUserResponse = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-cross-user",
      },
      body: JSON.stringify({
        ...validBody(),
        checkoutAttemptId: "attempt-cross-user",
      }),
    });
    const changedCartResponse = await request("/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "attempt-cart-changed",
      },
      body: JSON.stringify({
        ...validBody(),
        cartFingerprint: "client-forged-fingerprint",
        checkoutAttemptId: "attempt-cart-changed",
      }),
    });

    const crossUserJson = await crossUserResponse.json() as Record<string, unknown>;
    const changedCartJson = await changedCartResponse.json() as Record<string, unknown>;
    expect(crossUserResponse.status).toBe(409);
    expect(crossUserJson.paymentLinkUrl).toBeUndefined();
    expect(crossUserJson.code).toBe("CHECKOUT_IN_PROGRESS");
    expect(changedCartResponse.status).toBe(409);
    expect(changedCartJson.paymentLinkUrl).toBeUndefined();
    expect(changedCartJson.code).toBe("CHECKOUT_CART_CHANGED");
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it.each(["paid", "failed"] as const)(
    "does not reuse a %s idempotent order",
    async (paymentStatus) => {
      const product = makeProduct();

      dbSelectMock
        .mockReturnValueOnce(makeSelectChain([product]))
        .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

      createOrderMock.mockRejectedValueOnce(idempotencyConflict());
      const existingOrder = makeExistingAttemptOrder({
        events: [{ payload: { paymentLinkUrl: "https://rzp.io/l/terminal" } }],
        items: [{ productId: product.id }],
        paymentStatus,
        razorpayOrderId: "plink_terminal",
      });
      getOrderByIdempotencyKeyMock
        .mockResolvedValueOnce(existingOrder)
        .mockResolvedValueOnce(existingOrder);

      const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
      const response = await request("/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `attempt-${paymentStatus}`,
        },
        body: JSON.stringify({
          ...validBody(),
          checkoutAttemptId: `attempt-${paymentStatus}`,
        }),
      });

      const json = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(409);
      expect(json.code).toBe("CHECKOUT_ATTEMPT_NOT_REUSABLE");
      expect(json.paymentLinkUrl).toBeUndefined();
      expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    },
  );

  it("blocks create-order on localhost when the public Razorpay key is live", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_live_key_id");

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(403);
    expect(json.code).toBe("PAYMENT_HOST_NOT_ALLOWED");
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 2: Reserved conflict — PRODUCT_RESERVED / 409
  // -------------------------------------------------------------------------
  it("create-order returns PRODUCT_RESERVED (409) when item is reserved by another buyer", async () => {
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
    const product = makeProduct({ stockStatus: "reserved", reservedUntil });

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);
    listUserCartItemsMock.mockResolvedValue([]);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(409);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("PRODUCT_RESERVED");

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("create-order accepts the authenticated server cart's exact active hold", async () => {
    // Added 30 minutes ago: the hold is its original cart deadline.
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
    const product = makeProduct({ stockStatus: "reserved", reservedUntil });
    const order = makeOrder();
    createOrderMock.mockResolvedValue(order);
    listUserCartItemsMock.mockResolvedValue([
      makeOwnedCartItem({ productId: product.id, reservedUntil }),
    ]);

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const reserveUpdateChain = makeUpdateChain([{ id: product.id, slug: "silk-saree" }]);
    const orderUpdateChain = makeUpdateChain([]);

    dbUpdateMock
      .mockReturnValueOnce(reserveUpdateChain)
      .mockReturnValueOnce(orderUpdateChain);

    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_token_test",
      short_url: "https://rzp.io/l/token-test",
    });

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    // Thirty cart minutes remain, so the ten-minute payment window applies.
    const linkDeadline = new Date(
      order.placedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE_MS,
    );
    expect(specLinkDeadline(order.placedAt, addedAtFor(reservedUntil))).toEqual(linkDeadline);
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ reservedUntil: linkDeadline }),
    );
  });

  it("create-order returns RESERVATION_EXPIRED for an expired reservation token", async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const product = makeProduct({ reservedUntil: expiredAt, stockStatus: "reserved" });
    const reservationToken = createReservationToken({
      productId: product.id,
      reservedUntil: expiredAt,
    });
    listUserCartItemsMock.mockResolvedValue([{
      ...makeOwnedCartItem({ productId: product.id, reservedUntil: expiredAt }),
      reservationToken,
    }]);

    const productSelectChain = makeSelectChain([product]);
    dbSelectMock.mockReturnValueOnce(productSelectChain);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const baseBody = validBody();
    const body = {
      ...baseBody,
      items: baseBody.items.map((item) => ({ ...item, reservationToken })),
    };

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(json.code).toBe("RESERVATION_EXPIRED");
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("create-order returns RESERVATION_CONFLICT for mismatched server cart proof", async () => {
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
    const product = makeProduct({ stockStatus: "reserved", reservedUntil });
    const reservationToken = createReservationToken({
      productId: product.id,
      reservedUntil: new Date(reservedUntil.getTime() + 5_000),
    });
    listUserCartItemsMock.mockResolvedValue([{
      ...makeOwnedCartItem({ productId: product.id, reservedUntil }),
      reservationToken,
    }]);

    const productSelectChain = makeSelectChain([product]);
    dbSelectMock.mockReturnValueOnce(productSelectChain);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const baseBody = validBody();
    const body = {
      ...baseBody,
      items: baseBody.items.map((item) => ({ ...item, reservationToken })),
    };

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(json.code).toBe("RESERVATION_CONFLICT");
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("create-order returns PRODUCT_RESERVED if the final atomic inventory claim loses a race", async () => {
    const product = makeProduct();
    const order = makeOrder();

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const failOrderUpdateChain = makeUpdateChain([{ id: order.id }]);
    dbUpdateMock.mockReturnValueOnce(failOrderUpdateChain);
    createOrderMock.mockResolvedValue(order);
    startPaymentForOwnedCartItemsMock.mockResolvedValue([]);

    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(json.code).toBe("PRODUCT_RESERVED");
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();

    // The order this request created holds nothing and has no link, so a
    // guarded write fails it rather than leaving a pending order behind.
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    expect(failOrderUpdateChain.set).toHaveBeenCalledWith({
      paymentStatus: "failed",
      updatedAt: expect.any(Date),
    });
    const guard = new PgDialect().sqlToQuery(
      failOrderUpdateChain.where.mock.calls[0]![0] as SQL,
    );
    expect(guard.sql).toBe(
      '("orders"."id" = $1 and "orders"."user_id" = $2 and "orders"."payment_status" = $3' +
        ' and "orders"."razorpay_order_id" is null' +
        ' and not exists (select 1 from "reservations" where "reservations"."order_id" = "orders"."id"))',
    );
    expect(guard.params).toEqual([order.id, AUTH_USER.id, "pending"]);
    expect(addOrderEventMock).toHaveBeenCalledWith(
      order.id,
      "Checkout reservation failed",
      "pending",
      expect.objectContaining({ markedFailed: true, reservedProductIds: [] }),
    );
  });

  it("keeps a resumed order pending when its claim loses a race, since it may own a live link", async () => {
    const product = makeProduct();
    dbSelectMock.mockReturnValueOnce(makeSelectChain([product]));
    getOrderByIdempotencyKeyMock.mockResolvedValueOnce(
      makeExistingAttemptOrder({ razorpayOrderId: null }),
    );
    startPaymentForOwnedCartItemsMock.mockResolvedValue([]);

    const response = await postCreateOrder(AUTH_USER, {
      attemptId: "attempt-resumed-race",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PRODUCT_RESERVED" });
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      expect.any(String),
      "Checkout reservation failed",
      "pending",
      expect.objectContaining({ markedFailed: false }),
    );
  });

  it("allows only one winner when two users create-order for the same product", async () => {
    const product = makeProduct();
    const firstOrder = makeOrder({ id: "11111111-1111-4111-8111-111111111111" });
    const secondOrder = makeOrder({ id: "22222222-2222-4222-8222-222222222222" });

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    const firstReserveUpdateChain = makeUpdateChain([{ id: product.id, slug: "silk-saree" }]);
    const secondReserveUpdateChain = makeUpdateChain([]);
    const secondOrderFailedUpdateChain = makeUpdateChain([]);
    const firstOrderPaymentLinkUpdateChain = makeUpdateChain([]);

    dbUpdateMock
      .mockReturnValueOnce(firstReserveUpdateChain)
      .mockReturnValueOnce(secondReserveUpdateChain)
      .mockReturnValueOnce(secondOrderFailedUpdateChain)
      .mockReturnValueOnce(firstOrderPaymentLinkUpdateChain);

    createOrderMock
      .mockResolvedValueOnce(firstOrder)
      .mockResolvedValueOnce(secondOrder);
    listUserCartItemsMock.mockImplementation(async (userId: string) =>
      userId === AUTH_USER.id ? [makeOwnedCartItem()] : [],
    );
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_winner",
      short_url: "https://rzp.io/l/winner",
    });

    const firstBuyer = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });
    const secondBuyer = createRouteHarness({
      authUser: OTHER_USER,
      register: registerPaymentRoutes,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      firstBuyer.request("/create-order", {
        body: JSON.stringify(validBody()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      secondBuyer.request("/create-order", {
        body: JSON.stringify(validBody()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflictJson = (await (firstResponse.status === 409 ? firstResponse : secondResponse).json()) as Record<string, unknown>;
    expect(conflictJson.code).toBe("PRODUCT_RESERVED");
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
  });

  it("does not let a second user's stale bag row claim a saree another account now holds", async () => {
    // User A holds the saree now. User B still carries an older, validly
    // signed hold for it that has not reached its own expiry.
    const product = makeProduct();
    const staleReservedUntil = new Date(Date.now() + 20 * MINUTE_MS);
    listUserCartItemsMock.mockImplementation(async (userId: string) =>
      userId === AUTH_USER.id
        ? [makeOwnedCartItem()]
        : [makeOwnedCartItem({ reservedUntil: staleReservedUntil })],
    );
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([product]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock.mockReturnValueOnce(makeUpdateChain([]));
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_owner",
      short_url: "https://rzp.io/l/owner",
    });

    const staleResponse = await postCreateOrder(OTHER_USER);
    const ownerResponse = await postCreateOrder(AUTH_USER);

    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: "RESERVATION_CONFLICT" });
    expect(ownerResponse.status).toBe(200);
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledTimes(1);
    expect(startPaymentForOwnedCartItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTH_USER.id }),
    );
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTH_USER.id }),
    );
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 3: AMOUNT_TOO_LOW / 400
  // -------------------------------------------------------------------------
  it("create-order returns AMOUNT_TOO_LOW (400) when total is below minimum paise", async () => {
    // Mutate the module mock's exported constant to force AMOUNT_TOO_LOW
    const razorpayMod = await import("@/lib/payments/razorpay");
    const originalMin = (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE;

    try {
      // Force the minimum to be very large (100_000_000 paise = 1 million INR)
      (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE = 100_000_000;

      const product = makeProduct({ pricePaise: 10000_00 });
      const productSelectChain = makeSelectChain([product]);
      const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

      dbSelectMock
        .mockReturnValueOnce(productSelectChain)
        .mockReturnValueOnce(pendingCountSelectChain);

      const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

      const response = await request("/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });

      expect(response.status).toBe(400);
      const json = await response.json() as Record<string, unknown>;
      expect(json.code).toBe("AMOUNT_TOO_LOW");

      expect(createOrderMock).not.toHaveBeenCalled();
      expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    } finally {
      (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE = originalMin;
    }
  });
});

// ---------------------------------------------------------------------------
// payments/orders/:id/repay tests
// ---------------------------------------------------------------------------

describe("payments route — repay", () => {
  const ORDER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const PAYMENT_LINK_ID = "plink_repay";

  const repayOrder = (overrides: Record<string, unknown> = {}) => ({
    ...makeOrder({
      id: ORDER_ID,
      razorpayOrderId: PAYMENT_LINK_ID,
      userId: AUTH_USER.id,
    }),
    paymentStatus: "pending",
    shippingEmail: AUTH_USER.email,
    ...overrides,
  });

  const repay = () =>
    createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes }).request(
      `/orders/${ORDER_ID}/repay`,
      { headers: { "Content-Type": "application/json" }, method: "POST" },
    );

  const liveHold = () => ({
    expiresAt: new Date(Date.now() + 6 * MINUTE_MS),
    productIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  });

  beforeEach(() => {
    getOrderMock.mockReset();
    getLivePaymentHoldForOrderMock.mockReset();
    fetchRazorpayPaymentLinkMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");

    getOrderMock.mockResolvedValue(repayOrder());
    getLivePaymentHoldForOrderMock.mockResolvedValue(null);
    fetchRazorpayPaymentLinkMock.mockResolvedValue({
      amount: 1_770_000,
      currency: "INR",
      id: PAYMENT_LINK_ID,
      short_url: "https://rzp.io/l/repay",
      status: "created",
    });
  });

  it("re-surfaces the link, with its hold deadline, while the order owns its exact live hold", async () => {
    const hold = liveHold();
    getLivePaymentHoldForOrderMock.mockResolvedValue(hold);

    const response = await repay();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      expiresAt: hold.expiresAt.toISOString(),
      orderId: ORDER_ID,
      paymentLinkUrl: "https://rzp.io/l/repay",
    });
    expect(getLivePaymentHoldForOrderMock).toHaveBeenCalledWith({
      now: expect.any(Date),
      orderId: ORDER_ID,
      userId: AUTH_USER.id,
    });
  });

  it("refuses a pending order whose exact hold is gone, without asking Razorpay", async () => {
    const response = await repay();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PAYMENT_WINDOW_EXPIRED" });
    expect(fetchRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("refuses a failed order even while Razorpay still reports its link as created", async () => {
    getOrderMock.mockResolvedValue(repayOrder({ paymentStatus: "failed" }));
    getLivePaymentHoldForOrderMock.mockResolvedValue(liveHold());

    const response = await repay();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PAYMENT_WINDOW_EXPIRED" });
    expect(getLivePaymentHoldForOrderMock).not.toHaveBeenCalled();
    expect(fetchRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("refuses a partially paid link, since partial payment is never accepted", async () => {
    getLivePaymentHoldForOrderMock.mockResolvedValue(liveHold());
    fetchRazorpayPaymentLinkMock.mockResolvedValue({
      amount: 1_770_000,
      currency: "INR",
      id: PAYMENT_LINK_ID,
      short_url: "https://rzp.io/l/repay",
      status: "partially_paid",
    });

    const response = await repay();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PAYMENT_WINDOW_EXPIRED" });
  });
});

// ---------------------------------------------------------------------------
// payments/verify tests
// ---------------------------------------------------------------------------

describe("payments route — verify", () => {
  const ORDER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const RAZORPAY_ORDER_ID = "order_verify123";
  const PAYMENT_ID = "pay_verify123";
  const ORDER_TOTAL_PAISE = 75_000;

  const verifyBody = (overrides: Record<string, unknown> = {}) => ({
    orderId: ORDER_ID,
    razorpayOrderId: RAZORPAY_ORDER_ID,
    razorpayPaymentId: PAYMENT_ID,
    razorpaySignature: "sig_valid",
    ...overrides,
  });

  const verifyOrder = (overrides: Record<string, unknown> = {}) => ({
    ...makeOrder({
      id: ORDER_ID,
      razorpayOrderId: RAZORPAY_ORDER_ID,
      status: "pending",
      userId: AUTH_USER.id,
    }),
    paymentId: null,
    paymentStatus: "pending",
    totalPaise: ORDER_TOTAL_PAISE,
    ...overrides,
  });

  beforeEach(() => {
    getOrderMock.mockReset();
    getOrderByIdempotencyKeyMock.mockReset();
    completePaidOrderMock.mockReset();
    fetchRazorpayOrderMock.mockReset();
    fetchRazorpayPaymentMock.mockReset();
    verifyPaymentSignatureMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");

    getOrderMock.mockResolvedValue(verifyOrder());
    verifyPaymentSignatureMock.mockReturnValue(true);
    fetchRazorpayPaymentMock.mockResolvedValue({
      amount: ORDER_TOTAL_PAISE,
      captured: true,
      created_at: 1_786_000_000,
      currency: "INR",
      id: PAYMENT_ID,
      method: "upi",
      order_id: RAZORPAY_ORDER_ID,
      status: "captured",
    });
    fetchRazorpayOrderMock.mockResolvedValue({
      amount: ORDER_TOTAL_PAISE,
      amount_paid: ORDER_TOTAL_PAISE,
      currency: "INR",
      id: RAZORPAY_ORDER_ID,
      status: "paid",
    });
    completePaidOrderMock.mockResolvedValue({
      alreadyPaid: false,
      emailsSent: true,
      order: verifyOrder({ paymentId: PAYMENT_ID, paymentStatus: "paid", status: "confirmed" }),
    });
  });

  it("rejects missing signature", async () => {
    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });
    const body = verifyBody();
    delete (body as Record<string, unknown>).razorpaySignature;

    const response = await request("/verify", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signature", async () => {
    verifyPaymentSignatureMock.mockReturnValue(false);
    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/verify", {
      body: JSON.stringify(verifyBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("INVALID_SIGNATURE");
    expect(fetchRazorpayPaymentMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("rejects wrong Razorpay order id", async () => {
    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/verify", {
      body: JSON.stringify(verifyBody({ razorpayOrderId: "order_wrong" })),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("ORDER_ID_MISMATCH");
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("rejects amount mismatch from Razorpay payment fetch", async () => {
    fetchRazorpayPaymentMock.mockResolvedValue({
      amount: ORDER_TOTAL_PAISE - 1,
      captured: true,
      currency: "INR",
      id: PAYMENT_ID,
      order_id: RAZORPAY_ORDER_ID,
      status: "captured",
    });
    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/verify", {
      body: JSON.stringify(verifyBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("AMOUNT_MISMATCH");
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("completes order on valid captured payment", async () => {
    const { request } = createRouteHarness({ authUser: AUTH_USER, register: registerPaymentRoutes });

    const response = await request("/verify", {
      body: JSON.stringify(verifyBody()),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        paymentReference: RAZORPAY_ORDER_ID,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// payments/status isolation tests
// ---------------------------------------------------------------------------

describe("payments route — status isolation", () => {
  const ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  const statusOrder = (overrides: Record<string, unknown> = {}) => ({
    ...makeOrder({
      id: ORDER_ID,
      status: "pending",
      userId: AUTH_USER.id,
    }),
    paidAt: null,
    paymentStatus: "pending",
    shippingEmail: "checkout-status@example.test",
    updatedAt: new Date("2026-07-01T10:00:00.000Z"),
    ...overrides,
  });

  beforeEach(() => {
    getOrderMock.mockReset();
    verifyPaymentSignatureMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("ORDER_ACCESS_TOKEN_SECRET", "order-access-secret-at-least-32-chars");

    getOrderMock.mockResolvedValue(statusOrder());
  });

  it("denies payment status polling for a different authenticated user", async () => {
    getOrderMock.mockResolvedValueOnce(
      statusOrder({ userId: "99999999-9999-4999-8999-999999999999" }),
    );

    const { request } = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });

    const response = await request(`/status?orderId=${ORDER_ID}`);
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(json.paymentLinkUrl).toBeUndefined();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("allows the owner to poll payment status without exposing a payment link", async () => {
    const { request } = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });

    const response = await request(`/status?orderId=${ORDER_ID}`);
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.orderId).toBe(ORDER_ID);
    expect(json.paymentStatus).toBe("pending");
    expect(json.paymentLinkUrl).toBeUndefined();
  });

  it("allows an unauthenticated valid access token only for its order", async () => {
    const validKey = createOrderAccessToken(ORDER_ID);
    const wrongOrderKey = createOrderAccessToken("ffffffff-ffff-4fff-8fff-ffffffffffff");

    const { request } = createRouteHarness({
      authUser: null,
      register: registerPaymentRoutes,
    });

    const allowedResponse = await request(
      `/status?${new URLSearchParams({ key: validKey, orderId: ORDER_ID })}`,
    );
    const deniedResponse = await request(
      `/status?${new URLSearchParams({ key: wrongOrderKey, orderId: ORDER_ID })}`,
    );

    expect(allowedResponse.status).toBe(200);
    expect(deniedResponse.status).toBe(403);
  });

  it("keeps registered-user order status private from same-email guest claims", async () => {
    getOrderMock.mockResolvedValueOnce(
      statusOrder({
        shippingEmail: AUTH_USER.email,
        userId: "99999999-9999-4999-8999-999999999999",
      }),
    );

    const { request } = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });

    const response = await request(`/status?orderId=${ORDER_ID}`);
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// payment-link/callback tests
// ---------------------------------------------------------------------------

describe("payments route — payment-link/callback", () => {
  const ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const PAYMENT_LINK_ID = "plink_callback_test";
  const PAYMENT_LINK_REF_ID = "ftt_cccccccccccc4ccc8ccccccccccccccc";
  const PAYMENT_ID = "pay_callbackpayment123";
  const RAZORPAY_SIGNATURE = "valid_razorpay_sig";
  const ORDER_TOTAL_PAISE = 50_000;

  /** URL params common to all callback tests */
  const callbackParams = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      orderId: ORDER_ID,
      razorpay_payment_id: PAYMENT_ID,
      razorpay_payment_link_id: PAYMENT_LINK_ID,
      razorpay_payment_link_reference_id: PAYMENT_LINK_REF_ID,
      razorpay_payment_link_status: "paid",
      razorpay_signature: RAZORPAY_SIGNATURE,
      ...overrides,
    });

  /** An order row that matches the payment link id (razorpayOrderId = PAYMENT_LINK_ID) */
  const validOrder = () => ({
    ...makeOrder({ id: ORDER_ID, razorpayOrderId: PAYMENT_LINK_ID, status: "pending" }),
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
    events: [],
    paymentStatus: "pending",
    totalPaise: ORDER_TOTAL_PAISE,
  });

  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    getOrderMock.mockReset();
    getOrderByIdempotencyKeyMock.mockReset();
    addOrderEventMock.mockReset();
    completePaidOrderMock.mockReset();
    fetchRazorpayPaymentMock.mockReset();
    fetchRazorpayPaymentLinkMock.mockReset();
    verifyPaymentLinkSignatureMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    addOrderEventMock.mockResolvedValue(undefined);
    fetchRazorpayPaymentMock.mockResolvedValue({
      amount: ORDER_TOTAL_PAISE,
      captured: true,
      created_at: 1_786_000_000,
      currency: "INR",
      id: PAYMENT_ID,
      method: "upi",
      status: "captured",
    });
    fetchRazorpayPaymentLinkMock.mockResolvedValue({
      amount: ORDER_TOTAL_PAISE,
      amount_paid: ORDER_TOTAL_PAISE,
      currency: "INR",
      id: PAYMENT_LINK_ID,
      reference_id: PAYMENT_LINK_REF_ID,
      short_url: "https://rzp.io/l/test",
      status: "paid",
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Callback signature valid -> redirect with payment=paid
  // -------------------------------------------------------------------------
  it("callback with valid signature calls completePaidOrder and redirects with payment=paid", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(true);
    completePaidOrderMock.mockResolvedValue({
      alreadyPaid: false,
      emailsSent: true,
      order: validOrder(),
    });

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("paid");
    expect(redirectUrl.searchParams.get("orderId")).toBe(ORDER_ID);
    expect(redirectUrl.searchParams.get("key")).toBeTruthy();

    expect(completePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        paymentMethod: "upi",
        paymentReference: PAYMENT_LINK_ID,
        source: "Razorpay payment link callback",
      })
    );
  });

  it("callback replay redirects paid while completePaidOrder handles the loser idempotently", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(true);
    completePaidOrderMock
      .mockResolvedValueOnce({
        alreadyPaid: false,
        emailsSent: true,
        order: validOrder(),
      })
      .mockResolvedValueOnce({
        alreadyPaid: true,
        emailsSent: false,
        order: { ...validOrder(), status: "confirmed" },
      });

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const firstResponse = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );
    const secondResponse = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    for (const response of [firstResponse, secondResponse]) {
      expect(response.status).toBe(302);
      const redirectUrl = new URL(response.headers.get("location") ?? "");
      expect(redirectUrl.searchParams.get("payment")).toBe("paid");
    }

    expect(completePaidOrderMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Case 5: Callback signature invalid (tampered) -> redirect with payment=review
  // -------------------------------------------------------------------------
  it("callback with tampered signature redirects with payment=review and does NOT complete order", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(false);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams({ razorpay_signature: "tampered_sig" })}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(redirectUrl.searchParams.get("orderId")).toBeNull();
    expect(redirectUrl.searchParams.get("key")).toBeNull();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("does not mint order access from a caller-supplied id when callback fields are missing", async () => {
    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${new URLSearchParams({ orderId: ORDER_ID })}`,
      { method: "GET" },
    );

    expect(response.status).toBe(302);
    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(redirectUrl.searchParams.get("orderId")).toBeNull();
    expect(redirectUrl.searchParams.get("key")).toBeNull();
    expect(getOrderMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it("does not mint access when a signed callback names the wrong order reference", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(true);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });
    const response = await request(
      `/payment-link/callback?${callbackParams({
        razorpay_payment_link_reference_id: "ftt_another_order",
      })}`,
      { method: "GET" },
    );

    expect(response.status).toBe(302);
    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(redirectUrl.searchParams.get("orderId")).toBeNull();
    expect(redirectUrl.searchParams.get("key")).toBeNull();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 6: Callback with order not found (expired/missing) -> redirect with payment=review
  // -------------------------------------------------------------------------
  it("callback for a missing/expired order redirects with payment=review", async () => {
    getOrderMock.mockResolvedValue(null);

    const emptySelectChain = makeSelectChain([]);
    dbSelectMock.mockReturnValue(emptySelectChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(redirectUrl.searchParams.get("orderId")).toBeNull();
    expect(redirectUrl.searchParams.get("key")).toBeNull();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });
});
