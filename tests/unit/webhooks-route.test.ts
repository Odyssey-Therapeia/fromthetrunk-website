/**
 * Webhook route tests — P1-19
 *
 * Covers:
 *   1. payment_link.paid  → completePaidOrder called EXACTLY ONCE
 *   2. terminal link events reconcile against Razorpay at once, never from the payload
 *   3. receipts are written only after successful dispatch so provider retries work
 *   4. deliveries that no retry can change are acknowledged instead of retried
 *   5. refund.processed changes only the order, never the saree (required test 12)
 *
 * Strategy: mock db, getOrder, addOrderEvent, completePaidOrder and the
 * reconciliation module at the module boundary. The webhook HMAC is computed
 * in-test using the same secret so we can craft valid requests.
 */

import crypto from "crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede all imports
// ---------------------------------------------------------------------------

/** db.select() chain: select → from → where → limit */
const dbSelectLimitMock = vi.hoisted(() => vi.fn());
const dbSelectWhereMock = vi.hoisted(() => vi.fn());
const dbSelectFromMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());

/** db.update() chain: update → set → where */
const dbUpdateWhereMock = vi.hoisted(() => vi.fn());
const dbUpdateSetMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbDeleteWhereMock = vi.hoisted(() => vi.fn());
const dbDeleteMock = vi.hoisted(() => vi.fn());

const getOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());
const completePaidOrderMock = vi.hoisted(() => vi.fn());
const getEventByEventIdMock = vi.hoisted(() => vi.fn());
const markEventProcessedMock = vi.hoisted(() => vi.fn());
const fetchRazorpayOrderPaymentsMock = vi.hoisted(() => vi.fn());
const reconcilePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());
const revalidateProductsCacheMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: {
    delete: dbDeleteMock,
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/db/queries/events", () => ({
  getEventByEventId: getEventByEventIdMock,
  markEventProcessed: markEventProcessedMock,
}));

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

vi.mock("@/lib/payments/reconcile-expired-holds", () => ({
  reconcilePaymentHoldForOrder: reconcilePaymentHoldForOrderMock,
}));

vi.mock("@/lib/cache/product-cache", () => ({
  revalidateProductsCache: revalidateProductsCacheMock,
}));

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: logWarnMock,
  }),
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    fetchRazorpayOrderPayments: fetchRazorpayOrderPaymentsMock,
  };
});

// ---------------------------------------------------------------------------
// Route import (must come AFTER vi.mock calls)
// ---------------------------------------------------------------------------

import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import type { HonoBindings } from "@/api/hono/types";
import { orders } from "@/db/schema";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "test-webhook-secret-32chars!!!";

/**
 * Compute the HMAC-SHA256 signature Razorpay would send on the raw body.
 */
const sign = (rawBody: string): string =>
  crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

const createWebhookApp = () => {
  const app = new OpenAPIHono<HonoBindings>();
  registerWebhookRoutes(app);
  return app;
};

/**
 * POST a webhook event to the app with a valid HMAC signature.
 * Returns the Hono Response.
 */
const postWebhook = (
  app: ReturnType<typeof createWebhookApp>,
  payload: object,
  eventId = "evt_test_default"
) => {
  const body = JSON.stringify(payload);
  const sig = sign(body);
  return app.request("/razorpay", {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": sig,
    },
    method: "POST",
  });
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_ID_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RAZORPAY_ORDER_ID = "order_test123";
const RAZORPAY_PL_ID = "plink_test456";
const PAYMENT_ID = "pay_test789";

/** A minimal OrderWithRelations-shaped object for getOrder responses */
const makeOrder = (overrides?: Record<string, unknown>) => ({
  id: ORDER_ID,
  userId: null,
  subtotalPaise: 50000,
  shippingCostPaise: 0,
  taxRate: "0.00",
  taxAmountPaise: 0,
  totalPaise: 50000,
  shippingMethod: "standard",
  status: "pending" as const,
  paymentStatus: "pending" as const,
  paymentGateway: null,
  paymentMethod: null,
  paymentId: null,
  razorpayOrderId: RAZORPAY_ORDER_ID,
  shippingName: "Test User",
  shippingLine1: "123 Main St",
  shippingLine2: null,
  shippingCity: "Mumbai",
  shippingState: "MH",
  shippingPostalCode: "400001",
  shippingCountry: "IN",
  shippingPhone: null,
  shippingEmail: "test@example.com",
  placedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  events: [],
  items: [
    {
      id: "item-1",
      orderId: ORDER_ID,
      productId: PRODUCT_ID_1,
      name: "Test Saree 1",
      pricePaise: 25000,
      quantity: 1,
      imageUrl: null,
      createdAt: new Date(),
    },
    {
      id: "item-2",
      orderId: ORDER_ID,
      productId: PRODUCT_ID_2,
      name: "Test Saree 2",
      pricePaise: 25000,
      quantity: 1,
      imageUrl: null,
      createdAt: new Date(),
    },
  ],
  ...overrides,
});

/** A minimal bare-order (no items/events) for db.select() results */
const makeBareOrder = (overrides?: Record<string, unknown>) => ({
  id: ORDER_ID,
  razorpayOrderId: RAZORPAY_ORDER_ID,
  paymentStatus: "pending" as const,
  status: "pending" as const,
  ...overrides,
});

const paidPaymentLinkEvent = () => ({
  event: "payment_link.paid",
  payload: {
    payment: {
      entity: {
        id: PAYMENT_ID,
        amount: 50000,
        captured: true,
        currency: "INR",
        method: "upi",
        status: "captured",
      },
    },
    payment_link: {
      entity: {
        amount: 50000,
        amount_paid: 50000,
        currency: "INR",
        id: RAZORPAY_PL_ID,
        reference_id: "ftt_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa",
        short_url: "https://rzp.io/l/test",
        status: "paid",
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Shared beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET);

  // Reset all mocks
  dbSelectMock.mockReset();
  dbSelectFromMock.mockReset();
  dbSelectWhereMock.mockReset();
  dbSelectLimitMock.mockReset();
  dbUpdateMock.mockReset();
  dbUpdateSetMock.mockReset();
  dbUpdateWhereMock.mockReset();
  dbDeleteMock.mockReset();
  dbDeleteWhereMock.mockReset();
  getOrderMock.mockReset();
  addOrderEventMock.mockReset();
  completePaidOrderMock.mockReset();
  getEventByEventIdMock.mockReset();
  markEventProcessedMock.mockReset();
  fetchRazorpayOrderPaymentsMock.mockReset();
  reconcilePaymentHoldForOrderMock.mockReset();
  revalidateProductsCacheMock.mockReset();
  logWarnMock.mockReset();

  // Default: db.update chain resolves to undefined (no rows returned needed)
  dbUpdateWhereMock.mockResolvedValue([]);
  dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
  dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });
  dbDeleteWhereMock.mockResolvedValue([]);
  dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

  // Default: addOrderEvent resolves silently
  addOrderEventMock.mockResolvedValue(undefined);
  getEventByEventIdMock.mockResolvedValue(null);
  markEventProcessedMock.mockResolvedValue(undefined);
  fetchRazorpayOrderPaymentsMock.mockResolvedValue([]);
  reconcilePaymentHoldForOrderMock.mockResolvedValue({ kind: "none" });

  // Default: completePaidOrder resolves with a dummy success shape
  completePaidOrderMock.mockResolvedValue({
    alreadyPaid: false,
    emailsSent: false,
    order: makeOrder(),
  });
});

// ---------------------------------------------------------------------------
// Helper: wire up db.select() chain to return a given array
// ---------------------------------------------------------------------------
const wireSelectToReturn = (rows: unknown[]) => {
  dbSelectLimitMock.mockResolvedValue(rows);
  dbSelectWhereMock.mockReturnValue({ limit: dbSelectLimitMock });
  dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
  dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
};

// ===========================================================================
// Suite 1: payment_link.paid → completePaidOrder called exactly once
// ===========================================================================

describe("webhook payment_link.paid", () => {
  it("calls completePaidOrder exactly once when order is found", async () => {
    const bareOrder = makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID });
    wireSelectToReturn([bareOrder]);
    getOrderMock.mockResolvedValue(makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }));

    const app = createWebhookApp();
    const response = await postWebhook(app, paidPaymentLinkEvent());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ received: true });

    // EXACT call count — the critical assertion
    expect(completePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        source: "Razorpay payment link webhook",
      })
    );
  });

  it("ignores duplicate webhook event id before completing again", async () => {
    const bareOrder = makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID });
    wireSelectToReturn([bareOrder]);
    getOrderMock.mockResolvedValue(makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }));
    getEventByEventIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        eventId: "razorpay_webhook:evt_duplicate",
        occurredAt: new Date(),
        payload: { eventId: "evt_duplicate" },
        type: "razorpay_webhook_processed",
      });
    completePaidOrderMock.mockResolvedValueOnce({
      alreadyPaid: false,
      emailsSent: true,
      order: makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }),
    });

    const app = createWebhookApp();
    const payload = paidPaymentLinkEvent();

    const firstResponse = await postWebhook(app, payload, "evt_duplicate");
    const secondResponse = await postWebhook(app, payload, "evt_duplicate");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const secondJson = await secondResponse.json();
    expect(secondJson).toMatchObject({ duplicate: true, received: true });
    expect(completePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(markEventProcessedMock).toHaveBeenCalledTimes(1);
  });

  it("does not record completion until a failed paid handler succeeds on retry", async () => {
    wireSelectToReturn([makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID })]);
    getOrderMock.mockResolvedValue(makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }));
    completePaidOrderMock
      .mockRejectedValueOnce(new Error("transient database failure"))
      .mockResolvedValueOnce({
        alreadyPaid: false,
        emailsSent: true,
        order: makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }),
      });

    const app = createWebhookApp();
    const payload = paidPaymentLinkEvent();

    const firstResponse = await postWebhook(app, payload, "evt_retry_after_failure");
    expect(firstResponse.status).toBe(503);
    expect(markEventProcessedMock).not.toHaveBeenCalled();

    const retryResponse = await postWebhook(app, payload, "evt_retry_after_failure");
    expect(retryResponse.status).toBe(200);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(2);
    expect(markEventProcessedMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call completePaidOrder when payment or paymentLink entity ids are missing", async () => {
    wireSelectToReturn([]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment_link.paid",
      payload: {
        payment: { entity: { id: "" } }, // missing id
        payment_link: { entity: { id: RAZORPAY_PL_ID } },
      },
    });

    expect(response.status).toBe(200);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["the stored provider id lookup", () =>
      dbSelectLimitMock.mockRejectedValue(new Error("database unavailable"))],
    ["the ftt_ reference lookup", () =>
      getOrderMock.mockRejectedValue(new Error("database unavailable"))],
  ])(
    "retries a paid link when %s fails, and records no receipt",
    async (_label, arrangeFailure) => {
      wireSelectToReturn([]);
      arrangeFailure();

      const response = await postWebhook(
        createWebhookApp(),
        paidPaymentLinkEvent(),
        "evt_paid_lookup_failed",
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "WEBHOOK_PROCESSING_RETRY" });
      expect(completePaidOrderMock).not.toHaveBeenCalled();
      expect(logWarnMock).not.toHaveBeenCalled();
      expect(markEventProcessedMock).not.toHaveBeenCalled();
    },
  );
});

// ===========================================================================
// Suite 2: failed and terminal events cannot race a late captured payment
// ===========================================================================

describe("webhook payment lifecycle", () => {
  const terminalLinkOrder = (overrides: Record<string, unknown> = {}) => {
    wireSelectToReturn([makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID })]);
    getOrderMock.mockResolvedValue(
      makeOrder({ razorpayOrderId: RAZORPAY_PL_ID, userId: USER_ID, ...overrides }),
    );
  };

  const terminalLinkEvent = (event: string) => ({
    event,
    payload: { payment_link: { entity: { id: RAZORPAY_PL_ID } } },
  });

  it("retries order.paid while its captured payment is not visible yet", async () => {
    wireSelectToReturn([makeBareOrder({ totalPaise: 50000 })]);
    fetchRazorpayOrderPaymentsMock.mockResolvedValueOnce([]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "order.paid",
      payload: {
        order: {
          entity: {
            amount: 50000,
            amount_paid: 50000,
            currency: "INR",
            id: RAZORPAY_ORDER_ID,
            status: "paid",
          },
        },
      },
    });

    expect(response.status).toBe(503);
    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(markEventProcessedMock).not.toHaveBeenCalled();
  });

  it("audits payment.failed without releasing retryable payment authority", async () => {
    wireSelectToReturn([makeBareOrder()]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: PAYMENT_ID,
            order_id: RAZORPAY_ORDER_ID,
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true });
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Webhook payment.failed",
      "pending",
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        paymentReference: RAZORPAY_ORDER_ID,
        terminal: false,
      }),
    );
    expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    expect(getOrderMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  it.each(["payment_link.cancelled", "payment_link.expired"])(
    "reconciles %s against Razorpay at once and acknowledges it",
    async (event) => {
      terminalLinkOrder();
      reconcilePaymentHoldForOrderMock.mockResolvedValue({
        kind: "released",
        releasedProductIds: [],
        releasedSlugs: [],
        restoredProductIds: [PRODUCT_ID_1, PRODUCT_ID_2],
        restoredSlugs: ["first-saree", "second-saree"],
      });

      const response = await postWebhook(
        createWebhookApp(),
        terminalLinkEvent(event),
        `evt_${event}`,
      );

      expect(response.status).toBe(200);
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledOnce();
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        orderId: ORDER_ID,
      });
      expect(revalidateProductsCacheMock).toHaveBeenCalledWith([
        "first-saree",
        "second-saree",
      ]);
      expect(addOrderEventMock).toHaveBeenCalledWith(
        ORDER_ID,
        `Webhook ${event}`,
        "pending",
        { reconciliation: "released", releaseDeferred: false, terminal: true },
      );
      // The payload itself never releases anything.
      expect(dbUpdateMock).not.toHaveBeenCalled();
      expect(completePaidOrderMock).not.toHaveBeenCalled();
      expect(markEventProcessedMock).toHaveBeenCalledOnce();
    },
  );

  it("acknowledges a terminal link event while the hold stays deferred", async () => {
    terminalLinkOrder();
    reconcilePaymentHoldForOrderMock.mockResolvedValue({
      kind: "deferred",
      reason: "TERMINAL_LINK_PAYMENT_AMBIGUOUS",
    });

    const response = await postWebhook(
      createWebhookApp(),
      terminalLinkEvent("payment_link.expired"),
    );

    expect(response.status).toBe(200);
    expect(revalidateProductsCacheMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Webhook payment_link.expired",
      "pending",
      {
        reason: "TERMINAL_LINK_PAYMENT_AMBIGUOUS",
        reconciliation: "deferred",
        releaseDeferred: true,
        terminal: true,
      },
    );
    expect(markEventProcessedMock).toHaveBeenCalledOnce();
  });

  it("keeps the hold protected and acknowledges when reconciliation itself fails", async () => {
    terminalLinkOrder();
    reconcilePaymentHoldForOrderMock.mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await postWebhook(
      createWebhookApp(),
      terminalLinkEvent("payment_link.cancelled"),
    );

    expect(response.status).toBe(200);
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Webhook payment_link.cancelled",
      "pending",
      {
        reason: "RECONCILIATION_FAILED",
        reconciliation: "deferred",
        releaseDeferred: true,
        terminal: true,
      },
    );
  });

  it("only audits a terminal link event for an order that is no longer pending", async () => {
    terminalLinkOrder({ paymentStatus: "failed" });

    const response = await postWebhook(
      createWebhookApp(),
      terminalLinkEvent("payment_link.expired"),
    );

    expect(response.status).toBe(200);
    expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Webhook payment_link.expired",
      "pending",
      { reconciliation: "skipped", releaseDeferred: false, terminal: true },
    );
  });

  it("does NOT release reservation or call completePaidOrder when order_id is missing", async () => {
    wireSelectToReturn([]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: { entity: {} }, // no order_id
      },
    });

    expect(response.status).toBe(200);
    expect(getOrderMock).toHaveBeenCalledTimes(0);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it("does NOT release reservation when no order found for razorpay order id", async () => {
    wireSelectToReturn([]); // no matching order

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: {
          entity: { order_id: "order_nonexistent" },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(getOrderMock).toHaveBeenCalledTimes(0);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
    expect(dbUpdateMock).toHaveBeenCalledTimes(0);
  });

});

// ===========================================================================
// Suite 3: deliveries that no retry can change are acknowledged
// ===========================================================================

describe("webhook deliveries that no retry can change", () => {
  it.each(["PRODUCT_SOLD", "PAYMENT_CLAIM_CONFLICT", "PAYMENT_ID_MISMATCH"])(
    "acknowledges a %s completion and records it for review",
    async (code) => {
      wireSelectToReturn([makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID })]);
      getOrderMock.mockResolvedValue(makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }));
      completePaidOrderMock.mockRejectedValueOnce(new Error(code));

      const response = await postWebhook(
        createWebhookApp(),
        paidPaymentLinkEvent(),
        `evt_final_${code}`,
      );

      expect(response.status).toBe(200);
      expect(completePaidOrderMock).toHaveBeenCalledOnce();
      expect(addOrderEventMock).toHaveBeenCalledWith(
        ORDER_ID,
        "Razorpay payment link webhook completion rejected",
        "pending",
        { code, paymentId: PAYMENT_ID, paymentReference: RAZORPAY_PL_ID },
      );
      expect(markEventProcessedMock).toHaveBeenCalledOnce();
    },
  );

  it("acknowledges and audits a PRODUCT_SOLD payment.captured completion", async () => {
    wireSelectToReturn([makeBareOrder({ totalPaise: 50000 })]);
    completePaidOrderMock.mockRejectedValueOnce(new Error("PRODUCT_SOLD"));

    const response = await postWebhook(createWebhookApp(), {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            amount: 50000,
            captured: true,
            currency: "INR",
            id: PAYMENT_ID,
            order_id: RAZORPAY_ORDER_ID,
            status: "captured",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Razorpay payment.captured webhook completion rejected",
      "pending",
      { code: "PRODUCT_SOLD", paymentId: PAYMENT_ID, paymentReference: RAZORPAY_ORDER_ID },
    );
  });

  it("acknowledges payment.captured for a Razorpay order this store never stored", async () => {
    // A Payment Link payment carries Razorpay's order_ id; orders store plink_.
    wireSelectToReturn([]);

    const response = await postWebhook(createWebhookApp(), {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            amount: 50000,
            captured: true,
            currency: "INR",
            id: PAYMENT_ID,
            order_id: "order_from_payment_link",
            status: "captured",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(markEventProcessedMock).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "carries no ftt_ reference",
      { amount: 50000, amount_paid: 50000, currency: "INR", id: "plink_by_hand", status: "paid" },
      null,
    ],
    [
      "names an order this store does not have",
      paidPaymentLinkEvent().payload.payment_link.entity,
      "ftt_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa",
    ],
  ])(
    "acknowledges and records payment_link.paid for a link that %s",
    async (_label, paymentLink, referenceId) => {
      // For example a link made by hand in the Razorpay dashboard. Every
      // redelivery would miss too, and repeated non-2xx answers would get the
      // webhook disabled for real checkouts as well.
      wireSelectToReturn([]);
      getOrderMock.mockResolvedValue(null);

      const response = await postWebhook(
        createWebhookApp(),
        {
          event: "payment_link.paid",
          payload: {
            payment: paidPaymentLinkEvent().payload.payment,
            payment_link: { entity: paymentLink },
          },
        },
        "evt_unmatched_link",
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(completePaidOrderMock).not.toHaveBeenCalled();
      expect(addOrderEventMock).not.toHaveBeenCalled();
      expect(logWarnMock).toHaveBeenCalledWith(
        "payment_link.paid for a link with no matching order",
        { paymentId: PAYMENT_ID, paymentLinkId: paymentLink.id, referenceId },
      );
      expect(markEventProcessedMock).toHaveBeenCalledOnce();
      expect(markEventProcessedMock).toHaveBeenCalledWith({
        eventId: "razorpay_webhook:evt_unmatched_link",
        occurredAt: expect.any(Date),
        payload: { eventId: "evt_unmatched_link", eventType: "payment_link.paid" },
        type: "razorpay_webhook_processed",
      });
    },
  );

  it("acknowledges order.paid for a Razorpay order this store never stored", async () => {
    wireSelectToReturn([]);

    const response = await postWebhook(createWebhookApp(), {
      event: "order.paid",
      payload: {
        order: {
          entity: {
            amount: 50000,
            amount_paid: 50000,
            currency: "INR",
            id: "order_from_payment_link",
            status: "paid",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(fetchRazorpayOrderPaymentsMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(markEventProcessedMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// Suite 4: a refund never restocks (required test 12, webhook side)
// ===========================================================================

describe("webhook refund.processed", () => {
  const refundEvent = {
    event: "refund.processed",
    payload: { refund: { entity: { payment_id: PAYMENT_ID } } },
  };

  it("marks only the paid order refunded and never touches the saree", async () => {
    wireSelectToReturn([
      makeBareOrder({
        paymentId: PAYMENT_ID,
        paymentStatus: "paid",
        status: "confirmed",
      }),
    ]);

    const response = await postWebhook(createWebhookApp(), refundEvent, "evt_refund");

    expect(response.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledOnce();
    expect(dbUpdateMock).toHaveBeenCalledWith(orders);
    const [values] = dbUpdateSetMock.mock.calls[0]!;
    expect(values).toEqual({ paymentStatus: "refunded", updatedAt: expect.any(Date) });
    expect(values).not.toHaveProperty("stockStatus");

    const guard = new PgDialect().sqlToQuery(
      dbUpdateWhereMock.mock.calls[0]![0] as SQL,
    );
    expect(guard.sql).toContain('"orders"."id" = $1');
    expect(guard.sql).toContain('"orders"."payment_status" in ($2, $3)');
    expect(guard.params).toEqual([ORDER_ID, "paid", "refunded"]);

    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER_ID,
      "Webhook refund.processed",
      "confirmed",
      { paymentId: PAYMENT_ID },
    );
    expect(markEventProcessedMock).toHaveBeenCalledOnce();
  });

  it("acknowledges a refund for a payment no order holds", async () => {
    wireSelectToReturn([]);

    const response = await postWebhook(createWebhookApp(), refundEvent);

    expect(response.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(addOrderEventMock).not.toHaveBeenCalled();
    expect(markEventProcessedMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// Suite 5: Signature verification (guard rails — not main P1-19 scope but
//          validates the harness is actually exercising the route)
// ===========================================================================

describe("webhook signature verification", () => {
  it("returns 400 INVALID_SIGNATURE for a tampered body", async () => {
    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });
    const tamperedSig = "0000000000000000000000000000000000000000000000000000000000000000";

    const response = await app.request("/razorpay", {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": tamperedSig,
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it("returns 400 MISSING_SIGNATURE when x-razorpay-signature header is absent", async () => {
    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });

    const response = await app.request("/razorpay", {
      body,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "MISSING_SIGNATURE" });
  });

  it("returns 500 WEBHOOK_SECRET_MISSING when env var is not set", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");

    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });

    const response = await app.request("/razorpay", {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "any",
      },
      method: "POST",
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toMatchObject({ code: "WEBHOOK_SECRET_MISSING" });
  });
});
