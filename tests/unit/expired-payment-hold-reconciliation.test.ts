/**
 * Payment holds are settled only by Razorpay's state: a verified capture
 * completes the sale, a confirmed unpaid link restores the original cart time
 * (or releases once that time is gone), and anything unproven stays protected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";

const addOrderEventMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());
const listCandidatesMock = vi.hoisted(() => vi.fn());
const getCandidateForOrderMock = vi.hoisted(() => vi.fn());
const releasePaymentCartItemsMock = vi.hoisted(() => vi.fn());
const completePaidOrderMock = vi.hoisted(() => vi.fn());
const cancelPaymentLinkMock = vi.hoisted(() => vi.fn());
const fetchOrderMock = vi.hoisted(() => vi.fn());
const fetchOrderPaymentsMock = vi.hoisted(() => vi.fn());
const fetchPaymentMock = vi.hoisted(() => vi.fn());
const fetchPaymentLinkMock = vi.hoisted(() => vi.fn());
const lookupPaymentLinkMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  addOrderEvent: addOrderEventMock,
  getOrder: getOrderMock,
}));

vi.mock("@/db/queries/user-cart", () => ({
  getPaymentHoldCandidateForOrder: getCandidateForOrderMock,
  listExpiredPaymentHoldCandidates: listCandidatesMock,
  releasePaymentCartItems: releasePaymentCartItemsMock,
}));

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

// Only network calls are stubbed; error classification and the reference
// format stay real.
vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    cancelRazorpayPaymentLink: cancelPaymentLinkMock,
    fetchRazorpayOrder: fetchOrderMock,
    fetchRazorpayOrderPayments: fetchOrderPaymentsMock,
    fetchRazorpayPayment: fetchPaymentMock,
    fetchRazorpayPaymentLink: fetchPaymentLinkMock,
    lookupRazorpayPaymentLinkByReferenceId: lookupPaymentLinkMock,
  };
});

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const { reconcileExpiredPaymentHolds, reconcilePaymentHoldForOrder } =
  await import("@/lib/payments/reconcile-expired-holds");
const { getRazorpayPaymentLinkReferenceId } = await import(
  "@/lib/payments/razorpay"
);

const ORDER = "33333333-3333-4333-8333-333333333333";
const OTHER_ORDER = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT = "55555555-5555-4555-8555-555555555555";
const USER = "22222222-2222-4222-8222-222222222222";
const MINUTE = 60_000;
const NOW = new Date("2026-09-09T10:00:00.000Z");
/* Added and paid from 09:35: the link deadline is 09:45, the cart's 10:35. */
const ADDED_AT = new Date("2026-09-09T09:35:00.000Z");
const CART_DEADLINE = new Date(ADDED_AT.getTime() + 60 * MINUTE);
const EXPIRY = new Date(ADDED_AT.getTime() + 10 * MINUTE);

type CandidateOverrides = {
  cartDeadline?: Date;
  orderId?: string;
  productId?: string;
  providerPaymentId?: null | string;
  reservedUntil?: Date;
  tokenReservedUntil?: Date;
};

const candidate = ({
  cartDeadline = CART_DEADLINE,
  orderId = ORDER,
  productId = PRODUCT,
  providerPaymentId = "plink_exact",
  reservedUntil = EXPIRY,
  tokenReservedUntil = reservedUntil,
}: CandidateOverrides = {}) => ({
  items: [
    {
      cartDeadline,
      paymentReservationToken: createReservationToken({
        productId,
        reservedUntil: tokenReservedUntil,
      }),
      productId,
    },
  ],
  orderId,
  productIds: [productId],
  providerPaymentId,
  reservedUntil,
  totalPaise: 125_000,
  userId: USER,
});

const scanOf = (...candidates: Array<ReturnType<typeof candidate>>) => ({
  candidates,
  conflictOrderIds: [],
  protectedProductIds: candidates.flatMap((entry) => entry.productIds),
});

const paymentLink = (overrides: Record<string, unknown> = {}) => ({
  amount: 125_000,
  amount_paid: 0,
  currency: "INR",
  id: "plink_exact",
  payments: [],
  reference_id: getRazorpayPaymentLinkReferenceId(ORDER),
  short_url: "https://rzp.io/i/exact",
  status: "expired",
  ...overrides,
});

const paidPaymentLink = () =>
  paymentLink({
    amount_paid: 125_000,
    payments: [
      {
        amount: 125_000,
        method: "card",
        payment_id: "pay_exact",
        plink_id: "plink_exact",
        status: "captured",
      },
    ],
    status: "paid",
  });

const capturedPayment = () => ({
  amount: 125_000,
  captured: true,
  created_at: 1_789_000_000,
  currency: "INR",
  id: "pay_exact",
  method: "card",
  status: "captured",
});

const releaseResult = (overrides: Record<string, unknown> = {}) => ({
  kind: "released",
  releasedProductIds: [],
  releasedSlugs: [],
  restoredProductIds: [],
  restoredSlugs: [],
  ...overrides,
});

/** The SDK-normalised shape of a Razorpay 400. */
const razorpayBadRequest = (description: string) => ({
  error: { code: "BAD_REQUEST_ERROR", description },
  statusCode: 400,
});

type ReleaseInput = {
  items: Array<{
    cartDeadline: Date;
    paymentReservationToken: string;
    productId: string;
    restorationReservationToken: string;
  }>;
  now: Date;
  orderId: string;
  reservedUntil: Date;
  userId: string;
};

const releaseInput = (call = 0) =>
  releasePaymentCartItemsMock.mock.calls[call]![0] as ReleaseInput;

const reconcile = () =>
  reconcileExpiredPaymentHolds({ now: NOW, productIds: [PRODUCT] });

beforeEach(() => {
  vi.stubEnv("RESERVATION_TOKEN_SECRET", "test-reservation-secret");
  for (const mock of [
    addOrderEventMock,
    getOrderMock,
    listCandidatesMock,
    getCandidateForOrderMock,
    releasePaymentCartItemsMock,
    completePaidOrderMock,
    cancelPaymentLinkMock,
    fetchOrderMock,
    fetchOrderPaymentsMock,
    fetchPaymentMock,
    fetchPaymentLinkMock,
    lookupPaymentLinkMock,
  ]) {
    mock.mockReset();
  }

  listCandidatesMock.mockResolvedValue(scanOf(candidate()));
  releasePaymentCartItemsMock.mockResolvedValue(
    releaseResult({ restoredProductIds: [PRODUCT], restoredSlugs: ["rose-silk"] }),
  );
  addOrderEventMock.mockResolvedValue({});
  completePaidOrderMock.mockResolvedValue({ alreadyPaid: false });
  getOrderMock.mockResolvedValue(null);
});

describe("an unpaid link hands back only the original cart time (required test 10)", () => {
  it("restores an expired unpaid link to the original cart deadline, never a fresh hour", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink());

    const result = await reconcile();

    expect(releasePaymentCartItemsMock).toHaveBeenCalledWith({
      items: [
        {
          cartDeadline: CART_DEADLINE,
          paymentReservationToken: createReservationToken({
            productId: PRODUCT,
            reservedUntil: EXPIRY,
          }),
          productId: PRODUCT,
          restorationReservationToken: expect.any(String),
        },
      ],
      now: NOW,
      orderId: ORDER,
      reservedUntil: EXPIRY,
      userId: USER,
    });
    const proof = verifyReservationToken(
      releaseInput().items[0]!.restorationReservationToken,
    );
    expect(proof?.productId).toBe(PRODUCT);
    expect(proof?.reservedUntil.getTime()).toBe(CART_DEADLINE.getTime());
    // 35 minutes were left; a fresh reservation would have run to 11:00.
    expect(proof!.reservedUntil.getTime()).toBeLessThan(
      NOW.getTime() + 60 * MINUTE,
    );

    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      deferredOrderIds: [],
      releasedOrderIds: [ORDER],
      releasedProductIds: [],
      restoredProductIds: [PRODUCT],
      restoredSlugs: ["rose-silk"],
    });
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER,
      "Terminal unpaid payment hold resolved after Razorpay reconciliation",
      "pending",
      {
        reason: "PAYMENT_LINK_EXPIRED",
        releasedProductIds: [],
        restoredProductIds: [PRODUCT],
      },
    );
  });

  it("releases the saree, with nothing restored, once the cart deadline has passed", async () => {
    const addedAt = new Date("2026-09-09T08:50:00.000Z");
    const cartDeadline = new Date(addedAt.getTime() + 60 * MINUTE);
    // Payment started at 09:45, so its deadline was capped at 09:50.
    listCandidatesMock.mockResolvedValue(
      scanOf(candidate({ cartDeadline, reservedUntil: cartDeadline })),
    );
    fetchPaymentLinkMock.mockResolvedValue(paymentLink());
    releasePaymentCartItemsMock.mockResolvedValue(
      releaseResult({ releasedProductIds: [PRODUCT], releasedSlugs: ["rose-silk"] }),
    );

    const result = await reconcile();

    expect(releaseInput().items[0]!.cartDeadline).toEqual(cartDeadline);
    expect(
      verifyReservationToken(releaseInput().items[0]!.restorationReservationToken)
        ?.reservedUntil,
    ).toEqual(cartDeadline);
    expect(result).toMatchObject({
      releasedOrderIds: [ORDER],
      releasedProductIds: [PRODUCT],
      releasedSlugs: ["rose-silk"],
      restoredProductIds: [],
      restoredSlugs: [],
    });
  });

  it("keeps the hold when its payment token was signed for another deadline", async () => {
    listCandidatesMock.mockResolvedValue(
      scanOf(candidate({ tokenReservedUntil: new Date(EXPIRY.getTime() + MINUTE) })),
    );
    fetchPaymentLinkMock.mockResolvedValue(paymentLink());

    const result = await reconcile();

    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });
});

describe("a link Razorpay still keeps open is closed before anything moves", () => {
  it("cancels a created link once its server deadline passed, then restores", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "created" }));
    cancelPaymentLinkMock.mockResolvedValue(paymentLink({ status: "cancelled" }));

    const result = await reconcile();

    expect(cancelPaymentLinkMock).toHaveBeenCalledOnce();
    expect(cancelPaymentLinkMock).toHaveBeenCalledWith("plink_exact");
    expect(releasePaymentCartItemsMock).toHaveBeenCalledOnce();
    expect(cancelPaymentLinkMock.mock.invocationCallOrder[0]).toBeLessThan(
      releasePaymentCartItemsMock.mock.invocationCallOrder[0]!,
    );
    expect(result).toMatchObject({
      deferredOrderIds: [],
      releasedOrderIds: [ORDER],
      restoredProductIds: [PRODUCT],
    });
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER,
      expect.any(String),
      "pending",
      expect.objectContaining({ reason: "PAYMENT_LINK_CANCELLED" }),
    );
  });

  it("releases nothing when the cancelled link carries a payment signal", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "created" }));
    cancelPaymentLinkMock.mockResolvedValue(
      paymentLink({
        payments: [
          {
            amount: 125_000,
            payment_id: "pay_late",
            plink_id: "plink_exact",
            status: "authorized",
          },
        ],
        status: "cancelled",
      }),
    );

    const result = await reconcile();

    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("completes a link that was paid before the cancel landed", async () => {
    fetchPaymentLinkMock
      .mockResolvedValueOnce(paymentLink({ status: "created" }))
      .mockResolvedValueOnce(paidPaymentLink());
    cancelPaymentLinkMock.mockRejectedValue(
      razorpayBadRequest("cannot cancel or expire an already paid/partially paid link"),
    );
    fetchPaymentMock.mockResolvedValue(capturedPayment());

    const result = await reconcile();

    expect(cancelPaymentLinkMock).toHaveBeenCalledOnce();
    expect(fetchPaymentLinkMock).toHaveBeenCalledTimes(2);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER,
        paymentId: "pay_exact",
        paymentReference: "plink_exact",
      }),
    );
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.completedOrderIds).toEqual([ORDER]);
  });

  it("applies the terminal rule to a link that expired before the cancel landed", async () => {
    fetchPaymentLinkMock
      .mockResolvedValueOnce(paymentLink({ status: "created" }))
      .mockResolvedValueOnce(paymentLink({ status: "expired" }));
    cancelPaymentLinkMock.mockRejectedValue(
      razorpayBadRequest("cannot cancel or expire an expired link"),
    );

    const result = await reconcile();

    expect(releasePaymentCartItemsMock).toHaveBeenCalledOnce();
    expect(result.releasedOrderIds).toEqual([ORDER]);
    expect(addOrderEventMock).toHaveBeenCalledWith(
      ORDER,
      expect.any(String),
      "pending",
      expect.objectContaining({ reason: "PAYMENT_LINK_EXPIRED" }),
    );
  });

  it("keeps the hold protected when the cancel fails for any other reason", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "created" }));
    cancelPaymentLinkMock.mockRejectedValue(new Error("socket hang up"));

    const result = await reconcile();

    expect(fetchPaymentLinkMock).toHaveBeenCalledOnce();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("does not cancel twice when Razorpay reports an update in progress", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "created" }));
    cancelPaymentLinkMock.mockRejectedValue(
      razorpayBadRequest("an update is already in progress"),
    );

    const result = await reconcile();

    expect(cancelPaymentLinkMock).toHaveBeenCalledOnce();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("never cancels a link whose server deadline is still running", async () => {
    getCandidateForOrderMock.mockResolvedValue({
      candidate: candidate({ reservedUntil: new Date(NOW.getTime() + 5 * MINUTE) }),
      kind: "candidate",
    });
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "created" }));

    const result = await reconcilePaymentHoldForOrder({ now: NOW, orderId: ORDER });

    expect(result).toEqual({ kind: "deferred", reason: "PAYMENT_LINK_NOT_TERMINAL" });
    expect(cancelPaymentLinkMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
  });
});

describe("verified captures and unproven provider state", () => {
  it("completes an exact captured Payment Link instead of releasing it", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paidPaymentLink());
    fetchPaymentMock.mockResolvedValue(capturedPayment());

    const result = await reconcile();

    expect(completePaidOrderMock).toHaveBeenCalledWith(expect.objectContaining({
      orderId: ORDER,
      paymentId: "pay_exact",
      paymentReference: "plink_exact",
      source: "Razorpay expiry reconciliation",
    }));
    expect(cancelPaymentLinkMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.completedOrderIds).toEqual([ORDER]);
  });

  it("defers paid status when the captured payment cannot be verified", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({
      amount_paid: 125_000,
      payments: [],
      status: "paid",
    }));

    const result = await reconcile();

    expect(fetchPaymentMock).not.toHaveBeenCalled();
    expect(completePaidOrderMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("defers provider errors and identity mismatches", async () => {
    fetchPaymentLinkMock.mockRejectedValueOnce(new Error("provider timeout"));
    let result = await reconcile();
    expect(result.deferredOrderIds).toEqual([ORDER]);

    fetchPaymentLinkMock.mockResolvedValueOnce(paymentLink({
      reference_id: "ftt_someone-else",
      status: "created",
    }));
    result = await reconcile();
    expect(result.deferredOrderIds).toEqual([ORDER]);
    expect(cancelPaymentLinkMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
  });

  it("releases a provider-less attempt only after a unique-reference absence", async () => {
    listCandidatesMock.mockResolvedValue(
      scanOf(candidate({ providerPaymentId: null })),
    );
    lookupPaymentLinkMock.mockResolvedValue({ kind: "absent" });

    const result = await reconcile();

    expect(lookupPaymentLinkMock).toHaveBeenCalledWith(
      getRazorpayPaymentLinkReferenceId(ORDER),
    );
    expect(releasePaymentCartItemsMock).toHaveBeenCalledOnce();
    expect(releaseInput().items[0]!.cartDeadline).toEqual(CART_DEADLINE);
    expect(result.releasedOrderIds).toEqual([ORDER]);
  });

  it("defers an ambiguous unique-reference lookup", async () => {
    listCandidatesMock.mockResolvedValue(
      scanOf(candidate({ providerPaymentId: null })),
    );
    lookupPaymentLinkMock.mockResolvedValue({ kind: "ambiguous" });

    const result = await reconcile();

    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("keeps locally inconsistent candidates protected without provider calls", async () => {
    listCandidatesMock.mockResolvedValue({
      candidates: [],
      conflictOrderIds: [ORDER],
      protectedProductIds: [PRODUCT],
    });

    const result = await reconcile();

    expect(fetchPaymentLinkMock).not.toHaveBeenCalled();
    expect(lookupPaymentLinkMock).not.toHaveBeenCalled();
    expect(result.conflictOrderIds).toEqual([ORDER]);
    expect(result.deferredOrderIds).toEqual([ORDER]);
  });

  it("defers only the order whose release statement failed", async () => {
    listCandidatesMock.mockResolvedValue(
      scanOf(
        candidate(),
        candidate({
          orderId: OTHER_ORDER,
          productId: OTHER_PRODUCT,
          providerPaymentId: "plink_other",
        }),
      ),
    );
    fetchPaymentLinkMock.mockImplementation(async (id: string) =>
      id === "plink_other"
        ? paymentLink({
            id: "plink_other",
            reference_id: getRazorpayPaymentLinkReferenceId(OTHER_ORDER),
          })
        : paymentLink(),
    );
    releasePaymentCartItemsMock
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(
        releaseResult({
          restoredProductIds: [OTHER_PRODUCT],
          restoredSlugs: ["jade-silk"],
        }),
      );

    const result = await reconciliationFor([PRODUCT, OTHER_PRODUCT]);

    expect(releasePaymentCartItemsMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      deferredOrderIds: [ORDER],
      releasedOrderIds: [OTHER_ORDER],
      restoredProductIds: [OTHER_PRODUCT],
      restoredSlugs: ["jade-silk"],
    });
  });

  it("defers a release that lost its exact local guard", async () => {
    fetchPaymentLinkMock.mockResolvedValue(paymentLink());
    releasePaymentCartItemsMock.mockResolvedValue(
      releaseResult({ kind: "ownership_conflict" }),
    );

    const result = await reconcile();

    expect(result).toMatchObject({ deferredOrderIds: [ORDER], releasedOrderIds: [] });
    expect(addOrderEventMock).not.toHaveBeenCalled();
  });
});

describe("reconcilePaymentHoldForOrder (terminal link webhook)", () => {
  it("restores a confirmed unpaid link without waiting for the scheduled run", async () => {
    getCandidateForOrderMock.mockResolvedValue({
      candidate: candidate(),
      kind: "candidate",
    });
    fetchPaymentLinkMock.mockResolvedValue(paymentLink({ status: "cancelled" }));

    const result = await reconcilePaymentHoldForOrder({ now: NOW, orderId: ORDER });

    expect(getCandidateForOrderMock).toHaveBeenCalledWith(ORDER);
    expect(listCandidatesMock).not.toHaveBeenCalled();
    expect(releaseInput().items[0]!.cartDeadline).toEqual(CART_DEADLINE);
    expect(result).toEqual({
      kind: "released",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [PRODUCT],
      restoredSlugs: ["rose-silk"],
    });
  });

  it("leaves a locally inconsistent order protected without provider calls", async () => {
    getCandidateForOrderMock.mockResolvedValue({
      kind: "conflict",
      protectedProductIds: [PRODUCT],
    });

    const result = await reconcilePaymentHoldForOrder({ now: NOW, orderId: ORDER });

    expect(result).toEqual({ kind: "conflict", protectedProductIds: [PRODUCT] });
    expect(fetchPaymentLinkMock).not.toHaveBeenCalled();
    expect(releasePaymentCartItemsMock).not.toHaveBeenCalled();
  });

  it("does nothing for an order without a current payment hold", async () => {
    getCandidateForOrderMock.mockResolvedValue({ kind: "none" });

    const result = await reconcilePaymentHoldForOrder({ now: NOW, orderId: ORDER });

    expect(result).toEqual({ kind: "none" });
    expect(fetchPaymentLinkMock).not.toHaveBeenCalled();
  });
});

function reconciliationFor(productIds: string[]) {
  return reconcileExpiredPaymentHolds({ now: NOW, productIds });
}
