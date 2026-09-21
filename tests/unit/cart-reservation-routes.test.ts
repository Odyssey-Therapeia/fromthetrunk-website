import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());
const getBlouseProductIdSetMock = vi.hoisted(() =>
  vi.fn(async () => new Set<string>()),
);
const expireCommerceHoldsForProductsMock = vi.hoisted(() => vi.fn());
const releaseCartHoldByTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

// Blouses are made-to-order and skip the hold entirely. Default: no blouses, so
// every product flows through the normal one-of-one reservation path.
vi.mock("@/db/queries/products", () => ({
  getBlouseProductIdSet: getBlouseProductIdSetMock,
}));

vi.mock("@/db/queries/user-cart", () => ({
  expireCommerceHoldsForProducts: expireCommerceHoldsForProductsMock,
  releaseCartHoldByToken: releaseCartHoldByTokenMock,
}));

vi.mock("@/db/schema", () => ({
  products: {
    id: "products.id",
    quantityAvailable: "products.quantityAvailable",
    reservedUntil: "products.reservedUntil",
    slug: "products.slug",
    stockStatus: "products.stockStatus",
    updatedAt: "products.updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  inArray: (column: unknown, values: unknown[]) => ({
    op: "inArray",
    column,
    values,
  }),
  isNotNull: (column: unknown) => ({ op: "isNotNull", column }),
  lt: (column: unknown, value: unknown) => ({ op: "lt", column, value }),
  or: (...args: unknown[]) => ({ op: "or", args }),
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: rateLimitResponseMock,
}));

import { registerCartRoutes } from "@/api/hono/routes/cart";
import { createReservationToken } from "@/lib/cart/reservation-token";
import { createRouteHarness } from "../helpers/route-harness";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_SLUG = "powder-blue-georgette-saree";

const jsonBody = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

const makeSelectLimitChain = (rows: unknown[]) => {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, limit, root: { from }, where };
};

const makeSelectWhereChain = (rows: unknown[]) => {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  return { from, root: { from }, where };
};

const route = () =>
  createRouteHarness({
    authUser: null,
    register: registerCartRoutes,
  }).request;

describe("cart reservation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXTAUTH_SECRET", "test-reservation-secret");
    rateLimitResponseMock.mockResolvedValue(null);
    getBlouseProductIdSetMock.mockResolvedValue(new Set<string>());
    expireCommerceHoldsForProductsMock.mockResolvedValue({
      blockedProductIds: [],
      conflictOrderIds: [],
      ordinaryReleasedProductIds: [],
      paymentReleasedOrderIds: [],
      paymentReleasedProductIds: [],
      paymentReleasedSlugs: [],
      protectedProductIds: [],
      releasedProductIds: [],
    });
    releaseCartHoldByTokenMock.mockResolvedValue(null);
  });

  it("retires legacy unauthenticated reservations without touching inventory", async () => {
    const response = await route()("/reserve", {
      method: "POST",
      ...jsonBody({ productId: PRODUCT_ID, quantity: 1 }),
    });
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({ code: "LEGACY_CART_DISABLED" });
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects reserve quantity above 1 for one-of-one inventory", async () => {
    const response = await route()(
      "/reserve",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID, quantity: 2 }),
      },
    );

    expect(response.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("releases an active reservation only with the matching token", async () => {
    const reservedUntil = new Date("2999-01-01T00:00:00.000Z");
    const token = createReservationToken({ productId: PRODUCT_ID, reservedUntil });
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil,
        slug: PRODUCT_SLUG,
        stockStatus: "reserved",
      },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    releaseCartHoldByTokenMock.mockResolvedValueOnce({
      productId: PRODUCT_ID,
      slug: PRODUCT_SLUG,
    });

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID, reservationToken: token }),
      },
    );

    expect(response.status).toBe(200);
    expect(releaseCartHoldByTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_ID,
        reservationToken: token,
        reservedUntil,
      }),
    );
  });

  it("does not release an active reservation without the matching token", async () => {
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil: new Date("2999-01-01T00:00:00.000Z"),
        slug: PRODUCT_SLUG,
        stockStatus: "reserved",
      },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("RESERVATION_OWNER_REQUIRED");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses to release a hold whose timestamp is merely near the token's", async () => {
    /*
     * The ±1000ms guard above is a proximity test, not an identity test, so
     * this exact match is the only thing binding a token to the reservation
     * actually on the row. It costs a legitimate holder nothing: /reserve
     * writes one Date into both the row and the token.
     *
     * The case that matters is checkout. It re-stamps reserved_until for the
     * payment-link hold without issuing a new token, and with a 60-minute cart
     * hold against a 30-minute link hold those two values land within
     * milliseconds of each other exactly 30 minutes in. Releasing on proximity
     * would free a saree that has a live payment link against it.
     */
    const linkHoldUntil = new Date(Date.now() + 30 * 60 * 1000);
    const cartToken = createReservationToken({
      productId: PRODUCT_ID,
      reservedUntil: new Date(linkHoldUntil.getTime() - 400),
    });
    const selectChain = makeSelectLimitChain([
      { id: PRODUCT_ID, reservedUntil: linkHoldUntil, stockStatus: "reserved" },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID, reservationToken: cartToken }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("RESERVATION_OWNER_REQUIRED");
    expect(releaseCartHoldByTokenMock).not.toHaveBeenCalled();
  });

  it("re-checks expiry when sweeping, so a fresh hold survives", async () => {
    /*
     * A shopper may claim one of these sarees between the SELECT and the
     * UPDATE — the reserve route accepts a hold whose window has passed.
     * Releasing by id alone handed their live reservation to the next buyer.
     */
    const selectChain = makeSelectWhereChain([
      { id: PRODUCT_ID, slug: PRODUCT_SLUG },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");

    await route()(
      "/release-expired",
      {
        headers: { authorization: "Bearer test-cron-secret" },
        method: "POST",
      },
    );

    expect(expireCommerceHoldsForProductsMock).toHaveBeenCalledWith(
      [PRODUCT_ID],
      expect.any(Date),
    );
  });

  it("releases expired reservations without requiring a token", async () => {
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil: new Date("2026-01-01T00:00:00.000Z"),
        slug: PRODUCT_SLUG,
        stockStatus: "reserved",
      },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    expireCommerceHoldsForProductsMock.mockResolvedValueOnce({
      blockedProductIds: [],
      conflictOrderIds: [],
      ordinaryReleasedProductIds: [PRODUCT_ID],
      paymentReleasedOrderIds: [],
      paymentReleasedProductIds: [],
      paymentReleasedSlugs: [],
      protectedProductIds: [],
      releasedProductIds: [PRODUCT_ID],
    });

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.released).toBe(true);
  });

  it("treats a no-longer-active reservation release as an idempotent no-op", async () => {
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil: null,
        slug: PRODUCT_SLUG,
        stockStatus: "available",
      },
    ]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.code).toBe("RESERVATION_NOT_ACTIVE");
    expect(payload.released).toBe(false);
  });

  it("does not expose expired cleanup as a public GET", async () => {
    const response = await route()("/release-expired", { method: "GET" });

    expect(response.status).toBe(404);
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("requires cron secret or admin auth before releasing expired reservations", async () => {
    const response = await route()("/release-expired", { method: "POST" });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("UNAUTHORIZED");
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("releases expired reservations with a valid cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret-value");
    const selectChain = makeSelectWhereChain([{ id: PRODUCT_ID, slug: PRODUCT_SLUG }]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    expireCommerceHoldsForProductsMock.mockResolvedValueOnce({
      blockedProductIds: [],
      conflictOrderIds: [],
      ordinaryReleasedProductIds: [PRODUCT_ID],
      paymentReleasedOrderIds: [],
      paymentReleasedProductIds: [],
      paymentReleasedSlugs: [],
      protectedProductIds: [],
      releasedProductIds: [PRODUCT_ID],
    });

    const response = await route()("/release-expired", {
      headers: { authorization: "Bearer secret-value" },
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ paymentReleaseConflicts: 0, released: 1 });
  });

  it("returns released 0 without updating when no expired reservations exist", async () => {
    vi.stubEnv("CRON_SECRET", "secret-value");
    const selectChain = makeSelectWhereChain([]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);

    const response = await route()("/release-expired", {
      headers: { authorization: "Bearer secret-value" },
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ paymentReleaseConflicts: 0, released: 0 });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
