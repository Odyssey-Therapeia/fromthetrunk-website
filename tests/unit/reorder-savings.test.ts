import { readFileSync } from "node:fs";
import type { SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { products, userCartItems } from "@/db/schema";
import { createReservationToken } from "@/lib/cart/reservation-token";

const dbSelectMock = vi.hoisted(() => vi.fn());
const getOrderMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select: dbSelectMock },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  listOrderSummaries: vi.fn(),
}));

import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { createRouteHarness } from "../helpers/route-harness";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const authUser = {
  id: "customer-1",
  email: "buyer@example.com",
  role: "customer",
};

// select(fields).from(products).leftJoin(user_cart_items, ...).where(...)
function selectChain(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin, where });
  return { from };
}

function orderFixture() {
  return {
    id: ORDER_ID,
    userId: authUser.id,
    shippingEmail: authUser.email,
    items: [
      {
        productId: PRODUCT_ID,
        name: "Kanchipuram silk",
        pricePaise: 285_000,
        imageUrl: "/saree.jpg",
        selectedOptions: {},
      },
    ],
  };
}

describe("reorder savings", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    getOrderMock.mockReset();
    getOrderMock.mockResolvedValue(orderFixture());
  });

  it("returns the current catalogue original price when it exists", async () => {
    dbSelectMock.mockReturnValue(
      selectChain([
        {
          id: PRODUCT_ID,
          slug: "kanchipuram-silk",
          stockStatus: "available",
          reservedUntil: null,
          pricePaise: 350_000,
          originalPricePaise: 400_000,
        },
      ]),
    );
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });

    const response = await request(`/${ORDER_ID}/reorder-preview`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          productId: PRODUCT_ID,
          pricePaise: 350_000,
          originalPricePaise: 400_000,
          available: true,
        },
      ],
    });
  });

  // Money regression: the order item's price is frozen at purchase time, but
  // checkout re-prices a reordered piece from products.price_paise. Returning
  // the historic 285_000 beside the current 400_000 advertised a Rs 1,150 saving
  // on a piece that would be charged 350_000 (a true saving of Rs 500) and left
  // the bag Rs 650 below the amount actually charged. Both halves of the pair
  // must come from the same current row.
  it("prices the reorder from the current catalogue row, not the frozen order item", async () => {
    dbSelectMock.mockReturnValue(
      selectChain([
        {
          id: PRODUCT_ID,
          slug: "kanchipuram-silk",
          stockStatus: "available",
          reservedUntil: null,
          pricePaise: 350_000,
          originalPricePaise: 400_000,
        },
      ]),
    );
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });

    const response = await request(`/${ORDER_ID}/reorder-preview`);
    const body = (await response.json()) as {
      items: { pricePaise: number; originalPricePaise: number | null }[];
    };
    const item = body.items[0]!;

    // The historic order-item price (285_000) must not leak into the bag.
    expect(item.pricePaise).toBe(350_000);
    expect(item.pricePaise).not.toBe(285_000);
    // Savings are computed from a self-consistent pair.
    expect(item.originalPricePaise! - item.pricePaise).toBe(50_000);
  });

  it("falls back to the order-item price only when the product row is gone", async () => {
    dbSelectMock.mockReturnValue(selectChain([]));
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });

    const response = await request(`/${ORDER_ID}/reorder-preview`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          pricePaise: 285_000,
          originalPricePaise: null,
          // A missing product row is never offered for reorder.
          available: false,
        },
      ],
    });
  });

  it("returns null instead of inventing an unavailable original price", async () => {
    dbSelectMock.mockReturnValue(
      selectChain([
        {
          id: PRODUCT_ID,
          slug: "kanchipuram-silk",
          stockStatus: "available",
          reservedUntil: null,
          pricePaise: 285_000,
          originalPricePaise: null,
        },
      ]),
    );
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });

    const response = await request(`/${ORDER_ID}/reorder-preview`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ originalPricePaise: null }],
    });
  });

  it("passes the optional value into the backward-compatible cart item", () => {
    const component = readFileSync(
      "components/account/order-payment-actions.tsx",
      "utf8",
    );
    const cartStore = readFileSync("lib/store/cart-store.ts", "utf8");

    expect(component).toContain("originalPricePaise?: number | null");
    expect(component).toContain(
      "originalPricePaise: item.originalPricePaise ?? null",
    );
    expect(cartStore).toContain("originalPricePaise?: null | number");
    expect(cartStore).toContain('name: "ftt-cart-v2"');
    // The version may move as long as a migration carries stored carts across.
    expect(cartStore).toContain("migrate:");
  });
});

describe("reorder preview — the requester's own holds and exact payment protection", () => {
  const MINUTE = 60_000;

  const productRow = (overrides: Record<string, unknown> = {}) => ({
    cartReservationToken: null,
    cartReservedUntil: null,
    cartStatus: null,
    id: PRODUCT_ID,
    originalPricePaise: null,
    ownPaymentHold: false,
    paymentProtected: false,
    pricePaise: 350_000,
    reservedUntil: null,
    slug: "kanchipuram-silk",
    stockStatus: "available",
    ...overrides,
  });

  const preview = async (row: Record<string, unknown>) => {
    dbSelectMock.mockReturnValue(selectChain([row]));
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });
    const response = await request(`/${ORDER_ID}/reorder-preview`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{ available: boolean; inBag: boolean }>;
    };
    return body.items[0]!;
  };

  beforeEach(() => {
    dbSelectMock.mockReset();
    getOrderMock.mockReset();
    getOrderMock.mockResolvedValue(orderFixture());
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
  });

  it("reports the requester's live exact bag hold as in the bag, not as available", async () => {
    const reservedUntil = new Date(Date.now() + 30 * MINUTE);
    const item = await preview(
      productRow({
        cartReservationToken: createReservationToken({
          productId: PRODUCT_ID,
          reservedUntil,
        }),
        cartReservedUntil: reservedUntil,
        cartStatus: "active",
        reservedUntil,
        stockStatus: "reserved",
      }),
    );

    expect(item).toMatchObject({ available: false, inBag: true });
  });

  it("keeps the requester's exact open payment in the bag even after its local deadline", async () => {
    const reservedUntil = new Date(Date.now() - 2 * MINUTE);
    const item = await preview(
      productRow({
        cartReservedUntil: reservedUntil,
        cartStatus: "payment_pending",
        ownPaymentHold: true,
        paymentProtected: true,
        reservedUntil,
        stockStatus: "reserved",
      }),
    );

    expect(item).toMatchObject({ available: false, inBag: true });
  });

  it("never counts a bag row whose signed hold is older than the product's", async () => {
    const reservedUntil = new Date(Date.now() + 30 * MINUTE);
    const item = await preview(
      productRow({
        cartReservationToken: createReservationToken({
          productId: PRODUCT_ID,
          reservedUntil: new Date(reservedUntil.getTime() - 20 * MINUTE),
        }),
        cartReservedUntil: reservedUntil,
        cartStatus: "active",
        reservedUntil,
        stockStatus: "reserved",
      }),
    );

    // Someone's live hold, and not provably the requester's.
    expect(item).toMatchObject({ available: false, inBag: false });
  });

  it("does not offer a lapsed hold that another shopper's exact payment still protects", async () => {
    const item = await preview(
      productRow({
        paymentProtected: true,
        reservedUntil: new Date(Date.now() - MINUTE),
        stockStatus: "reserved",
      }),
    );

    expect(item).toMatchObject({ available: false, inBag: false });
  });

  it("offers a lapsed hold that only a stale, inexact pending order points at", async () => {
    const reservedUntil = new Date(Date.now() - MINUTE);
    const item = await preview(
      productRow({
        // A payment_pending row survives, but no exact pending hold backs it.
        cartReservedUntil: reservedUntil,
        cartStatus: "payment_pending",
        ownPaymentHold: false,
        paymentProtected: false,
        reservedUntil,
        stockStatus: "reserved",
      }),
    );

    expect(item).toMatchObject({ available: true, inBag: false });
  });

  it("does not offer another shopper's live hold", async () => {
    const item = await preview(
      productRow({
        reservedUntil: new Date(Date.now() + 10 * MINUTE),
        stockStatus: "reserved",
      }),
    );

    expect(item).toMatchObject({ available: false, inBag: false });
  });

  it("MUTATION-PROOF: scopes the bag join to the requester and protects only the exact pending hold", async () => {
    let captured: {
      fields: Record<string, unknown>;
      joinOn: SQL;
      joinTable: typeof userCartItems;
      table: typeof products;
      where: SQL;
    } | null = null;
    dbSelectMock.mockImplementation((fields: Record<string, unknown>) => ({
      from: (table: typeof products) => ({
        leftJoin: (joinTable: typeof userCartItems, joinOn: SQL) => ({
          where: (where: SQL) => {
            captured = { fields, joinOn, joinTable, table, where };
            return Promise.resolve([productRow()]);
          },
        }),
      }),
    }));
    const { request } = createRouteHarness({
      authUser,
      register: registerOrderRoutes,
    });

    await request(`/${ORDER_ID}/reorder-preview`);

    expect(captured).not.toBeNull();
    const query = captured!;
    const rendered = new QueryBuilder()
      .select(query.fields as never)
      .from(query.table)
      .leftJoin(query.joinTable, query.joinOn)
      .where(query.where)
      .toSQL();
    const text = rendered.sql.replace(/\s+/g, " ");

    expect(text).toContain(
      'left join "user_cart_items" on ("user_cart_items"."product_id" = "products"."id" and "user_cart_items"."user_id" = $',
    );
    expect(text).toMatch(/"user_cart_items"\."status" in \(\$\d+, \$\d+\)/);

    // Both EXISTS fragments carry every D2 condition and no clock bound. The
    // fragments hold no parentheses of their own, so each ends at its first ")".
    const holds = text
      .split("exists (")
      .slice(1)
      .map((fragment) => fragment.slice(0, fragment.indexOf(")")));
    expect(holds).toHaveLength(2);
    for (const hold of holds) {
      expect(hold).toContain("hold_order.payment_status = 'pending'");
      expect(hold).toContain("hold_cart.user_id = hold_order.user_id");
      expect(hold).toContain("hold_cart.product_id = hold_reservation.product_id");
      expect(hold).toContain("hold_cart.status = 'payment_pending'");
      expect(hold).toContain("hold_cart.reserved_until = hold_reservation.expires_at");
      expect(hold).toContain('hold_reservation.product_id = "products"."id"');
      expect(hold).toContain('hold_reservation.expires_at = "products"."reserved_until"');
      expect(hold).toContain(`"products"."stock_status" = 'reserved'`);
      expect(hold).not.toMatch(/expires_at\s*>|reserved_until\s*>|now\(\)/);
    }
    // Exactly one fragment is narrowed to the requester's own orders.
    expect(text.match(/and hold_order\.user_id = \$\d+/g)).toHaveLength(1);
    expect(rendered.params.filter((param) => param === authUser.id)).toHaveLength(2);
    expect(rendered.params).toEqual(
      expect.arrayContaining(["active", "payment_pending"]),
    );
  });
});
