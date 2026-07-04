import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrderMock = vi.hoisted(() => vi.fn());
const getServerAuthSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
}));

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

import { createOrderAccessToken } from "@/lib/orders/order-access-token";
import { getViewableOrder } from "@/lib/orders/viewable-order";

const ORDER_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER_ORDER_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const orderRow = (overrides: Record<string, unknown> = {}) => ({
  events: [],
  id: ORDER_ID,
  items: [],
  paymentStatus: "pending",
  status: "pending",
  userId: OWNER_ID,
  ...overrides,
});

describe("getViewableOrder isolation", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    getServerAuthSessionMock.mockReset();
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("ORDER_ACCESS_TOKEN_SECRET", "order-access-secret-at-least-32-chars");
    getOrderMock.mockResolvedValue(orderRow());
  });

  it("returns an order to its authenticated owner", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: { id: OWNER_ID },
    });

    await expect(getViewableOrder(ORDER_ID)).resolves.toMatchObject({
      id: ORDER_ID,
      userId: OWNER_ID,
    });
  });

  it("denies a different authenticated user without a valid access token", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: { id: OTHER_USER_ID },
    });

    await expect(getViewableOrder(ORDER_ID)).resolves.toBeNull();
  });

  it("accepts a valid access token only for the matching order", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);
    const validToken = createOrderAccessToken(ORDER_ID);
    const wrongOrderToken = createOrderAccessToken(OTHER_ORDER_ID);

    await expect(getViewableOrder(ORDER_ID, validToken)).resolves.toMatchObject({
      id: ORDER_ID,
    });
    await expect(getViewableOrder(ORDER_ID, wrongOrderToken)).resolves.toBeNull();
  });

  it("rejects expired access tokens", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);
    const expiredToken = createOrderAccessToken(ORDER_ID, Date.now() - 1_000);

    await expect(getViewableOrder(ORDER_ID, expiredToken)).resolves.toBeNull();
  });

  it("does not trust missing or unknown order ids", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: { id: OWNER_ID },
    });
    getOrderMock.mockResolvedValueOnce(null);

    await expect(getViewableOrder(ORDER_ID)).resolves.toBeNull();
    await expect(getViewableOrder(null)).resolves.toBeNull();
  });
});
