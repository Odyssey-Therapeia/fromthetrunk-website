/**
 * The authenticated bag's read, add and remove routes.
 *
 * Two properties carry the most weight. A saree must never be claimed without
 * a bag row behind it, and a bag row must never release a hold it does not
 * exactly own. Every answer carries the verdict the cards read, so no mutation
 * can tell one surface something the next poll contradicts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());
const getBlouseProductIdSetMock = vi.hoisted(() => vi.fn());
const revalidateProductsCacheMock = vi.hoisted(() => vi.fn());

const claimProductIntoCartMock = vi.hoisted(() => vi.fn());
const expireCommerceHoldsForProductsMock = vi.hoisted(() => vi.fn());
const getUserCartItemMock = vi.hoisted(() => vi.fn());
const getViewerStateRowsMock = vi.hoisted(() => vi.fn());
const listUserCartItemsMock = vi.hoisted(() => vi.fn());
const listUserCartLinesMock = vi.hoisted(() => vi.fn());
const releaseCartHoldByTokenMock = vi.hoisted(() => vi.fn());
const removeOwnedCartItemMock = vi.hoisted(() => vi.fn());
const upsertUnreservedMock = vi.hoisted(() => vi.fn());
const listLapsedOwnPaymentOrderIdsMock = vi.hoisted(() => vi.fn());
const pruneUnownedCartRowsMock = vi.hoisted(() => vi.fn());
const reconcilePaymentHoldForOrderMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({ db: { select: dbSelectMock, update: dbUpdateMock } }));
vi.mock("@/db/queries/products", () => ({
  getBlouseProductIdSet: getBlouseProductIdSetMock,
}));
vi.mock("@/db/queries/user-cart", () => ({
  claimProductIntoCart: claimProductIntoCartMock,
  expireCommerceHoldsForProducts: expireCommerceHoldsForProductsMock,
  getUserCartItem: getUserCartItemMock,
  getViewerStateRows: getViewerStateRowsMock,
  listLapsedOwnPaymentOrderIds: listLapsedOwnPaymentOrderIdsMock,
  listUserCartItems: listUserCartItemsMock,
  listUserCartLines: listUserCartLinesMock,
  pruneUnownedCartRows: pruneUnownedCartRowsMock,
  releaseCartHoldByToken: releaseCartHoldByTokenMock,
  removeOwnedCartItem: removeOwnedCartItemMock,
  upsertUnreservedCartItem: upsertUnreservedMock,
}));
vi.mock("@/db/schema", () => ({
  products: {
    id: "products.id",
    quantityAvailable: "products.quantityAvailable",
    reservedUntil: "products.reservedUntil",
    slug: "products.slug",
    status: "products.status",
    stockStatus: "products.stockStatus",
    updatedAt: "products.updatedAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ args, op: "and" }),
  eq: (...args: unknown[]) => ({ args, op: "eq" }),
  inArray: (...args: unknown[]) => ({ args, op: "inArray" }),
  isNotNull: (...args: unknown[]) => ({ args, op: "isNotNull" }),
  lt: (...args: unknown[]) => ({ args, op: "lt" }),
  or: (...args: unknown[]) => ({ args, op: "or" }),
}));
vi.mock("@/lib/http/rate-limit", () => ({ rateLimitResponse: rateLimitResponseMock }));
vi.mock("@/lib/cache/product-cache", () => ({
  revalidateProductsCache: revalidateProductsCacheMock,
}));
vi.mock("@/lib/payments/reconcile-expired-holds", () => ({
  reconcilePaymentHoldForOrder: reconcilePaymentHoldForOrderMock,
}));
vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: logWarnMock,
  }),
}));

const { registerCartRoutes } = await import("@/api/hono/routes/cart");
const { createRouteHarness } = await import("../helpers/route-harness");
const { createReservationToken, verifyReservationToken } = await import(
  "@/lib/cart/reservation-token"
);

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT = "33333333-3333-4333-8333-333333333333";
const THIRD_PRODUCT = "44444444-4444-4444-8444-444444444444";
const ORDER = "66666666-6666-4666-8666-666666666666";
const SLUG = "rose-silk";
const MINUTE = 60 * 1000;
const SHOPPER = {
  email: "shopper@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  role: "customer" as const,
};
const OTHER_SHOPPER = {
  email: "other@example.com",
  id: "55555555-5555-4555-8555-555555555555",
  role: "customer" as const,
};

const allMocks = [
  claimProductIntoCartMock,
  dbSelectMock,
  dbUpdateMock,
  expireCommerceHoldsForProductsMock,
  getBlouseProductIdSetMock,
  getUserCartItemMock,
  getViewerStateRowsMock,
  listLapsedOwnPaymentOrderIdsMock,
  listUserCartItemsMock,
  listUserCartLinesMock,
  logWarnMock,
  pruneUnownedCartRowsMock,
  rateLimitResponseMock,
  reconcilePaymentHoldForOrderMock,
  releaseCartHoldByTokenMock,
  removeOwnedCartItemMock,
  revalidateProductsCacheMock,
  upsertUnreservedMock,
];

const fromNow = (ms: number) => new Date(Date.now() + ms);

/** When a mock was first called, relative to every other mock. */
const firstCall = (mock: { mock: { invocationCallOrder: number[] } }) =>
  mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;

/** reconcilePaymentHoldForOrder's answer for an unpaid link handed back. */
const restoredPayment = () => ({
  kind: "released" as const,
  releasedProductIds: [],
  releasedSlugs: [],
  restoredProductIds: [PRODUCT],
  restoredSlugs: [SLUG],
});

const tokenFor = (reservedUntil: Date, productId = PRODUCT) =>
  createReservationToken({ productId, reservedUntil });

const noExpiry = (overrides: Record<string, unknown> = {}) => ({
  blockedProductIds: [],
  conflictOrderIds: [],
  ordinaryReleasedProductIds: [],
  paymentReleasedOrderIds: [],
  paymentReleasedProductIds: [],
  paymentReleasedSlugs: [],
  protectedProductIds: [],
  releasedProductIds: [],
  ...overrides,
});

/** What getViewerStateRows returns for one product, before the resolver. */
const viewerRow = (overrides: Record<string, unknown> = {}) => ({
  cartReservationToken: null,
  cartReservedUntil: null,
  cartStatus: null,
  hasPendingPayment: false,
  madeToOrderInBag: false,
  productId: PRODUCT,
  reservedUntil: null,
  stockStatus: "available",
  ...overrides,
});

/**
 * A reserved product, optionally with this viewer's line. The line's token is
 * signed for the line's own expiry, which may differ from the product's.
 */
const heldRow = ({
  cartReservedUntil,
  productId = PRODUCT,
  reservedUntil,
  ...overrides
}: Record<string, unknown> & {
  cartReservedUntil?: Date;
  productId?: string;
  reservedUntil: Date;
}) =>
  viewerRow({
    cartReservationToken: cartReservedUntil
      ? tokenFor(cartReservedUntil, productId)
      : null,
    cartReservedUntil: cartReservedUntil ?? null,
    cartStatus: cartReservedUntil ? "active" : null,
    productId,
    reservedUntil,
    stockStatus: "reserved",
    ...overrides,
  });

/** The row getUserCartItem returns. */
const bagRow = (
  reservedUntil: Date | null,
  overrides: Record<string, unknown> = {},
) => ({
  addedAt: new Date(),
  productId: PRODUCT,
  reservationToken: reservedUntil ? tokenFor(reservedUntil) : null,
  reservedUntil,
  selectedOptions: null,
  status: "active",
  ...overrides,
});

const cartLine = (overrides: Record<string, unknown> = {}) => ({
  addedAt: new Date("2026-09-08T10:00:00.000Z"),
  detailsFabric: "Silk",
  imageAlt: "Rose silk saree",
  imageUrl: "/rose.jpg",
  name: "Rose Silk",
  originalPricePaise: null,
  pricePaise: 125000,
  productId: PRODUCT,
  reservationToken: "server-only-proof",
  reservedUntil: null,
  selectedOptions: null,
  slug: SLUG,
  status: "active",
  ...overrides,
});

const removal = (overrides: Record<string, unknown> = {}) => ({
  cartReservedUntil: null,
  exactReservationMatch: false,
  paymentHoldActive: false,
  paymentProtected: false,
  productReservedUntil: null,
  productStockStatus: "available",
  reason: "RELEASED",
  released: true,
  removed: true,
  slug: SLUG,
  viewerState: "available",
  ...overrides,
});

const jsonBody = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

const selectChain = (rows: unknown[]) => {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, root: { from } };
};

const publishedProduct = (overrides: Record<string, unknown> = {}) =>
  selectChain([
    { id: PRODUCT, status: "published", stockStatus: "available", ...overrides },
  ]).root;

const route = (authUser: typeof SHOPPER | null = SHOPPER) =>
  createRouteHarness({ authUser, register: registerCartRoutes }).request;

const add = (authUser: typeof SHOPPER | null = SHOPPER) =>
  route(authUser)("/items", {
    method: "POST",
    ...jsonBody({ productId: PRODUCT }),
  });

const remove = (authUser: typeof SHOPPER | null = SHOPPER) =>
  route(authUser)(`/items/${PRODUCT}`, { method: "DELETE" });

beforeEach(() => {
  // Vitest's clearMocks keeps queued implementations; reset every one so no
  // case inherits another's database.
  for (const mock of allMocks) mock.mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", "test-reservation-secret");
  rateLimitResponseMock.mockResolvedValue(null);
  getBlouseProductIdSetMock.mockResolvedValue(new Set<string>());
  expireCommerceHoldsForProductsMock.mockResolvedValue(noExpiry());
  getUserCartItemMock.mockResolvedValue(null);
  getViewerStateRowsMock.mockResolvedValue([viewerRow()]);
  listUserCartItemsMock.mockResolvedValue([]);
  listUserCartLinesMock.mockResolvedValue([cartLine()]);
  removeOwnedCartItemMock.mockResolvedValue(null);
  upsertUnreservedMock.mockResolvedValue(true);
  listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([]);
  pruneUnownedCartRowsMock.mockResolvedValue([]);
  reconcilePaymentHoldForOrderMock.mockResolvedValue({ kind: "none" });
});

describe("GET /items — the bag, with the verdict every card reads", () => {
  it("refuses a signed-out shopper", async () => {
    const response = await route(null)("/items");

    expect(response.status).toBe(401);
    expect(listUserCartItemsMock).not.toHaveBeenCalled();
  });

  it("attaches the shared verdict to each line instead of trusting the row", async () => {
    const mine = fromNow(40 * MINUTE);
    const theirs = fromNow(50 * MINUTE);
    const lapsedPayment = fromNow(-MINUTE);
    listUserCartItemsMock.mockResolvedValue([
      bagRow(mine),
      bagRow(mine, { productId: OTHER_PRODUCT }),
      bagRow(lapsedPayment, { productId: THIRD_PRODUCT, status: "payment_pending" }),
    ]);
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [THIRD_PRODUCT] }),
    );
    listUserCartLinesMock.mockResolvedValue([
      cartLine({ reservedUntil: mine }),
      cartLine({ productId: OTHER_PRODUCT, reservedUntil: mine }),
      cartLine({
        productId: THIRD_PRODUCT,
        reservedUntil: lapsedPayment,
        status: "payment_pending",
      }),
    ]);
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ cartReservedUntil: mine, reservedUntil: mine }),
      // This shopper's leftover line; someone else now holds the saree.
      heldRow({
        cartReservedUntil: mine,
        productId: OTHER_PRODUCT,
        reservedUntil: theirs,
      }),
      // A lapsed link the sweep still protects stays this payer's payment.
      heldRow({
        cartReservedUntil: lapsedPayment,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        productId: THIRD_PRODUCT,
        reservedUntil: lapsedPayment,
      }),
    ]);

    const response = await route()("/items");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(
      payload.items.map((item: { productId: string; viewerState: string }) => [
        item.productId,
        item.viewerState,
      ]),
    ).toEqual([
      [PRODUCT, "in_my_cart"],
      [OTHER_PRODUCT, "reserved_by_other"],
      [THIRD_PRODUCT, "payment_pending"],
    ]);
    expect(getViewerStateRowsMock).toHaveBeenCalledWith(
      [PRODUCT, OTHER_PRODUCT, THIRD_PRODUCT],
      SHOPPER.id,
    );
  });

  it("answers an empty bag without asking for verdicts", async () => {
    const response = await route()("/items");

    expect(await response.json()).toEqual({ items: [] });
    expect(getViewerStateRowsMock).not.toHaveBeenCalled();
    expect(pruneUnownedCartRowsMock).not.toHaveBeenCalled();
    expect(listLapsedOwnPaymentOrderIdsMock).not.toHaveBeenCalled();
  });

  it("drops lines that own nothing after the sweep and before listing the bag", async () => {
    const mine = fromNow(40 * MINUTE);
    listUserCartItemsMock.mockResolvedValue([
      bagRow(mine),
      bagRow(fromNow(20 * MINUTE), { productId: OTHER_PRODUCT }),
    ]);
    // The bag as the database holds it before and after the prune.
    let pruned = false;
    pruneUnownedCartRowsMock.mockImplementation(async () => {
      pruned = true;
      return [OTHER_PRODUCT];
    });
    listUserCartLinesMock.mockImplementation(async () => [
      cartLine({ reservedUntil: mine }),
      ...(pruned ? [] : [cartLine({ productId: OTHER_PRODUCT, reservedUntil: mine })]),
    ]);
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ cartReservedUntil: mine, reservedUntil: mine }),
    ]);

    const response = await route()("/items");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(pruneUnownedCartRowsMock).toHaveBeenCalledOnce();
    expect(pruneUnownedCartRowsMock).toHaveBeenCalledWith({
      now: expect.any(Date),
      userId: SHOPPER.id,
    });
    expect(firstCall(expireCommerceHoldsForProductsMock)).toBeLessThan(
      firstCall(pruneUnownedCartRowsMock),
    );
    expect(firstCall(pruneUnownedCartRowsMock)).toBeLessThan(
      firstCall(listUserCartLinesMock),
    );
    expect(firstCall(listUserCartLinesMock)).toBeLessThan(
      firstCall(getViewerStateRowsMock),
    );
    expect(
      payload.items.map((item: { productId: string; viewerState: string }) => [
        item.productId,
        item.viewerState,
      ]),
    ).toEqual([[PRODUCT, "in_my_cart"]]);
    expect(getViewerStateRowsMock).toHaveBeenCalledWith([PRODUCT], SHOPPER.id);
  });

  describe("a payment link that outlived its hold", () => {
    it("is settled with the provider before the bag is swept, pruned or read", async () => {
      const lapsedPayment = fromNow(-MINUTE);
      const restored = fromNow(20 * MINUTE);
      listUserCartItemsMock.mockResolvedValue([
        bagRow(fromNow(40 * MINUTE), { productId: OTHER_PRODUCT }),
        bagRow(lapsedPayment, { status: "payment_pending" }),
      ]);
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([ORDER]);
      // Before reconciliation the line is a stalled payment; afterwards the
      // unpaid link has handed back the remaining cart time.
      let settled = false;
      reconcilePaymentHoldForOrderMock.mockImplementation(async () => {
        settled = true;
        return restoredPayment();
      });
      listUserCartLinesMock.mockImplementation(async () => [
        settled
          ? cartLine({ reservedUntil: restored })
          : cartLine({ reservedUntil: lapsedPayment, status: "payment_pending" }),
      ]);
      getViewerStateRowsMock.mockImplementation(async () => [
        settled
          ? heldRow({ cartReservedUntil: restored, reservedUntil: restored })
          : heldRow({
              cartReservedUntil: lapsedPayment,
              cartStatus: "payment_pending",
              hasPendingPayment: true,
              reservedUntil: lapsedPayment,
            }),
      ]);

      const response = await route()("/items");
      const payload = await response.json();

      // Only the line actually in payment is asked about.
      expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        productIds: [PRODUCT],
        userId: SHOPPER.id,
      });
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledOnce();
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledWith({
        now: listLapsedOwnPaymentOrderIdsMock.mock.calls[0]?.[0]?.now,
        orderId: ORDER,
      });
      expect(firstCall(reconcilePaymentHoldForOrderMock)).toBeLessThan(
        firstCall(expireCommerceHoldsForProductsMock),
      );
      expect(firstCall(reconcilePaymentHoldForOrderMock)).toBeLessThan(
        firstCall(pruneUnownedCartRowsMock),
      );
      expect(response.status).toBe(200);
      expect(payload.items).toEqual([
        expect.objectContaining({
          productId: PRODUCT,
          status: "active",
          viewerState: "in_my_cart",
        }),
      ]);
      expect(revalidateProductsCacheMock).toHaveBeenCalledWith([SLUG]);
    });

    it("never asks the provider when no line is in payment", async () => {
      listUserCartItemsMock.mockResolvedValue([bagRow(fromNow(40 * MINUTE))]);

      const response = await route()("/items");

      expect(response.status).toBe(200);
      expect(listLapsedOwnPaymentOrderIdsMock).not.toHaveBeenCalled();
      expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    });

    it("leaves a payment whose hold is still live alone", async () => {
      listUserCartItemsMock.mockResolvedValue([
        bagRow(fromNow(8 * MINUTE), { status: "payment_pending" }),
      ]);

      await route()("/items");

      expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledOnce();
      expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    });

    it("still answers with the resolver's verdict when the provider check throws", async () => {
      const lapsedPayment = fromNow(-MINUTE);
      const SECOND_ORDER = "77777777-7777-4777-8777-777777777777";
      listUserCartItemsMock.mockResolvedValue([
        bagRow(lapsedPayment, { status: "payment_pending" }),
      ]);
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([ORDER, SECOND_ORDER]);
      reconcilePaymentHoldForOrderMock
        .mockRejectedValueOnce(new Error("RAZORPAY_UNAVAILABLE"))
        .mockResolvedValueOnce({ kind: "deferred", reason: "PAYMENT_LINK_NOT_TERMINAL" });
      expireCommerceHoldsForProductsMock.mockResolvedValue(
        noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
      );
      listUserCartLinesMock.mockResolvedValue([
        cartLine({ reservedUntil: lapsedPayment, status: "payment_pending" }),
      ]);
      getViewerStateRowsMock.mockResolvedValue([
        heldRow({
          cartReservedUntil: lapsedPayment,
          cartStatus: "payment_pending",
          hasPendingPayment: true,
          reservedUntil: lapsedPayment,
        }),
      ]);

      const response = await route()("/items");

      expect(response.status).toBe(200);
      expect((await response.json()).items).toEqual([
        expect.objectContaining({ productId: PRODUCT, viewerState: "payment_pending" }),
      ]);
      // One failure does not stop the next order from being asked about.
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledTimes(2);
      expect(logWarnMock).toHaveBeenCalledWith(
        expect.stringContaining("reconciliation failed"),
        expect.objectContaining({ orderId: ORDER }),
      );
      expect(pruneUnownedCartRowsMock).toHaveBeenCalledOnce();
      expect(revalidateProductsCacheMock).not.toHaveBeenCalled();
    });

    it("still answers when the lapsed payments cannot even be listed", async () => {
      listUserCartItemsMock.mockResolvedValue([
        bagRow(fromNow(-MINUTE), { status: "payment_pending" }),
      ]);
      listLapsedOwnPaymentOrderIdsMock.mockRejectedValue(new Error("DB_UNAVAILABLE"));

      const response = await route()("/items");

      expect(response.status).toBe(200);
      expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
      expect(logWarnMock).toHaveBeenCalledOnce();
    });
  });
});

describe("POST /items — putting a saree in the bag", () => {
  it("refuses a signed-out shopper", async () => {
    const response = await add(null);

    expect(response.status).toBe(401);
    // Nothing is claimed for someone with no account.
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
  });

  it("claims the saree and returns a canonical item without exposing the proof", async () => {
    dbSelectMock.mockReturnValueOnce(publishedProduct());
    claimProductIntoCartMock.mockResolvedValue({
      reservedUntil: fromNow(60 * MINUTE),
      slug: SLUG,
    });

    const response = await add();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerState).toBe("in_my_cart");
    expect(payload.item).toMatchObject({
      productId: PRODUCT,
      slug: SLUG,
      status: "active",
      viewerState: "in_my_cart",
    });
    expect(payload).not.toHaveProperty("reservationToken");
    expect(payload.item).not.toHaveProperty("reservationToken");
    // The customer is taken from the session, never the body.
    expect(claimProductIntoCartMock.mock.calls[0]?.[0]?.userId).toBe(SHOPPER.id);
  });

  it("signs the exact value it writes", async () => {
    dbSelectMock.mockReturnValueOnce(publishedProduct());
    claimProductIntoCartMock.mockResolvedValue({
      reservedUntil: fromNow(60 * MINUTE),
      slug: SLUG,
    });

    await add();

    // Token and row must agree exactly, or release can never match again.
    const call = claimProductIntoCartMock.mock.calls[0]?.[0];
    const verified = verifyReservationToken(call.reservationToken);
    expect(verified?.reservedUntil.getTime()).toBe(call.reservedUntil.getTime());
  });

  it("hands the holder back their own hold without extending it", async () => {
    const reservedUntil = fromNow(30 * MINUTE);
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ cartReservedUntil: reservedUntil, reservedUntil }),
    ]);
    listUserCartLinesMock.mockResolvedValue([cartLine({ reservedUntil })]);

    const response = await add();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerState).toBe("in_my_cart");
    expect(payload.item.reservedUntil).toBe(reservedUntil.toISOString());
    expect(payload).not.toHaveProperty("reservationToken");
    // No re-claim, so the clock is untouched.
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
    expect(getViewerStateRowsMock).toHaveBeenCalledWith([PRODUCT], SHOPPER.id);
  });

  it("answers payment_pending only for the exact current payment hold", async () => {
    const paymentHold = fromNow(8 * MINUTE);
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({
        cartReservedUntil: paymentHold,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        reservedUntil: paymentHold,
      }),
    ]);
    listUserCartLinesMock.mockResolvedValue([
      cartLine({ reservedUntil: paymentHold, status: "payment_pending" }),
    ]);

    const response = await add();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerState).toBe("payment_pending");
    expect(payload.item.viewerState).toBe("payment_pending");
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
  });

  it("never reads a leftover pending order as this line's payment", async () => {
    const hold = fromNow(30 * MINUTE);
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ cartReservedUntil: hold, hasPendingPayment: true, reservedUntil: hold }),
    ]);

    const response = await add();

    expect((await response.json()).viewerState).toBe("in_my_cart");
  });

  it("gives another shopper a conflict, not the saree", async () => {
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ reservedUntil: fromNow(MINUTE) }),
    ]);
    claimProductIntoCartMock.mockResolvedValue(null);

    const response = await add();
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("PRODUCT_RESERVED");
    expect(payload.viewerState).toBe("reserved_by_other");
  });

  it("tells the payer a lapsed, unreconciled link is still their payment", async () => {
    const lapsed = fromNow(-MINUTE);
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
    );
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({
        cartReservedUntil: lapsed,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        reservedUntil: lapsed,
      }),
    ]);

    const response = await add();
    const payload = await response.json();

    // A lapsed hold only reads payment_pending because the sweep's protection
    // was passed to the resolver; unprotected it would read available.
    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "PAYMENT_IN_PROGRESS",
      viewerState: "payment_pending",
    });
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
    expect(upsertUnreservedMock).not.toHaveBeenCalled();
  });

  it("tells anyone else that a protected payment hold is reserved", async () => {
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
    );
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ reservedUntil: fromNow(-MINUTE) }),
    ]);

    const response = await add();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PRODUCT_RESERVED",
      viewerState: "reserved_by_other",
    });
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
  });

  it("produces exactly one winner across concurrent adds", async () => {
    dbSelectMock.mockReturnValue(publishedProduct());
    let claims = 0;
    claimProductIntoCartMock.mockImplementation(async () => {
      claims += 1;
      return claims === 1 ? { reservedUntil: fromNow(60 * MINUTE), slug: SLUG } : null;
    });

    const responses = await Promise.all(Array.from({ length: 20 }, () => add()));
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
  });

  describe("two different accounts cannot own the same saree", () => {
    it("lets exactly one account own it, whichever request lands first", async () => {
      let holder: null | { reservedUntil: Date; token: string; userId: string } =
        null;
      dbSelectMock.mockReturnValue(publishedProduct());
      // The guarded UPDATE matches nothing once the piece is held.
      claimProductIntoCartMock.mockImplementation(
        async (input: { reservationToken: string; reservedUntil: Date; userId: string }) => {
          if (holder) return null;
          holder = {
            reservedUntil: input.reservedUntil,
            token: input.reservationToken,
            userId: input.userId,
          };
          return { reservedUntil: input.reservedUntil, slug: SLUG };
        },
      );
      getViewerStateRowsMock.mockImplementation(
        async (_ids: string[], userId: string) => {
          if (!holder) return [viewerRow()];
          return [
            holder.userId === userId
              ? viewerRow({
                  cartReservationToken: holder.token,
                  cartReservedUntil: holder.reservedUntil,
                  cartStatus: "active",
                  reservedUntil: holder.reservedUntil,
                  stockStatus: "reserved",
                })
              : viewerRow({ reservedUntil: holder.reservedUntil, stockStatus: "reserved" }),
          ];
        },
      );

      const responses = await Promise.all([add(SHOPPER), add(OTHER_SHOPPER)]);
      const answers = await Promise.all(
        responses.map(async (response) => ({
          body: await response.json(),
          status: response.status,
        })),
      );

      const winners = answers.filter((answer) => answer.status === 200);
      const losers = answers.filter((answer) => answer.status === 409);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(winners[0]?.body.viewerState).toBe("in_my_cart");
      expect(losers[0]?.body).toMatchObject({
        code: "PRODUCT_RESERVED",
        viewerState: "reserved_by_other",
      });
      expect(
        claimProductIntoCartMock.mock.calls.map(([input]) => input.userId).sort(),
      ).toEqual([SHOPPER.id, OTHER_SHOPPER.id].sort());
    });

    it("never hands the saree to a second account's line one millisecond off the hold", async () => {
      const hold = fromNow(45 * MINUTE);
      const stale = new Date(hold.getTime() - 1);
      dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "reserved" }));
      getViewerStateRowsMock.mockResolvedValue([
        heldRow({ cartReservedUntil: stale, reservedUntil: hold }),
      ]);
      claimProductIntoCartMock.mockResolvedValue(null);

      const response = await add(OTHER_SHOPPER);

      expect(response.status).toBe(409);
      expect((await response.json()).viewerState).toBe("reserved_by_other");
      expect(claimProductIntoCartMock).toHaveBeenCalledOnce();
      expect(claimProductIntoCartMock.mock.calls[0]?.[0]?.userId).toBe(
        OTHER_SHOPPER.id,
      );
    });
  });

  it("never holds a made-to-order blouse", async () => {
    getBlouseProductIdSetMock.mockResolvedValue(new Set([PRODUCT]));
    dbSelectMock.mockReturnValueOnce(publishedProduct());

    const response = await route()("/items", {
      method: "POST",
      ...jsonBody({ productId: PRODUCT, selectedOptions: { size: "M" } }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.reservedUntil).toBeNull();
    expect(payload.item.viewerState).toBe("in_my_cart");
    expect(payload).not.toHaveProperty("reservationToken");
    // It stays available to every other shopper.
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
    expect(upsertUnreservedMock).toHaveBeenCalledOnce();
  });

  it("never revives a sold product through the mutable blouse classification", async () => {
    getBlouseProductIdSetMock.mockResolvedValue(new Set([PRODUCT]));
    dbSelectMock.mockReturnValueOnce(publishedProduct({ stockStatus: "sold" }));

    const response = await route()("/items", {
      method: "POST",
      ...jsonBody({ productId: PRODUCT, selectedOptions: { size: "M" } }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PRODUCT_SOLD",
      viewerState: "sold",
    });
    expect(upsertUnreservedMock).not.toHaveBeenCalled();
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
  });

  it("404s for a piece that is not published", async () => {
    dbSelectMock.mockReturnValueOnce(publishedProduct({ status: "draft" }));

    const response = await add();

    expect(response.status).toBe(404);
    expect(claimProductIntoCartMock).not.toHaveBeenCalled();
  });

  it("frees a lapsed hold on the way in, with no cron", async () => {
    dbSelectMock.mockReturnValueOnce(publishedProduct());
    claimProductIntoCartMock.mockResolvedValue({
      reservedUntil: fromNow(60 * MINUTE),
      slug: SLUG,
    });

    await add();

    expect(expireCommerceHoldsForProductsMock).toHaveBeenCalledWith(
      [PRODUCT],
      expect.any(Date),
    );
  });
});

describe("DELETE /items/:productId — taking it back out", () => {
  it("refuses a signed-out shopper", async () => {
    const response = await remove(null);

    expect(response.status).toBe(401);
    expect(getUserCartItemMock).not.toHaveBeenCalled();
    expect(removeOwnedCartItemMock).not.toHaveBeenCalled();
  });

  it("releases a hold this bag exactly owns and answers + Cart", async () => {
    const reservedUntil = fromNow(30 * MINUTE);
    const item = bagRow(reservedUntil);
    getUserCartItemMock.mockResolvedValue(item);
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: reservedUntil,
        exactReservationMatch: true,
        productReservedUntil: reservedUntil,
        productStockStatus: "reserved",
      }),
    );

    const response = await remove();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(payload).toEqual({
      productId: PRODUCT,
      reason: "RELEASED",
      released: true,
      removed: true,
      viewerState: "available",
    });
    expect(removeOwnedCartItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT,
        reservationToken: item.reservationToken,
        reservedUntil,
        userId: SHOPPER.id,
      }),
    );
    expect(revalidateProductsCacheMock).toHaveBeenCalledWith([SLUG]);
  });

  it("never releases this shopper's live payment hold, and says so", async () => {
    const paymentHold = fromNow(8 * MINUTE);
    getUserCartItemMock.mockResolvedValue(
      bagRow(paymentHold, { status: "payment_pending" }),
    );
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: paymentHold,
        exactReservationMatch: true,
        paymentHoldActive: true,
        productReservedUntil: paymentHold,
        productStockStatus: "reserved",
        reason: "PAYMENT_IN_PROGRESS",
        released: false,
        removed: false,
        viewerState: "payment_pending",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({
        cartReservedUntil: paymentHold,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        reservedUntil: paymentHold,
      }),
    ]);

    const response = await remove();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      reason: "PAYMENT_IN_PROGRESS",
      released: false,
      removed: false,
      viewerState: "payment_pending",
    });
  });

  it("keeps a lapsed, unreconciled payment protected for its payer", async () => {
    const lapsed = fromNow(-MINUTE);
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
    );
    getUserCartItemMock.mockResolvedValue(bagRow(lapsed, { status: "payment_pending" }));
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        paymentHoldActive: true,
        productStockStatus: "reserved",
        reason: "PAYMENT_IN_PROGRESS",
        released: false,
        removed: false,
        viewerState: "payment_pending",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({
        cartReservedUntil: lapsed,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        reservedUntil: lapsed,
      }),
    ]);

    const response = await remove();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      removed: false,
      viewerState: "payment_pending",
    });
    // The locked statement decided; the route did not pre-empt it.
    expect(removeOwnedCartItemMock).toHaveBeenCalledOnce();
  });

  it("never lets a stale pending order on the piece block this shopper's removal", async () => {
    // Someone's lapsed payment still protects the product, but this shopper's
    // line is an old hold that owns nothing. The old route refused with 409
    // before the removal statement ever ran.
    const theirLapsedPayment = fromNow(-MINUTE);
    const myOldHold = new Date(theirLapsedPayment.getTime() - 20 * MINUTE);
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
    );
    getUserCartItemMock.mockResolvedValue(bagRow(myOldHold));
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: myOldHold,
        productReservedUntil: theirLapsedPayment,
        productStockStatus: "reserved",
        reason: "STALE_ROW",
        released: false,
        viewerState: "available",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({ reservedUntil: theirLapsedPayment }),
    ]);

    const response = await remove();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      reason: "STALE_ROW",
      released: false,
      removed: true,
      viewerState: "reserved_by_other",
    });
    expect(removeOwnedCartItemMock).toHaveBeenCalledOnce();
  });

  it("drops the line but keeps the piece held when a pending order that is not this shopper's payment protects it", async () => {
    // This shopper's line matches the product's lapsed hold exactly, but the
    // pending order at that expiry is not their current payment. The line
    // goes; the piece waits for provider-aware reconciliation.
    const lapsed = fromNow(-MINUTE);
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
    );
    getUserCartItemMock.mockResolvedValue(bagRow(lapsed));
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: lapsed,
        exactReservationMatch: true,
        paymentProtected: true,
        productReservedUntil: lapsed,
        productStockStatus: "reserved",
        reason: "REMOVED_PAYMENT_PROTECTED",
        released: false,
        removed: true,
        viewerState: "reserved_by_other",
      }),
    );
    // After the delete this viewer has no line; the resolver decides.
    getViewerStateRowsMock.mockResolvedValue([heldRow({ reservedUntil: lapsed })]);

    const response = await remove();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      productId: PRODUCT,
      reason: "REMOVED_PAYMENT_PROTECTED",
      released: false,
      removed: true,
      // Past its time, it reads reserved only because the sweep's protection
      // reached the resolver; the route did not invent it.
      viewerState: "reserved_by_other",
    });
    expect(revalidateProductsCacheMock).not.toHaveBeenCalled();
  });

  it("never releases another shopper's hold from a stale row", async () => {
    const mine = fromNow(60 * MINUTE);
    const theirs = new Date(mine.getTime() + 700);
    getUserCartItemMock.mockResolvedValue(bagRow(mine));
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: mine,
        productReservedUntil: theirs,
        productStockStatus: "reserved",
        reason: "STALE_ROW",
        released: false,
        viewerState: "reserved_by_other",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([heldRow({ reservedUntil: theirs })]);

    const response = await remove();
    const payload = await response.json();

    expect(payload.released).toBe(false);
    expect(payload.viewerState).toBe("reserved_by_other");
    expect(revalidateProductsCacheMock).not.toHaveBeenCalled();
  });

  it("reports a sold saree without trying to release it", async () => {
    getUserCartItemMock.mockResolvedValue(bagRow(null));
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        productStockStatus: "sold",
        reason: "SOLD",
        released: false,
        viewerState: "sold",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([viewerRow({ stockStatus: "sold" })]);

    const response = await remove();
    const payload = await response.json();

    expect(payload.viewerState).toBe("sold");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("keeps an active row and returns 409 with the verdict when its signed proof is invalid", async () => {
    const reservedUntil = fromNow(30 * MINUTE);
    getUserCartItemMock.mockResolvedValue(
      bagRow(reservedUntil, { reservationToken: "tampered-token" }),
    );
    removeOwnedCartItemMock.mockResolvedValue(
      removal({
        cartReservedUntil: reservedUntil,
        exactReservationMatch: true,
        productReservedUntil: reservedUntil,
        productStockStatus: "reserved",
        reason: "RELEASE_MISSED",
        released: false,
        removed: false,
        viewerState: "reserved_by_other",
      }),
    );
    getViewerStateRowsMock.mockResolvedValue([
      heldRow({
        cartReservationToken: "tampered-token",
        cartReservedUntil: reservedUntil,
        reservedUntil,
      }),
    ]);

    const response = await remove();
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "RESERVATION_PROOF_INVALID",
      viewerState: "reserved_by_other",
    });
    expect(removeOwnedCartItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ reservationToken: null, reservedUntil: null }),
    );
  });

  describe("a payment link that outlived its hold", () => {
    it("is settled for this piece before the removal reads the line", async () => {
      const lapsed = fromNow(-MINUTE);
      const restored = fromNow(20 * MINUTE);
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([ORDER]);
      let settled = false;
      reconcilePaymentHoldForOrderMock.mockImplementation(async () => {
        settled = true;
        return restoredPayment();
      });
      getUserCartItemMock.mockImplementation(async () =>
        settled ? bagRow(restored) : bagRow(lapsed, { status: "payment_pending" }),
      );
      removeOwnedCartItemMock.mockResolvedValue(
        removal({
          cartReservedUntil: restored,
          exactReservationMatch: true,
          productReservedUntil: restored,
          productStockStatus: "reserved",
        }),
      );

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reason: "RELEASED",
        released: true,
        removed: true,
        viewerState: "available",
      });
      expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        productIds: [PRODUCT],
        userId: SHOPPER.id,
      });
      expect(reconcilePaymentHoldForOrderMock).toHaveBeenCalledWith({
        now: expect.any(Date),
        orderId: ORDER,
      });
      expect(firstCall(reconcilePaymentHoldForOrderMock)).toBeLessThan(
        firstCall(expireCommerceHoldsForProductsMock),
      );
      expect(firstCall(reconcilePaymentHoldForOrderMock)).toBeLessThan(
        firstCall(getUserCartItemMock),
      );
      // The restored line's own proof is what released it.
      expect(removeOwnedCartItemMock).toHaveBeenCalledWith(
        expect.objectContaining({ reservedUntil: restored }),
      );
    });

    it("leaves the provider alone when this piece has no lapsed payment", async () => {
      getUserCartItemMock.mockResolvedValue(bagRow(fromNow(30 * MINUTE)));
      removeOwnedCartItemMock.mockResolvedValue(
        removal({ productStockStatus: "reserved" }),
      );

      const response = await remove();

      expect(response.status).toBe(200);
      expect(listLapsedOwnPaymentOrderIdsMock).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: [PRODUCT] }),
      );
      expect(reconcilePaymentHoldForOrderMock).not.toHaveBeenCalled();
    });

    it("still answers with the resolver's verdict when the provider check throws", async () => {
      const lapsed = fromNow(-MINUTE);
      listLapsedOwnPaymentOrderIdsMock.mockResolvedValue([ORDER]);
      reconcilePaymentHoldForOrderMock.mockRejectedValue(
        new Error("RAZORPAY_UNAVAILABLE"),
      );
      expireCommerceHoldsForProductsMock.mockResolvedValue(
        noExpiry({ blockedProductIds: [PRODUCT], protectedProductIds: [PRODUCT] }),
      );
      getUserCartItemMock.mockResolvedValue(
        bagRow(lapsed, { status: "payment_pending" }),
      );
      removeOwnedCartItemMock.mockResolvedValue(
        removal({
          paymentHoldActive: true,
          paymentProtected: true,
          productStockStatus: "reserved",
          reason: "PAYMENT_IN_PROGRESS",
          released: false,
          removed: false,
          viewerState: "payment_pending",
        }),
      );
      getViewerStateRowsMock.mockResolvedValue([
        heldRow({
          cartReservedUntil: lapsed,
          cartStatus: "payment_pending",
          hasPendingPayment: true,
          reservedUntil: lapsed,
        }),
      ]);

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reason: "PAYMENT_IN_PROGRESS",
        removed: false,
        viewerState: "payment_pending",
      });
      expect(logWarnMock).toHaveBeenCalledWith(
        expect.stringContaining("reconciliation failed"),
        expect.objectContaining({ orderId: ORDER }),
      );
      expect(removeOwnedCartItemMock).toHaveBeenCalledOnce();
    });
  });

  describe("retries are idempotent", () => {
    it("answers a line that is already gone with success and the authoritative verdict", async () => {
      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        productId: PRODUCT,
        reason: "ALREADY_REMOVED",
        released: false,
        removed: true,
        viewerState: "available",
      });
      expect(removeOwnedCartItemMock).not.toHaveBeenCalled();
      expect(dbUpdateMock).not.toHaveBeenCalled();
    });

    it("never calls an already-gone piece available while another shopper holds it", async () => {
      getViewerStateRowsMock.mockResolvedValue([
        heldRow({ reservedUntil: fromNow(20 * MINUTE) }),
      ]);

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reason: "ALREADY_REMOVED",
        viewerState: "reserved_by_other",
      });
    });

    /** The status-blind products.id lookup, answering with these rows. */
    const productExists = (rows: unknown[]) => {
      const where = vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) }));
      const from = vi.fn(() => ({ where }));
      dbSelectMock.mockReturnValueOnce({ from });
      return { from, where };
    };

    it("404s only for a product that does not exist", async () => {
      getViewerStateRowsMock.mockResolvedValue([]);
      const lookup = productExists([]);

      const response = await remove();

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("PRODUCT_NOT_FOUND");
      expect(dbSelectMock).toHaveBeenCalledWith({ id: "products.id" });
      expect(lookup.where).toHaveBeenCalledWith({
        args: ["products.id", PRODUCT],
        op: "eq",
      });
    });

    it("answers a retry for an existing draft or unpublished piece as already removed", async () => {
      // No published verdict row, but the product exists: its status must not
      // turn an idempotent retry into a 404.
      getViewerStateRowsMock.mockResolvedValue([]);
      const lookup = productExists([{ id: PRODUCT }]);

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        productId: PRODUCT,
        reason: "ALREADY_REMOVED",
        released: false,
        removed: true,
      });
      // Existence only: no status predicate rides along with the id.
      expect(dbSelectMock).toHaveBeenCalledWith({ id: "products.id" });
      expect(lookup.where).toHaveBeenCalledWith({
        args: ["products.id", PRODUCT],
        op: "eq",
      });
      expect(removeOwnedCartItemMock).not.toHaveBeenCalled();
    });

    it("answers a lost race on an unpublished piece as already removed too", async () => {
      getUserCartItemMock.mockResolvedValue(bagRow(fromNow(30 * MINUTE)));
      removeOwnedCartItemMock.mockResolvedValue(null);
      getViewerStateRowsMock.mockResolvedValue([]);
      productExists([{ id: PRODUCT }]);

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reason: "ALREADY_REMOVED",
        removed: true,
      });
    });

    it("answers a sequential retry as already removed", async () => {
      const reservedUntil = fromNow(30 * MINUTE);
      getUserCartItemMock
        .mockResolvedValueOnce(bagRow(reservedUntil))
        .mockResolvedValueOnce(null);
      removeOwnedCartItemMock.mockResolvedValueOnce(
        removal({ productReservedUntil: reservedUntil, productStockStatus: "reserved" }),
      );

      const first = await remove();
      const second = await remove();

      expect(await first.json()).toMatchObject({ reason: "RELEASED", removed: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({
        reason: "ALREADY_REMOVED",
        removed: true,
        viewerState: "available",
      });
      expect(removeOwnedCartItemMock).toHaveBeenCalledOnce();
    });

    it("treats a lost race as the removal that already happened", async () => {
      getUserCartItemMock.mockResolvedValue(bagRow(fromNow(30 * MINUTE)));
      removeOwnedCartItemMock.mockResolvedValue(null);

      const response = await remove();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reason: "ALREADY_REMOVED",
        removed: true,
        viewerState: "available",
      });
    });

    it("answers two concurrent removals with two handled successes", async () => {
      getUserCartItemMock.mockResolvedValue(bagRow(fromNow(30 * MINUTE)));
      removeOwnedCartItemMock
        .mockResolvedValueOnce(removal({ productStockStatus: "reserved" }))
        .mockResolvedValueOnce(null);

      const responses = await Promise.all([remove(), remove()]);
      const payloads = await Promise.all(responses.map((response) => response.json()));

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(payloads.every((payload) => payload.removed === true)).toBe(true);
      expect(payloads.map((payload) => payload.reason).sort()).toEqual([
        "ALREADY_REMOVED",
        "RELEASED",
      ]);
    });
  });
});

describe("remove, then add the same saree straight back", () => {
  it("claims a fresh hour-long hold at once, signed for that exact instant", async () => {
    const oldHold = fromNow(25 * MINUTE);
    getUserCartItemMock.mockResolvedValueOnce(bagRow(oldHold));
    removeOwnedCartItemMock.mockResolvedValueOnce(
      removal({ productReservedUntil: oldHold, productStockStatus: "reserved" }),
    );
    dbSelectMock.mockReturnValueOnce(publishedProduct());
    claimProductIntoCartMock.mockImplementation(
      async (input: { reservedUntil: Date }) => ({
        reservedUntil: input.reservedUntil,
        slug: SLUG,
      }),
    );

    const removed = await remove();
    expect(await removed.json()).toMatchObject({
      removed: true,
      viewerState: "available",
    });

    const before = Date.now();
    const added = await add();
    const after = Date.now();

    expect(added.status).toBe(200);
    expect((await added.json()).viewerState).toBe("in_my_cart");
    const claim = claimProductIntoCartMock.mock.calls[0]?.[0];
    expect(claim.reservedUntil.getTime()).toBeGreaterThanOrEqual(before + 60 * MINUTE);
    expect(claim.reservedUntil.getTime()).toBeLessThanOrEqual(after + 60 * MINUTE);
    const proof = verifyReservationToken(claim.reservationToken);
    expect(proof?.productId).toBe(PRODUCT);
    expect(proof?.reservedUntil.getTime()).toBe(claim.reservedUntil.getTime());
  });
});

describe("the release predicate", () => {
  const cartRoute = source("api/hono/routes/cart.ts");

  it("matches the hold exactly, never approximately", () => {
    const query = source("db/queries/user-cart.ts");
    expect(query).toContain("product.reserved_until = locked.cart_reserved_until");
    expect(query).toContain("locked.cart_reservation_token =");
  });

  it("keeps compatibility release exact and clears a matching server bag row", () => {
    const query = source("db/queries/user-cart.ts");
    expect(cartRoute).toContain("releaseCartHoldByToken({");
    expect(query).toContain("cart.reservation_token = ${reservationToken}");
    expect(query).toContain("cart.reserved_until = locked.reserved_until");
  });
});
