import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());
const getBlouseProductIdSetMock = vi.hoisted(() =>
  vi.fn(async () => new Set<string>()),
);

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
import { CART_RESERVATION_MINUTES } from "@/lib/cart/reservation-policy";
import {
  createReservationToken,
  verifyReservationToken,
} from "@/lib/cart/reservation-token";
import { createRouteHarness } from "../helpers/route-harness";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_SLUG = "powder-blue-georgette-saree";

const jsonBody = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

const makeUpdateChain = (returningRows: unknown[] = []) => {
  const returning = vi.fn().mockResolvedValue(returningRows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { returning, root: { set }, set, where };
};

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
  });

  it("atomically reserves an available product and returns a signed token", async () => {
    const updateChain = makeUpdateChain([{ id: PRODUCT_ID, slug: PRODUCT_SLUG }]);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);

    const response = await route()(
      "/reserve",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reserved).toBe(true);
    expect(payload.reservationToken).toEqual(expect.any(String));
    expect(
      new Date(payload.reservedUntil).getTime() - Date.now(),
    ).toBeGreaterThan((CART_RESERVATION_MINUTES - 1) * 60 * 1000);
    expect(
      new Date(payload.reservedUntil).getTime() - Date.now(),
    ).toBeLessThanOrEqual((CART_RESERVATION_MINUTES + 1) * 60 * 1000);
    expect(verifyReservationToken(payload.reservationToken)).toEqual(
      expect.objectContaining({
        productId: PRODUCT_ID,
        quantity: 1,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ stockStatus: "reserved" }),
    );
  });

  it("accepts existing clients that send quantity 1 with reserve requests", async () => {
    const updateChain = makeUpdateChain([{ id: PRODUCT_ID, slug: PRODUCT_SLUG }]);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);

    const response = await route()(
      "/reserve",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID, quantity: 1 }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reserved).toBe(true);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ stockStatus: "reserved" }),
    );
  });

  it("skips the hold for blouses and reports success without reserving", async () => {
    getBlouseProductIdSetMock.mockResolvedValueOnce(new Set([PRODUCT_ID]));

    const response = await route()(
      "/reserve",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reserved).toBe(false);
    expect(payload.reservationToken).toBeNull();
    expect(payload.reservedUntil).toBeNull();
    // Made-to-order blouses are never written to a reserved state.
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

  it("returns 409 for a sold product", async () => {
    const updateChain = makeUpdateChain([]);
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil: null,
        stockStatus: "sold",
      },
    ]);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);
    dbSelectMock.mockReturnValueOnce(selectChain.root);

    const response = await route()(
      "/reserve",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("PRODUCT_SOLD");
  });

  it("allows exactly one winner across concurrent reserve attempts", async () => {
    let callCount = 0;
    dbUpdateMock.mockImplementation(() => {
      callCount += 1;
      return makeUpdateChain(
        callCount === 1 ? [{ id: PRODUCT_ID, slug: PRODUCT_SLUG }] : [],
      ).root;
    });
    dbSelectMock.mockImplementation(() =>
      makeSelectLimitChain([
        {
          id: PRODUCT_ID,
          reservedUntil: new Date("2999-01-01T00:00:00.000Z"),
          stockStatus: "reserved",
        },
      ]).root,
    );

    const request = route();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request("/reserve", {
          method: "POST",
          ...jsonBody({ productId: PRODUCT_ID }),
        }),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(19);
    const conflictPayload = await responses.find((response) => response.status === 409)!.json();
    expect(conflictPayload.code).toBe("PRODUCT_RESERVED");
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
    const updateChain = makeUpdateChain([{ id: PRODUCT_ID, slug: PRODUCT_SLUG }]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID, reservationToken: token }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityAvailable: 1,
        reservedUntil: null,
        stockStatus: "available",
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

  it("releases expired reservations without requiring a token", async () => {
    const selectChain = makeSelectLimitChain([
      {
        id: PRODUCT_ID,
        reservedUntil: new Date("2026-01-01T00:00:00.000Z"),
        slug: PRODUCT_SLUG,
        stockStatus: "reserved",
      },
    ]);
    const updateChain = makeUpdateChain([{ id: PRODUCT_ID, slug: PRODUCT_SLUG }]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);

    const response = await route()(
      "/release",
      {
        method: "POST",
        ...jsonBody({ productId: PRODUCT_ID }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityAvailable: 1,
        reservedUntil: null,
        stockStatus: "available",
      }),
    );
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
    const updateChain = makeUpdateChain([]);
    dbSelectMock.mockReturnValueOnce(selectChain.root);
    dbUpdateMock.mockReturnValueOnce(updateChain.root);

    const response = await route()("/release-expired", {
      headers: { authorization: "Bearer secret-value" },
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ released: 1 });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityAvailable: 1,
        reservedUntil: null,
        stockStatus: "available",
      }),
    );
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
    expect(payload).toEqual({ released: 0 });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
