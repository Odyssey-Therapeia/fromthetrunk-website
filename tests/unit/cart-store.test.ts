// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => void memory.delete(key),
      setItem: (key: string, value: string) => void memory.set(key, value),
    },
  });
});

const { getCartTotals, useCartStore } = await import("@/lib/store/cart-store");

const item = (id = "p1", price = 28500) => ({
  id,
  image: `/${id}.jpg`,
  name: `Saree ${id}`,
  price,
});

describe("cart presentation store", () => {
  beforeEach(() => {
    useCartStore.setState({ addSerial: 0, items: [], releasingIds: [] });
  });

  it("draws a unique item at quantity one", () => {
    useCartStore.getState().addItem(item());
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ id: "p1", quantity: 1 }),
    ]);
  });

  it("updates a duplicate's display fields without duplicating membership", () => {
    useCartStore.getState().addItem(item());
    useCartStore.getState().addItem({ ...item(), image: "/canonical.jpg" });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]?.image).toBe("/canonical.jpg");
  });

  it("keeps background replacement silent but counts a deliberate add", () => {
    useCartStore.getState().replaceItems([
      { ...item(), quantity: 1 },
    ]);
    expect(useCartStore.getState().addSerial).toBe(0);

    useCartStore.getState().addItem(item("p2"));
    expect(useCartStore.getState().addSerial).toBe(1);
  });

  it("keeps quantity fixed for one-of-one products", () => {
    useCartStore.getState().addItem(item());
    useCartStore.getState().updateQuantity("p1", 5);
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);
  });

  it("clears display after a paid order without issuing a release", () => {
    useCartStore.getState().addItem(item());
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe("getCartTotals", () => {
  it("calculates rupee totals from display rows", () => {
    const totals = getCartTotals([
      { ...item("p1", 28500), quantity: 1 },
      { ...item("p2", 32000), quantity: 1 },
    ]);
    expect(totals).toMatchObject({ subtotal: 60500, totalItems: 2 });
  });

  it("returns zero for an empty bag", () => {
    expect(getCartTotals([])).toMatchObject({ subtotal: 0, totalItems: 0 });
  });
});
