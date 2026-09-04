import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function selectChain(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
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
    expect(cartStore).toContain("version: 2");
  });
});
