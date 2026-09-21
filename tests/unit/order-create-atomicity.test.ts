import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  type QueryToken = {
    table: unknown;
    values: unknown;
  };

  const batch = vi.fn();
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => ({
      returning: vi.fn((): QueryToken => ({ table, values })),
    })),
  }));

  return { batch, insert };
});

vi.mock("@/db", () => ({
  db: {
    batch: dbMocks.batch,
    insert: dbMocks.insert,
  },
  withRetry: <T,>(operation: () => Promise<T>) => operation(),
}));

vi.mock("@/lib/perf/timed", () => ({
  timedRows: <T,>(_name: string, operation: () => Promise<T>) => operation(),
}));

import { createOrder } from "@/db/queries/orders";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

const input = {
  id: ORDER_ID,
  items: [
    {
      imageUrl: null,
      name: "One-of-one saree",
      pricePaise: 249_900,
      productId: PRODUCT_ID,
      quantity: 1,
      selectedOptions: {},
    },
  ],
  paymentStatus: "pending",
  shippingCostPaise: 0,
  status: "pending",
  subtotalPaise: 249_900,
  taxAmountPaise: 0,
  totalPaise: 249_900,
} as Parameters<typeof createOrder>[0];

describe("createOrder atomic persistence", () => {
  beforeEach(() => {
    dbMocks.batch.mockReset();
    dbMocks.insert.mockClear();
  });

  it("submits the order, its items, and initial event in one Neon transaction", async () => {
    const createdOrder = {
      id: ORDER_ID,
      paymentStatus: "pending",
      status: "pending",
    };
    const createdItem = {
      id: "33333333-3333-4333-8333-333333333333",
      orderId: ORDER_ID,
      productId: PRODUCT_ID,
    };
    const createdEvent = {
      id: "44444444-4444-4444-8444-444444444444",
      note: "Order created",
      orderId: ORDER_ID,
      status: "pending",
    };
    dbMocks.batch.mockResolvedValueOnce([
      [createdOrder],
      [createdItem],
      [createdEvent],
    ]);

    const result = await createOrder(input);

    expect(dbMocks.batch).toHaveBeenCalledTimes(1);
    const queries = dbMocks.batch.mock.calls[0]?.[0] as Array<{
      values: unknown;
    }>;
    expect(queries).toHaveLength(3);
    expect(queries[1]?.values).toEqual([
      expect.objectContaining({ orderId: ORDER_ID, productId: PRODUCT_ID }),
    ]);
    expect(queries[2]?.values).toEqual(
      expect.objectContaining({ note: "Order created", orderId: ORDER_ID }),
    );
    expect(result).toEqual({
      ...createdOrder,
      events: [createdEvent],
      items: [createdItem],
    });
  });

  it("does not fall back to separate writes when the transaction fails", async () => {
    dbMocks.batch.mockRejectedValueOnce(new Error("transaction aborted"));

    await expect(createOrder(input)).rejects.toThrow("transaction aborted");
    expect(dbMocks.batch).toHaveBeenCalledTimes(1);
  });
});
