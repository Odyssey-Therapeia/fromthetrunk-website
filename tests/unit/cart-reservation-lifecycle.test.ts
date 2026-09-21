/**
 * The Zustand cart is now a presentation mirror only.
 *
 * Reservation ownership and removal are exercised through the authenticated
 * cart route tests. These cases pin the smaller browser contract: display rows
 * can be replaced/pruned, but this store performs no inventory request and
 * persists no membership.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => void storage.delete(key),
  setItem: (key: string, value: string) => void storage.set(key, value),
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { dropExpiredCartItems, nextCartExpiryAt, useCartStore } = await import(
  "@/lib/store/cart-store"
);

const HOUR_MS = 60 * 60 * 1000;
const line = (overrides: Record<string, unknown> = {}) => ({
  addedAt: new Date().toISOString(),
  detailsFabric: null,
  expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
  id: "saree-1",
  image: "",
  name: "Maroon Chettinad",
  originalPricePaise: null,
  price: 3249,
  reservedUntil: new Date(Date.now() + HOUR_MS).toISOString(),
  slug: "maroon-chettinad-cotton",
  ...overrides,
});

describe("presentation cart lifecycle", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useCartStore.setState({
      addSerial: 0,
      items: [],
      presentationUserId: "user-a",
      releasingIds: [],
    });
  });

  it("refreshes display metadata without duplicating a unique product", () => {
    const { addItem } = useCartStore.getState();
    addItem(line({ image: "/old.jpg" }));
    addItem(line({ image: "/canonical.jpg", name: "Canonical name" }));

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({
      image: "/canonical.jpg",
      name: "Canonical name",
      quantity: 1,
    });
  });

  it("keeps the legacy remover presentation-only", async () => {
    useCartStore.getState().addItem(line());
    await expect(
      useCartStore.getState().removeItem("saree-1"),
    ).resolves.toMatchObject({ outcome: "not-active", removed: true });

    expect(useCartStore.getState().items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the server-provided hold window for display", () => {
    const reservedUntil = new Date(Date.now() + HOUR_MS).toISOString();
    useCartStore.getState().addItem(
      line({ expiresAt: reservedUntil, reservedUntil }),
    );

    expect(useCartStore.getState().items[0]?.expiresAt).toBe(reservedUntil);
    expect(useCartStore.getState().items[0]?.reservedUntil).toBe(reservedUntil);
  });

  it("prunes a presentation line whose server window closed", () => {
    useCartStore.setState({
      items: [
        {
          ...line(),
          expiresAt: new Date(Date.now() - 1).toISOString(),
          quantity: 1,
        },
        {
          ...line({ id: "saree-2" }),
          expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
          quantity: 1,
        },
      ],
    });

    useCartStore.getState().pruneExpired();
    expect(useCartStore.getState().items.map((item) => item.id)).toEqual([
      "saree-2",
    ]);
  });

  it("leaves the same array in place when nothing expired", () => {
    const items = [{ ...line(), quantity: 1 }];
    useCartStore.setState({ items });
    useCartStore.getState().pruneExpired();
    expect(useCartStore.getState().items).toBe(items);
  });
});

describe("cart expiry helpers", () => {
  it("keeps display lines that carry no window", () => {
    expect(
      dropExpiredCartItems([
        { ...line({ expiresAt: undefined }), quantity: 1 },
      ]),
    ).toHaveLength(1);
  });

  it("reports the soonest display expiry", () => {
    const soon = new Date(Date.now() + 5 * 60_000);
    const later = new Date(Date.now() + HOUR_MS);
    const next = nextCartExpiryAt([
      { ...line({ expiresAt: later.toISOString() }), quantity: 1 },
      {
        ...line({ id: "saree-2", expiresAt: soon.toISOString() }),
        quantity: 1,
      },
    ]);
    expect(next?.toISOString()).toBe(soon.toISOString());
  });

  it("reports no expiry when no display line is timed", () => {
    expect(
      nextCartExpiryAt([
        { ...line({ expiresAt: undefined }), quantity: 1 },
      ]),
    ).toBeNull();
  });
});
