// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CartItem } from "@/lib/store/cart-store";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

/**
 * The cart store binds its persist storage at module-evaluation time, so a
 * working localStorage has to exist BEFORE the import. Node 26 exposes a native
 * `localStorage` global that is unavailable without --localstorage-file and
 * shadows jsdom's, so define an in-memory one explicitly and import the store
 * dynamically afterwards.
 */
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStorage.set(key, value),
    removeItem: (key: string) => void memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
  },
});

let getCartTotals: typeof import("@/lib/store/cart-store").getCartTotals;
let useCartStore: typeof import("@/lib/store/cart-store").useCartStore;

beforeAll(async () => {
  ({ getCartTotals, useCartStore } = await import("@/lib/store/cart-store"));
});

const saree = (overrides: Partial<Omit<CartItem, "quantity">> = {}) => ({
  id: "p1",
  name: "Kanchipuram silk",
  price: 2850,
  image: "/a.jpg",
  ...overrides,
});

describe("cart item original price", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], hasHydrated: true });
  });

  it("persists the catalogue original price on the cart line", () => {
    useCartStore.getState().addItem(saree({ originalPricePaise: 400_000 }));

    expect(useCartStore.getState().items[0]?.originalPricePaise).toBe(400_000);
  });

  it("keeps the line usable when the original price is unavailable", () => {
    useCartStore.getState().addItem(saree());

    const [item] = useCartStore.getState().items;
    expect(item?.originalPricePaise).toBeUndefined();
    expect(getCartTotals([item as CartItem]).savingsPaise).toBe(0);
  });

  it("reads an old persisted record without originalPricePaise", () => {
    // Exactly the shape written by carts saved before this field existed.
    const legacyItem = {
      id: "legacy",
      name: "Older cart line",
      price: 1500,
      image: "",
      quantity: 1,
    } as CartItem;

    useCartStore.setState({ items: [legacyItem], hasHydrated: true });

    const totals = getCartTotals(useCartStore.getState().items);
    expect(totals.totalItems).toBe(1);
    expect(totals.subtotal).toBe(1500);
    expect(totals.savingsPaise).toBe(0);
  });

  it("does not bump the persist version, so existing carts survive", () => {
    const source = readFileSync("lib/store/cart-store.ts", "utf8");

    expect(source).toContain('name: "ftt-cart-v2"');
    expect(source).toContain("version: 2");
    // An optional field needs no migration; adding one without a migrate()
    // would silently discard every stored cart.
    expect(source).not.toContain("migrate:");
  });

  it("exposes savings through the shared totals helper", () => {
    useCartStore.getState().addItem(saree({ originalPricePaise: 400_000 }));
    useCartStore
      .getState()
      .addItem(saree({ id: "p2", price: 1200, originalPricePaise: 150_000 }));

    const totals = getCartTotals(useCartStore.getState().items);
    expect(totals.totalItems).toBe(2);
    expect(totals.subtotal).toBe(4050);
    expect(totals.savingsPaise).toBe(145_000);
    expect(totals.originalSubtotalPaise).toBe(550_000);
  });

  it("drops savings when the item is removed", () => {
    useCartStore.getState().addItem(saree({ originalPricePaise: 400_000 }));
    useCartStore.getState().removeItem("p1");

    expect(getCartTotals(useCartStore.getState().items).savingsPaise).toBe(0);
    expect(getCartTotals(useCartStore.getState().items).totalItems).toBe(0);
  });

  it("counts quantity, not line count", () => {
    expect(
      getCartTotals([
        { id: "a", name: "A", price: 100, image: "", quantity: 2 },
        { id: "b", name: "B", price: 100, image: "", quantity: 3 },
      ]).totalItems,
    ).toBe(5);
  });
});

describe("add-to-cart pathways carry the original price", () => {
  const sources = {
    pdp: "components/cart/add-to-cart-button.tsx",
    productCard: "components/product/product-card-commerce-row.tsx",
    drapeRoom: "components/drape-room/drape-room-experience.tsx",
    drapeProjection: "lib/drape-room/product.ts",
  } as const;

  it.each(Object.entries(sources))("%s passes originalPricePaise", (_name, path) => {
    expect(readFileSync(path, "utf8")).toContain("originalPricePaise");
  });

  it("routes Drape Room through the shared AddToCartButton, not its own logic", () => {
    const experience = readFileSync(sources.drapeRoom, "utf8");

    expect(experience).toContain(
      'import { AddToCartButton } from "@/components/cart/add-to-cart-button"',
    );
    expect(experience).not.toContain("useCartStore");
    expect(experience).not.toContain("/api/v2/cart/reserve");
  });
});
