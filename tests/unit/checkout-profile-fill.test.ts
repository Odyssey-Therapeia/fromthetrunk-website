/**
 * Checkout profile fill: mutation-proof tests for fillMissingCheckoutProfile.
 *
 * Mocks @/db at the drizzle builder level (NOT @/db/queries/*) so the REAL
 * query function runs and every UPDATE's SET payload and WHERE predicate can
 * be inspected.
 *
 * TEST DISCIPLINE:
 *   - collectPrimitives walks SET payloads and the name WHERE for bound values.
 *   - WHERE guards are also rendered through PgDialect, because the phone
 *     guard's aliased subquery cannot be walked (alias proxies are rebuilt on
 *     every property read) and the rendered SQL is the real contract.
 *
 * Removing the null-or-blank guard, the NOT EXISTS clause, or the userId
 * predicate from either UPDATE MUST cause a test to fail.
 */

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fillMissingCheckoutProfile,
  type FillMissingCheckoutProfileInput,
} from "@/db/queries/users";
import { users } from "@/db/schema";

// ── collectPrimitives: walks Drizzle SQL AST ─────────────────────────────────
function collectPrimitives(node: unknown, visited = new WeakSet<object>()): string[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

const USER_ID = "3a706acb-c058-41b2-adfd-8e9197c6cbe0";
const NOW = new Date("2026-09-11T10:00:00.000Z");
const E164_PHONE = "+919876543210";
const RETURNED = [{ id: USER_ID }];

// ─────────────────────────────────────────────────────────────────────────────
// Mock @/db at the drizzle builder level
//
// fillMissingCheckoutProfile uses only this chain, once per field:
//   update(users).set().where().returning({ id })
// Any select/insert/delete would throw here, proving no other query runs.
// ─────────────────────────────────────────────────────────────────────────────

type CapturedUpdate = {
  set: Record<string, unknown>;
  table: unknown;
  where: SQL;
};

const mockDb = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/db", () => ({
  db: mockDb,
  withRetry: (fn: () => unknown) => fn(),
}));

// ── Route-level mocks, used only by the create-order describe at the end ─────
// The real fill stays wired for the data-layer tests: the export is a spy that
// calls through to it until a route test replaces the implementation.
const routeMocks = vi.hoisted(() => ({
  addOrderEvent: vi.fn(),
  createOrder: vi.fn(),
  createRazorpayPaymentLink: vi.fn(),
  getLivePaymentHoldForOrder: vi.fn(),
  getOrderByIdempotencyKey: vi.fn(),
  listLapsedOwnPaymentOrderIds: vi.fn(),
  listUserCartItems: vi.fn(),
  reconcilePaymentHoldForOrder: vi.fn(),
  releasePaymentCartItems: vi.fn(),
  startPaymentForOwnedCartItems: vi.fn(),
}));

vi.mock("@/db/queries/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/users")>();
  return {
    ...actual,
    fillMissingCheckoutProfile: vi.fn(actual.fillMissingCheckoutProfile),
  };
});

vi.mock("@/db/queries/orders", () => ({
  addOrderEvent: routeMocks.addOrderEvent,
  createOrder: routeMocks.createOrder,
  getOrder: vi.fn(),
  getOrderByIdempotencyKey: routeMocks.getOrderByIdempotencyKey,
}));

vi.mock("@/db/queries/user-cart", () => ({
  getLivePaymentHoldForOrder: routeMocks.getLivePaymentHoldForOrder,
  listLapsedOwnPaymentOrderIds: routeMocks.listLapsedOwnPaymentOrderIds,
  listUserCartItems: routeMocks.listUserCartItems,
  releasePaymentCartItems: routeMocks.releasePaymentCartItems,
  startPaymentForOwnedCartItems: routeMocks.startPaymentForOwnedCartItems,
}));

vi.mock("@/lib/payments/reconcile-expired-holds", () => ({
  reconcilePaymentHoldForOrder: routeMocks.reconcilePaymentHoldForOrder,
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: routeMocks.createRazorpayPaymentLink,
  };
});

vi.mock("@/lib/http/rate-limit", () => ({ rateLimitResponse: () => null }));
vi.mock("@/lib/analytics/emit", () => ({ emitAnalyticsEvent: vi.fn() }));
vi.mock("@/lib/payments/checkout-idempotency", () => ({
  recordPaymentAttempt: vi.fn(),
}));
vi.mock("@/lib/orders/complete-paid-order", () => ({ completePaidOrder: vi.fn() }));

let capturedUpdates: CapturedUpdate[] = [];

/**
 * Reset captured state. `returnedRows[i]` is what the i-th update() returns.
 */
function resetDb(returnedRows: unknown[][] = []) {
  capturedUpdates = [];
  mockDb.update.mockReset();
  mockDb.update.mockImplementation((table: unknown) => {
    const captured = { table } as CapturedUpdate;
    const rows = returnedRows[capturedUpdates.length] ?? [];
    capturedUpdates.push(captured);
    return {
      set: (values: Record<string, unknown>) => {
        captured.set = values;
        return {
          where: (predicate: SQL) => {
            captured.where = predicate;
            return { returning: () => Promise.resolve(rows) };
          },
        };
      },
    };
  });
}

const dialect = new PgDialect();
const renderWhere = (update: CapturedUpdate) => dialect.sqlToQuery(update.where);

const NAME_WHERE_SQL =
  `("users"."id" = $1 and ("users"."name" is null or btrim("users"."name") = ''))`;
// Another account's phone is compared by its digits, whole or as the national
// number (last ten digits), so no stored format can hide the same line.
const OTHER_PHONE_DIGITS = `regexp_replace("other_users"."phone", '[^0-9]', '', 'g')`;
const PHONE_WHERE_SQL =
  `("users"."id" = $1 and ("users"."phone" is null or btrim("users"."phone") = '')` +
  ` and not exists (select 1 from "users" "other_users"` +
  ` where ((${OTHER_PHONE_DIGITS} = $2 or right(${OTHER_PHONE_DIGITS}, 10) = $3)` +
  ` and "other_users"."id" <> $4)))`;
const E164_DIGITS = "919876543210";
const NATIONAL_DIGITS = "9876543210";
const PHONE_WHERE_PARAMS = [USER_ID, E164_DIGITS, NATIONAL_DIGITS, USER_ID];

/**
 * The guard's own predicate, applied in JS to one stored value with the
 * values the statement binds: digits only, the whole number or its last ten.
 */
const guardMatchesStoredPhone = (stored: string, params: unknown[]) => {
  const storedDigits = stored.replace(/[^0-9]/g, "");
  return storedDigits === params[1] || storedDigits.slice(-10) === params[2];
};

describe("fillMissingCheckoutProfile", () => {
  beforeEach(() => resetDb());

  describe("name fill", () => {
    it("MUTATION-PROOF: updates only this user and only while the stored name is null or blank", async () => {
      resetDb([RETURNED]);

      const result = await fillMissingCheckoutProfile({
        name: "  Meera Nair  ",
        now: NOW,
        userId: USER_ID,
      });

      expect(result).toEqual({ nameFilled: true, phoneFilled: false });
      expect(capturedUpdates).toHaveLength(1);

      const [nameUpdate] = capturedUpdates;
      expect(nameUpdate.table).toBe(users);
      expect(nameUpdate.set).toEqual({ name: "Meera Nair", updatedAt: NOW });
      expect(collectPrimitives(nameUpdate.where)).toContain(USER_ID);

      // An existing non-blank name matches no row, so it is never overwritten.
      const rendered = renderWhere(nameUpdate);
      expect(rendered.sql).toBe(NAME_WHERE_SQL);
      expect(rendered.params).toEqual([USER_ID]);
    });

    it.each([
      ["empty", ""],
      ["spaces", "   "],
      ["mixed whitespace", " \t\n "],
      ["null", null],
      ["undefined", undefined],
    ])("issues no update for a %s name", async (_label, name) => {
      const result = await fillMissingCheckoutProfile({ name, now: NOW, userId: USER_ID });

      expect(result).toEqual({ nameFilled: false, phoneFilled: false });
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("phone fill", () => {
    it("MUTATION-PROOF: updates only a null or blank phone that no other account already holds", async () => {
      resetDb([RETURNED]);

      const result = await fillMissingCheckoutProfile({
        now: NOW,
        phone: E164_PHONE,
        userId: USER_ID,
      });

      expect(result).toEqual({ nameFilled: false, phoneFilled: true });
      expect(capturedUpdates).toHaveLength(1);

      const [phoneUpdate] = capturedUpdates;
      expect(phoneUpdate.table).toBe(users);
      expect(phoneUpdate.set).toEqual({ phone: E164_PHONE, updatedAt: NOW });

      // The subquery matches a DIFFERENT user holding the same phone, so the
      // fill is skipped rather than creating a second login identity.
      const rendered = renderWhere(phoneUpdate);
      expect(rendered.sql).toBe(PHONE_WHERE_SQL);
      expect(rendered.params).toEqual(PHONE_WHERE_PARAMS);
    });

    it.each([
      ["spaced", "+91 98765 43210"],
      ["hyphenated", "+91-98765-43210"],
      ["bracketed and padded", "  (+91) 98765-43210  "],
    ])("writes a %s phone in normalized E.164 form", async (_label, phone) => {
      resetDb([RETURNED]);

      await fillMissingCheckoutProfile({ now: NOW, phone, userId: USER_ID });

      expect(capturedUpdates).toHaveLength(1);
      expect(capturedUpdates[0].set.phone).toBe(E164_PHONE);
      // The ownership check compares the digits of that same normalized value.
      expect(renderWhere(capturedUpdates[0]).params).toEqual(PHONE_WHERE_PARAMS);
    });

    it.each([
      ["spaced international", "+91 98765 43210"],
      ["hyphenated international", "+91-98765-43210"],
      ["bracketed", "(+91) 98765-43210"],
      ["digits without the plus", "919876543210"],
      ["national number only", "9876543210"],
      ["trunk-prefixed national number", "098765 43210"],
    ])(
      "MUTATION-PROOF: skips the fill when another account stores the number as a %s value",
      async (_label, stored) => {
        resetDb([[]]);

        const result = await fillMissingCheckoutProfile({
          now: NOW,
          phone: E164_PHONE,
          userId: USER_ID,
        });

        expect(result).toEqual({ nameFilled: false, phoneFilled: false });
        const rendered = renderWhere(capturedUpdates[0]);
        expect(rendered.sql).toBe(PHONE_WHERE_SQL);
        // An exact E.164 comparison let each of these through.
        expect(guardMatchesStoredPhone(stored, rendered.params)).toBe(true);
      },
    );

    it.each([
      ["a different national number", "+91 98765 43211"],
      ["a number in another country", "+44 20 7946 0958"],
      ["an empty value", "   "],
    ])("still fills when another account holds %s", async (_label, stored) => {
      resetDb([RETURNED]);

      await fillMissingCheckoutProfile({ now: NOW, phone: E164_PHONE, userId: USER_ID });

      expect(guardMatchesStoredPhone(stored, renderWhere(capturedUpdates[0]).params)).toBe(
        false,
      );
    });

    it.each([
      ["missing country code", "9876543210"],
      ["zero-leading country code", "+0919876543210"],
      ["too short", "+91 98"],
      ["too long", "+9198765432101234"],
      ["non-numeric", "+91 98765 abcde"],
      ["blank", "   "],
      ["null", null],
    ])("issues no phone update for a %s phone", async (_label, phone) => {
      resetDb([RETURNED]);

      const result = await fillMissingCheckoutProfile({
        name: "Meera Nair",
        now: NOW,
        phone,
        userId: USER_ID,
      });

      expect(result).toEqual({ nameFilled: true, phoneFilled: false });
      expect(capturedUpdates).toHaveLength(1);
      expect(capturedUpdates[0].set).not.toHaveProperty("phone");
      expect(renderWhere(capturedUpdates[0]).sql).toBe(NAME_WHERE_SQL);
    });

    it("issues only the phone update when only a valid phone is given", async () => {
      resetDb([RETURNED]);

      await fillMissingCheckoutProfile({ now: NOW, phone: E164_PHONE, userId: USER_ID });

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(capturedUpdates[0].set).not.toHaveProperty("name");
      expect(renderWhere(capturedUpdates[0]).sql).toBe(PHONE_WHERE_SQL);
    });
  });

  describe("owner identity safety", () => {
    const smuggledFields = {
      defaultAddressId: "c78ccc24-3c54-427e-8c68-3756ccdc710d",
      email: "gift-recipient@example.com",
    };

    it.each([
      ["name only", { name: "Meera Nair" }],
      ["phone only", { phone: E164_PHONE }],
      ["name and phone", { name: "Meera Nair", phone: E164_PHONE }],
    ])("never writes email or any other column for %s input", async (_label, fields) => {
      resetDb([RETURNED, RETURNED]);

      // Extra keys a caller might pass by mistake must be ignored at runtime.
      await fillMissingCheckoutProfile({
        now: NOW,
        userId: USER_ID,
        ...fields,
        ...smuggledFields,
      } as FillMissingCheckoutProfileInput);

      expect(capturedUpdates.length).toBeGreaterThan(0);
      for (const update of capturedUpdates) {
        expect(update.set).not.toHaveProperty("email");
        expect(update.set).not.toHaveProperty("defaultAddressId");
        for (const key of Object.keys(update.set)) {
          expect(["name", "phone", "updatedAt"]).toContain(key);
        }
        expect(collectPrimitives(update.set)).not.toContain(smuggledFields.email);
      }
    });
  });

  describe("result flags", () => {
    it.each([
      ["neither field matched", [], [], false, false],
      ["only the name matched", RETURNED, [], true, false],
      ["only the phone matched", [], RETURNED, false, true],
      ["both fields matched", RETURNED, RETURNED, true, true],
    ])(
      "reports whether rows came back when %s",
      async (_label, nameRows, phoneRows, nameFilled, phoneFilled) => {
        resetDb([nameRows, phoneRows]);

        const result = await fillMissingCheckoutProfile({
          name: "Meera Nair",
          now: NOW,
          phone: E164_PHONE,
          userId: USER_ID,
        });

        expect(result).toEqual({ nameFilled, phoneFilled });
        // Two independent writes: a phone that cannot fill never blocks the name.
        expect(capturedUpdates).toHaveLength(2);
        expect(capturedUpdates[0].set).toEqual({ name: "Meera Nair", updatedAt: NOW });
        expect(capturedUpdates[1].set).toEqual({ phone: E164_PHONE, updatedAt: NOW });
      }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route level: POST /create-order wires the fill for the account owner only.
// ─────────────────────────────────────────────────────────────────────────────

describe("create-order route — checkout profile fill", () => {
  const AUTH_USER = { email: "owner@example.com", id: USER_ID, role: "customer" };
  const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SHIPPING_EMAIL = "typed-contact@example.com";
  const MINUTE_MS = 60_000;

  const fillSpy = vi.mocked(fillMissingCheckoutProfile);
  const routeSelect = vi.fn();
  let realFill: typeof fillMissingCheckoutProfile;
  let registerPaymentRoutes: typeof import("@/api/hono/routes/payments").registerPaymentRoutes;
  let createRouteHarness: typeof import("../helpers/route-harness").createRouteHarness;
  let createReservationToken: typeof import("@/lib/cart/reservation-token").createReservationToken;

  const selectChain = (rows: unknown[]) => {
    const where = vi.fn(() => Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows) }));
    return { from: vi.fn(() => ({ where })) };
  };

  const requestBody = (overrides: Record<string, unknown> = {}) => ({
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
    shippingAddress: {
      city: "Kochi",
      country: "India",
      email: SHIPPING_EMAIL,
      line1: "1 Marine Drive",
      name: "Meera Nair",
      phone: "+91 98765 43210",
      postalCode: "682001",
    },
    shippingMethod: "standard",
    ...overrides,
  });

  const createOrderRequest = async (overrides: Record<string, unknown> = {}) => {
    const { request } = createRouteHarness({
      authUser: AUTH_USER,
      register: registerPaymentRoutes,
    });
    return request("/create-order", {
      body: JSON.stringify(requestBody(overrides)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  };

  beforeAll(async () => {
    ({ fillMissingCheckoutProfile: realFill } =
      await vi.importActual<typeof import("@/db/queries/users")>("@/db/queries/users"));
    ({ registerPaymentRoutes } = await import("@/api/hono/routes/payments"));
    ({ createRouteHarness } = await import("../helpers/route-harness"));
    ({ createReservationToken } = await import("@/lib/cart/reservation-token"));
  });

  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    for (const mock of Object.values(routeMocks)) mock.mockReset();
    routeSelect.mockReset();
    fillSpy.mockReset();
    fillSpy.mockResolvedValue({ nameFilled: true, phoneFilled: true });

    const cartDeadline = new Date(Date.now() + 60 * MINUTE_MS);
    // Products, then the pending-order cap count. No other select may run.
    routeSelect
      .mockReturnValueOnce(
        selectChain([
          {
            id: PRODUCT_ID,
            name: "Silk Saree",
            pricePaise: 1_500_000,
            reservedUntil: cartDeadline,
            status: "published",
            stockStatus: "reserved",
            typeId: null,
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([{ c: 0 }]));
    (mockDb as unknown as Record<string, unknown>).select = routeSelect;
    mockDb.update.mockReset();
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => Object.assign(Promise.resolve([]), { returning: async () => [] }),
      }),
    }));

    routeMocks.listUserCartItems.mockResolvedValue([
      {
        addedAt: new Date(cartDeadline.getTime() - 60 * MINUTE_MS),
        productId: PRODUCT_ID,
        reservationToken: createReservationToken({
          productId: PRODUCT_ID,
          reservedUntil: cartDeadline,
        }),
        reservedUntil: cartDeadline,
        selectedOptions: null,
        status: "active",
      },
    ]);
    routeMocks.getOrderByIdempotencyKey.mockResolvedValue(null);
    routeMocks.createOrder.mockResolvedValue({
      createdAt: new Date(),
      events: [],
      id: ORDER_ID,
      items: [],
      paymentStatus: "pending",
      placedAt: new Date(),
      razorpayOrderId: null,
      status: "pending",
      totalPaise: 1_500_000,
      userId: USER_ID,
    });
    routeMocks.startPaymentForOwnedCartItems.mockImplementation(
      async ({ items }: { items: Array<{ productId: string }> }) =>
        items.map((item) => ({ productId: item.productId, slug: "silk-saree" })),
    );
    routeMocks.createRazorpayPaymentLink.mockResolvedValue({
      id: "plink_profile",
      short_url: "https://rzp.io/l/profile",
    });
    routeMocks.addOrderEvent.mockResolvedValue(undefined);
    routeMocks.getLivePaymentHoldForOrder.mockResolvedValue(null);
    routeMocks.releasePaymentCartItems.mockResolvedValue({
      kind: "released",
      releasedProductIds: [],
      releasedSlugs: [],
      restoredProductIds: [],
      restoredSlugs: [],
    });
  });

  afterEach(() => {
    delete (mockDb as unknown as Record<string, unknown>).select;
    fillSpy.mockImplementation(realFill);
    vi.unstubAllEnvs();
  });

  it("fills the owner's missing name and phone once, from shipping details, never the email", async () => {
    const response = await createOrderRequest();

    expect(response.status).toBe(200);
    expect(fillSpy).toHaveBeenCalledTimes(1);
    expect(fillSpy).toHaveBeenCalledWith({
      name: "Meera Nair",
      now: expect.any(Date),
      phone: "+91 98765 43210",
      userId: AUTH_USER.id,
    });
    const [input] = fillSpy.mock.calls[0]!;
    // The typed shipping email is order contact data, not the login identity.
    expect(input).not.toHaveProperty("email");
    expect(Object.values(input)).not.toContain(SHIPPING_EMAIL);
    expect(Object.values(input)).not.toContain(AUTH_USER.email);
  });

  it("skips the fill for a gift order, whose name and phone belong to the recipient", async () => {
    const response = await createOrderRequest({ giftFrom: "Asha", isGift: true });

    expect(response.status).toBe(200);
    expect(routeMocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ isGift: true }),
    );
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it("still returns the payment link when the fill fails", async () => {
    fillSpy.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await createOrderRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: ORDER_ID,
      paymentLinkUrl: "https://rzp.io/l/profile",
    });
    expect(fillSpy).toHaveBeenCalledTimes(1);
    expect(routeMocks.createRazorpayPaymentLink).toHaveBeenCalledTimes(1);
  });
});
