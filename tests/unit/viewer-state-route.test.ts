/**
 * POST /api/v2/products/viewer-state — the verdict every card polls for.
 *
 * The route adds nothing of its own: it sweeps lapsed ordinary holds, reads
 * this viewer's rows and hands them to the shared resolver with the sweep's
 * payment protection. These cases prove the answer is exactly that, for a
 * whole page in one request, and never cacheable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expireCommerceHoldsForProductsMock = vi.hoisted(() => vi.fn());
const getPublicProductStockByIdsMock = vi.hoisted(() => vi.fn());
const getTimedPublicProductBySlugMock = vi.hoisted(() => vi.fn());
const getViewerStateRowsMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/user-cart", () => ({
  expireCommerceHoldsForProducts: expireCommerceHoldsForProductsMock,
  getViewerStateRows: getViewerStateRowsMock,
}));

// Everything else products.ts loads, stubbed as the other product route
// tests do; none of it is reached by this route.
vi.mock("@/db/queries/products", () => ({
  bulkSetProductTags: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  deriveQuantityAvailable: vi.fn(),
  duplicateProduct: vi.fn(),
  getProduct: vi.fn(),
  getProductBySlug: vi.fn(),
  getProductsByIds: vi.fn(),
  getPublicProductStockByIds: getPublicProductStockByIdsMock,
  getPublicProductStockBySlug: vi.fn(),
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
  updateProductsBatch: vi.fn(),
}));
vi.mock("@/db/queries/collections", () => ({
  bulkAddProductsToCollection: vi.fn(),
  bulkRemoveProductsFromCollection: vi.fn(),
}));
vi.mock("@/lib/ai/embeddings", () => ({ refreshProductEmbedding: vi.fn() }));
vi.mock("@/lib/ai/recommendations", () => ({ recommendProducts: vi.fn() }));
vi.mock("@/lib/ai/tag-suggestions", () => ({ suggestTagIds: vi.fn() }));
vi.mock("@/lib/config/flags", () => ({ isInventoryV2: vi.fn() }));
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: rateLimitResponseMock,
}));
vi.mock("@/lib/data/products", () => ({
  getTimedPublicProductBySlug: getTimedPublicProductBySlugMock,
}));

const { registerProductRoutes } = await import("@/api/hono/routes/products");
const { createRouteHarness } = await import("../helpers/route-harness");
const { createReservationToken } = await import("@/lib/cart/reservation-token");
const { MAX_VIEWER_STATE_IDS, resolveViewerStates } = await import(
  "@/lib/commerce/viewer-state"
);

const NOW = new Date("2026-09-08T12:00:00.000Z");
const LIVE = new Date(NOW.getTime() + 30 * 60 * 1000);
const LAPSED = new Date(NOW.getTime() - 60 * 1000);
const SHOPPER = {
  email: "shopper@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  role: "customer" as const,
};

/** A distinct, valid v4 UUID per index. */
const productId = (index: number) =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;

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
const viewerRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  cartReservationToken: null,
  cartReservedUntil: null,
  cartStatus: null,
  hasPendingPayment: false,
  madeToOrderInBag: false,
  productId: id,
  reservedUntil: null,
  stockStatus: "available",
  ...overrides,
});

const askFor = (
  productIds: string[],
  authUser: typeof SHOPPER | null = SHOPPER,
) =>
  createRouteHarness({ authUser, register: registerProductRoutes }).request(
    "/viewer-state",
    {
      body: JSON.stringify({ productIds }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

beforeEach(() => {
  for (const mock of [
    expireCommerceHoldsForProductsMock,
    getPublicProductStockByIdsMock,
    getTimedPublicProductBySlugMock,
    getViewerStateRowsMock,
    rateLimitResponseMock,
  ]) {
    mock.mockReset();
  }
  // Only Date is faked, so the route's `now` is this test's NOW.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXTAUTH_SECRET", "test-reservation-secret");
  rateLimitResponseMock.mockResolvedValue(null);
  expireCommerceHoldsForProductsMock.mockResolvedValue(noExpiry());
  getViewerStateRowsMock.mockImplementation(async (ids: string[]) =>
    ids.map((id) => viewerRow(id)),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /viewer-state", () => {
  it("answers privately, never from a shared cache", async () => {
    const response = await askFor([productId(1)]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers a whole page of MAX_VIEWER_STATE_IDS ids in one request", async () => {
    const ids = Array.from({ length: MAX_VIEWER_STATE_IDS }, (_, index) =>
      productId(index + 1),
    );

    const response = await askFor(ids);
    const payload = await response.json();

    expect(MAX_VIEWER_STATE_IDS).toBe(200);
    expect(response.status).toBe(200);
    expect(Object.keys(payload.products)).toHaveLength(200);
    expect(expireCommerceHoldsForProductsMock).toHaveBeenCalledOnce();
    expect(getViewerStateRowsMock).toHaveBeenCalledOnce();
    expect(getViewerStateRowsMock).toHaveBeenCalledWith(ids, SHOPPER.id);
  });

  it("refuses one id more without touching inventory", async () => {
    const ids = Array.from({ length: MAX_VIEWER_STATE_IDS + 1 }, (_, index) =>
      productId(index + 1),
    );

    const response = await askFor(ids);

    expect(response.status).toBe(400);
    expect(expireCommerceHoldsForProductsMock).not.toHaveBeenCalled();
    expect(getViewerStateRowsMock).not.toHaveBeenCalled();
  });

  it("gives every id the shared resolver's verdict, with the sweep's payment protection", async () => {
    const [
      available,
      mine,
      theirs,
      theirLapsedPayment,
      myLapsedPayment,
      lapsedUnprotected,
      sold,
      unpublished,
    ] = Array.from({ length: 8 }, (_, index) => productId(index + 1));
    const ids = [
      available,
      mine,
      theirs,
      theirLapsedPayment,
      myLapsedPayment,
      lapsedUnprotected,
      sold,
      unpublished,
    ];
    const blocked = [theirLapsedPayment, myLapsedPayment];
    const rows = [
      viewerRow(available),
      viewerRow(mine, {
        cartReservationToken: createReservationToken({
          productId: mine,
          reservedUntil: LIVE,
        }),
        cartReservedUntil: LIVE,
        cartStatus: "active",
        reservedUntil: LIVE,
        stockStatus: "reserved",
      }),
      viewerRow(theirs, { reservedUntil: LIVE, stockStatus: "reserved" }),
      viewerRow(theirLapsedPayment, {
        reservedUntil: LAPSED,
        stockStatus: "reserved",
      }),
      viewerRow(myLapsedPayment, {
        cartReservedUntil: LAPSED,
        cartStatus: "payment_pending",
        hasPendingPayment: true,
        reservedUntil: LAPSED,
        stockStatus: "reserved",
      }),
      viewerRow(lapsedUnprotected, {
        reservedUntil: LAPSED,
        stockStatus: "reserved",
      }),
      viewerRow(sold, { stockStatus: "sold" }),
      // No row for the unpublished piece: there is no verdict to give.
    ];
    expireCommerceHoldsForProductsMock.mockResolvedValue(
      noExpiry({ blockedProductIds: blocked, protectedProductIds: blocked }),
    );
    getViewerStateRowsMock.mockResolvedValue(rows);

    const response = await askFor(ids);
    const payload = await response.json();

    expect(expireCommerceHoldsForProductsMock).toHaveBeenCalledWith(ids, NOW);
    expect(getViewerStateRowsMock).toHaveBeenCalledWith(ids, SHOPPER.id);
    expect(
      expireCommerceHoldsForProductsMock.mock.invocationCallOrder[0],
    ).toBeLessThan(getViewerStateRowsMock.mock.invocationCallOrder[0]!);
    expect(payload.products).toEqual(
      resolveViewerStates(
        rows.map((row) => ({
          ...row,
          paymentProtected: blocked.includes(row.productId),
        })),
        NOW,
      ),
    );
    expect(
      Object.fromEntries(
        Object.entries(
          payload.products as Record<string, { state: string }>,
        ).map(([id, verdict]) => [id, verdict.state]),
      ),
    ).toEqual({
      [available]: "available",
      [lapsedUnprotected]: "available",
      [mine]: "in_my_cart",
      // Past its time, but a pending order still protects it.
      [myLapsedPayment]: "payment_pending",
      [sold]: "sold",
      [theirLapsedPayment]: "reserved_by_other",
      [theirs]: "reserved_by_other",
    });
    expect(payload.products).not.toHaveProperty(unpublished);
  });

  it("answers a signed-out viewer with the public verdict", async () => {
    const id = productId(1);
    getViewerStateRowsMock.mockResolvedValue([
      viewerRow(id, { reservedUntil: LIVE, stockStatus: "reserved" }),
    ]);

    const response = await askFor([id], null);
    const payload = await response.json();

    expect(getViewerStateRowsMock).toHaveBeenCalledWith([id], null);
    expect(payload.products[id]).toEqual({
      reservedUntil: LIVE.toISOString(),
      state: "reserved_by_other",
    });
  });
});
