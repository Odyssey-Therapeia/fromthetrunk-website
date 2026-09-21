/**
 * The runtime contract behind the bag, pinned.
 *
 * Every case here corresponds to a failure a shopper actually saw: an item
 * that came back after a refresh, a cart still on screen while checkout said
 * "sign in", a success toast for a removal the server refused, and a card
 * still reading "In bag" over an empty drawer.
 */

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store binds its persist storage at module-evaluation time, and imports
 * hoist above every statement — so localStorage has to exist before the first
 * import runs, not merely before the first test. Node exposes a native one that
 * shadows jsdom's and throws without a backing file, hence an explicit
 * in-memory replacement inside vi.hoisted.
 */
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

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

import { mergeServerBag } from "@/components/cart/cart-server-sync";
import {
  getCartReservationExpiresAt,
  getPaymentLinkDeadline,
  isPaymentLinkDeadlineUsable,
  PAYMENT_LINK_HOLD_MINUTES,
} from "@/lib/cart/reservation-policy";
import { serverCartKey } from "@/lib/commerce/use-server-cart";
import {
  announceCartChangedAcrossTabs,
  CART_TAB_SYNC_KEY,
  isCartTabSignal,
} from "@/lib/commerce/cart-tab-bus";
import { useCartStore, type CartItem } from "@/lib/store/cart-store";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const line = (id: string, overrides: Partial<CartItem> = {}): CartItem => ({
  addedAt: "2026-09-08T10:00:00.000Z",
  detailsFabric: null,
  id,
  image: "",
  name: id,
  originalPricePaise: null,
  price: 100,
  quantity: 1,
  reservedUntil: null,
  selectedOptions: undefined,
  slug: id,
  ...overrides,
});

describe("server bag is the only authority on membership", () => {
  it("drops a local row the server did not return", () => {
    const next = mergeServerBag(
      [
        {
          addedAt: "2026-09-08T10:00:00.000Z",
          productId: "b",
          reservedUntil: null,
          selectedOptions: null,
          status: "active",
        },
      ],
      [line("a"), line("b")],
    );

    expect(next.map((item) => item.id)).toEqual(["b"]);
  });

  it("empties the bag when the server returns nothing", () => {
    expect(mergeServerBag([], [line("a"), line("b")])).toEqual([]);
  });

  it("keeps the local thumbnail only until the server supplies one", () => {
    const [withServerImage] = mergeServerBag(
      [
        {
          addedAt: "2026-09-08T10:00:00.000Z",
          imageUrl: "https://cdn.example/from-server.jpg",
          productId: "a",
          reservedUntil: null,
          selectedOptions: null,
          status: "active",
        } as never,
      ],
      [line("a", { image: "https://cdn.example/local.jpg" })],
    );
    expect(withServerImage.image).toBe("https://cdn.example/from-server.jpg");

    const [withoutServerImage] = mergeServerBag(
      [
        {
          addedAt: "2026-09-08T10:00:00.000Z",
          imageUrl: "",
          productId: "a",
          reservedUntil: null,
          selectedOptions: null,
          status: "active",
        } as never,
      ],
      [line("a", { image: "https://cdn.example/local.jpg" })],
    );
    expect(withoutServerImage.image).toBe("https://cdn.example/local.jpg");
  });
});

describe("presentation store", () => {
  beforeEach(() => {
    useCartStore.setState({ addSerial: 0, items: [], releasingIds: [] });
  });

  it("removePresentationItem is pure — no fetch, row simply gone", () => {
    useCartStore.setState({ items: [line("a"), line("b")] });
    useCartStore.getState().removePresentationItem("a");

    expect(useCartStore.getState().items.map((item) => item.id)).toEqual(["b"]);
  });

  it("keeps the same items reference when a sync changes nothing", () => {
    const items = [line("a")];
    useCartStore.setState({ items });
    useCartStore.getState().replaceItems([line("a")]);

    expect(useCartStore.getState().items).toBe(items);
  });

  it("takes a corrected thumbnail even when membership is unchanged", () => {
    useCartStore.setState({ items: [line("a", { image: "" })] });
    useCartStore
      .getState()
      .replaceItems([line("a", { image: "https://cdn.example/a.jpg" })]);

    expect(useCartStore.getState().items[0]?.image).toBe(
      "https://cdn.example/a.jpg",
    );
  });

  it("counts a deliberate add but never a background sync", () => {
    useCartStore.getState().addItem(line("a"));
    expect(useCartStore.getState().addSerial).toBe(1);

    useCartStore.getState().replaceItems([line("a"), line("b")]);
    expect(useCartStore.getState().addSerial).toBe(1);

    useCartStore.getState().markExplicitAdd();
    expect(useCartStore.getState().addSerial).toBe(2);
  });

  it("persists no bag membership or reservation proof", () => {
    const storeSource = read("lib/store/cart-store.ts");
    expect(storeSource).toContain("partialize: () => ({ items: [] })");
    expect(storeSource).not.toContain("reservationToken?:");
  });
});

describe("cart query cache is scoped to the account", () => {
  it("keys by user id so one shopper never reads another's bag", () => {
    expect(serverCartKey("user-a")).not.toEqual(serverCartKey("user-b"));
    expect(serverCartKey(null)).toEqual(["server-cart", "anonymous"]);
  });

  it("does not turn a failed GET into an authoritative empty bag", () => {
    const hook = read("lib/commerce/use-server-cart.ts");
    expect(hook).toContain("if (!response.ok)");
    expect(hook).toContain("throw new Error");
    expect(hook).toContain("hasSnapshot: !isAuthenticated || items !== undefined");
  });
});

describe("tabs share invalidations, never ownership", () => {
  beforeEach(() => localStorage.clear());

  it("writes an opaque signal only for an authenticated shopper", () => {
    announceCartChangedAcrossTabs(null);
    expect(localStorage.getItem(CART_TAB_SYNC_KEY)).toBeNull();

    announceCartChangedAcrossTabs("private-user-id");
    const signal = localStorage.getItem(CART_TAB_SYNC_KEY);
    expect(isCartTabSignal(signal)).toBe(true);
    expect(signal).not.toContain("private-user-id");
  });

  it("makes receiving tabs and expired holds re-read the server", () => {
    const tabSync = read("components/cart/cart-tab-sync.tsx");
    const expiry = read("components/cart/cart-expiry-sweeper.tsx");
    const providers = read("components/providers.tsx");

    expect(tabSync).toContain("isCartTabSignal(event.newValue)");
    expect(tabSync).toContain("void refresh()");
    expect(expiry).toContain("window.setTimeout(() => void refresh(), delay)");
    expect(expiry).not.toContain("removeItem");
    expect(providers.match(/<CartTabSync \/>/g)).toHaveLength(1);
    expect(providers.match(/<CartExpirySweeper \/>/g)).toHaveLength(1);
  });
});

describe("removal has exactly one command", () => {
  /* Surfaces that remove a piece themselves. */
  const removers = [
    "components/cart/cart-drawer.tsx",
    "components/cart/cart-item.tsx",
    "components/checkout/checkout-page-client.tsx",
    "components/product/product-card-commerce-row.tsx",
  ];
  /* Plus the one that delegates its row, and must not grow its own path. */
  const surfaces = [...removers, "components/cart/cart-page-client.tsx"];

  it.each(removers)("%s removes through the server, never the store", (file) => {
    const source = read(file);
    expect(source).toContain("removeFromBag");
    // The store's own remover is the legacy guest path. No rendered surface
    // may call it: it returns without a request when a row carries no token,
    // which is what let a line vanish locally while the server kept it.
    expect(source).not.toMatch(/(?<!persist\.)\bremoveItem\(/);
  });

  it("cart-page-client delegates its row instead of removing on its own", () => {
    const source = read("components/cart/cart-page-client.tsx");
    expect(source).toContain("<CartItem");
    expect(source).not.toMatch(/(?<!persist\.)\bremoveItem\(/);
  });

  it("leaves the guest release endpoint unreferenced by any component", () => {
    for (const file of surfaces) {
      expect(read(file)).not.toContain("/api/v2/cart/release");
    }
  });
});

describe("only the exact current payment hold protects a removal", () => {
  const query = read("db/queries/user-cart.ts");
  const removal = () => {
    const start = query.indexOf("export async function removeOwnedCartItem(");
    expect(start).toBeGreaterThan(-1);
    const end = query.indexOf("\nexport ", start + 1);
    return query.slice(start, end === -1 ? undefined : end).replace(/\s+/g, " ");
  };

  it("needs the same user, product, pending order and matching product and bag row", () => {
    // A historical pending order whose reservation happens to share the
    // product's timestamp must not block an active or restored line.
    const source = removal();
    expect(source).toContain("orders.user_id = ${userId}::uuid");
    expect(source).toContain("reservations.product_id = ${productId}::uuid");
    expect(source).toContain("orders.payment_status = 'pending'");
    expect(source).toContain(
      "reservations.expires_at = locked.product_reserved_until",
    );
    expect(source).toContain("locked.product_stock_status = 'reserved'");
    expect(source).toContain("locked.cart_status = 'payment_pending'");
    expect(source).toContain(
      "locked.cart_reserved_until = locked.product_reserved_until",
    );
  });

  it("has no local-clock bound, so an unreconciled link stays protected", () => {
    const source = removal();
    expect(source).not.toContain("reservations.expires_at > ${now}");
    expect(source).not.toContain("pending_order AS");
  });
});

describe("a payment link spends the cart's time, never more (required test 9)", () => {
  const MINUTE = 60_000;
  const at = (time: string) => new Date(`2026-09-08T${time}:00.000Z`);
  const addedAt = at("12:00");
  const cartDeadline = getCartReservationExpiresAt(addedAt);

  it("gives a payment fifteen minutes while the cart has room", () => {
    expect(cartDeadline).toEqual(at("13:00"));
    expect(
      getPaymentLinkDeadline({
        cartDeadlines: [cartDeadline],
        paymentStartedAt: at("12:10"),
      }),
    ).toEqual(at("12:25"));
  });

  it("stops at the original cart deadline", () => {
    expect(
      getPaymentLinkDeadline({
        cartDeadlines: [cartDeadline],
        paymentStartedAt: at("12:55"),
      }),
    ).toEqual(at("13:00"));

    const late = getPaymentLinkDeadline({
      cartDeadlines: [cartDeadline],
      paymentStartedAt: at("13:05"),
    });
    expect(late).toEqual(at("13:00"));
    expect(isPaymentLinkDeadlineUsable(late, at("13:05"))).toBe(false);
  });

  it("lets the earliest line in the bag decide", () => {
    expect(
      getPaymentLinkDeadline({
        cartDeadlines: [at("13:00"), at("12:30"), at("12:45")],
        paymentStartedAt: at("12:25"),
      }),
    ).toEqual(at("12:30"));
  });

  it("gives a resumed attempt with the same start the identical instant", () => {
    const paymentStartedAt = at("12:10");
    const first = getPaymentLinkDeadline({
      cartDeadlines: [cartDeadline],
      paymentStartedAt,
    });
    const resumed = getPaymentLinkDeadline({
      cartDeadlines: [new Date(cartDeadline)],
      paymentStartedAt: new Date(paymentStartedAt),
    });

    expect(resumed.getTime()).toBe(first.getTime());
  });

  it("never exceeds fifteen minutes or the cart deadline at any minute of the hour", () => {
    for (let minute = 0; minute < 60; minute += 1) {
      const paymentStartedAt = new Date(addedAt.getTime() + minute * MINUTE);
      const deadline = getPaymentLinkDeadline({
        cartDeadlines: [cartDeadline],
        paymentStartedAt,
      });

      expect(deadline.getTime()).toBeLessThanOrEqual(
        paymentStartedAt.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE,
      );
      expect(deadline.getTime()).toBeLessThanOrEqual(cartDeadline.getTime());
    }
  });

  it("keeps one fifteen-minute number and no grace period", () => {
    // Fifteen matches Razorpay's own Payment Link floor, so the database hold
    // never expires while the provider link is still payable.
    expect(PAYMENT_LINK_HOLD_MINUTES).toBe(15);
    expect(read("lib/payments/razorpay.ts")).toContain(
      "RAZORPAY_PAYMENT_LINK_HOLD_MINUTES = PAYMENT_LINK_HOLD_MINUTES",
    );
    const policy = read("lib/cart/reservation-policy.ts");
    expect(policy).not.toMatch(/GRACE/);
    expect(policy).not.toContain("getLivePaymentWindowStart");
  });
});

describe("the DELETE body decides, not the status code", () => {
  const hook = read("lib/commerce/use-server-cart.ts");

  it("treats removed !== true as a refusal", () => {
    expect(hook).toContain("payload?.removed !== true");
  });

  it("refuses outright while signed out rather than faking a removal", () => {
    expect(hook).toContain('code: "UNAUTHENTICATED", ok: false');
  });

  it("updates only the account query after the server confirms removal", () => {
    const confirmedAt = hook.indexOf("payload?.removed !== true");
    const queryDropAt = hook.indexOf(
      "queryClient.setQueryData<ServerCartItem[]>",
      confirmedAt,
    );
    expect(confirmedAt).toBeGreaterThan(-1);
    expect(queryDropAt).toBeGreaterThan(confirmedAt);
    // CartServerSync is the sole one-way presentation mirror; an old account's
    // request must never directly mutate a newly signed-in account's rows.
    expect(hook).not.toContain("removePresentationItem(productId)");
  });

  it("asks for a fresh answer instead of a cached one", () => {
    expect(hook).toContain('cache: "no-store"');
  });
});

describe("account transitions never leak a bag", () => {
  const sync = read("components/cart/cart-server-sync.tsx");
  const hook = read("lib/commerce/use-server-cart.ts");

  it("drops the prior account cache, rows and persisted copy", () => {
    expect(sync).toContain("serverCartKey(previous)");
    expect(sync).toContain("queryClient.cancelQueries");
    expect(sync).toContain("queryClient.removeQueries");
    expect(sync).toContain("items: []");
    expect(sync).toContain("useCartStore.persist.clearStorage()");
  });

  it("clears identity before returning for a loading server snapshot", () => {
    expect(sync.indexOf("if (previous !== nextUserId)")).toBeLessThan(
      sync.indexOf("if (isLoading) return"),
    );
    expect(sync).toContain("presentationUserId: nextUserId");
  });

  it("gates every rendered mirror row by the current session during render", () => {
    expect(hook).toContain("presentationMatchesViewer");
    expect(hook).toContain(
      "presentedItems: presentationMatchesViewer ? presentationItems : []",
    );

    for (const file of [
      "components/cart/cart-drawer.tsx",
      "components/cart/cart-page-client.tsx",
      "components/cart/cart-hero-stats.tsx",
      "components/checkout/checkout-page-client.tsx",
    ]) {
      expect(read(file)).toContain("presentedItems: items");
    }
  });

  it("keys checkout fields and addresses by account", () => {
    const checkout = read("components/checkout/checkout-page-client.tsx");
    expect(checkout).toContain(
      "<CheckoutPageClientForViewer key={viewerKey} {...props} />",
    );
    expect(checkout).toContain(
      'queryKey: ["addresses", serverCartUserId ?? "anonymous"]',
    );
  });
});

describe("the drawer opens for a shopper, not for a refetch", () => {
  const drawer = read("components/cart/cart-drawer.tsx");

  it("watches the explicit-add serial rather than the item count", () => {
    expect(drawer).toContain("addSerial > previousAddSerial.current");
    expect(drawer).not.toContain("totalItems > previousTotalItems.current");
  });
});

describe("product cards offer three actions and no fourth", () => {
  const card = read("components/product/product-card-commerce-row.tsx");

  it("never offers to complete a payment", () => {
    expect(card).not.toContain("Complete payment");
  });

  it("keeps + Cart, In bag and Notify me, with Releasing… only in flight", () => {
    expect(card).toContain('"Notify me"');
    expect(card).toContain('"In bag"');
    expect(card).toContain('"Releasing…"');
  });

  it("falls back to the idle text at rest, never to leftover animation state", () => {
    /*
     * The add sequence ends on setMotionLabel("In bag") and its reset timer
     * clears only `state`. A saree removed from the drawer therefore left the
     * card reading "In bag" over a working add button, with the trash gone and
     * the colours already back to "+ Cart".
     */
    const expression = card
      .slice(card.indexOf("const buttonLabel ="))
      .split(";")[0]
      .replace(/\s+/g, " ");

    // `label` stays the branch for a phase that is actually playing; what it
    // must never be is the answer at rest.
    expect(expression).toContain(
      'effectiveState === "idle" ? compactLabel || idleLabel : label',
    );
  });
});

describe("a clean browser can draw the bag", () => {
  it("serves the primary image from the cart endpoint itself", () => {
    const route = read("api/hono/routes/cart.ts");
    expect(route).toContain("imageUrl: line.imageUrl");
    expect(route).toContain("imageAlt: line.imageAlt");
    expect(route).toContain('c.header("Cache-Control", "private, no-store")');
  });

  it("resolves it in the query rather than trusting a visited card", () => {
    const query = read("db/queries/user-cart.ts");
    expect(query).toContain("imageUrl: sql<null | string>");
    expect(query).toContain("FROM product_images pi");
  });
});

describe("a removal never promises a saree it did not free", () => {
  const query = read("db/queries/user-cart.ts");
  const hook = read("lib/commerce/use-server-cart.ts");

  it("returns the locked product verdict when the release does not land", () => {
    /*
     * The row can go while the hold stays: the exact-match UPDATE can match
     * nothing even though the read a moment earlier said this bag owned it.
     * Answering "available" anyway flipped the card to "+ Cart" over a saree
     * the database still held, and the next click came back as another
     * shopper's claim on the shopper's own piece.
     */
    expect(query).toContain("product_stock_status");
    expect(query).toContain('"RELEASE_MISSED"');
    expect(query).toContain('"reserved_by_other"');
  });

  it("treats an expired hold as claimable rather than someone else's", () => {
    expect(query).toContain("productReservedUntil > now");
  });

  it("passes the server's verdict through instead of assuming available", () => {
    // An unknown or malformed verdict becomes Checking, never + Cart.
    const header = "const removeFromBag = useCallback(";
    const start = hook.indexOf(header);
    expect(start).toBeGreaterThan(-1);
    const end = hook.indexOf("useCallback(", start + header.length);
    const removal = hook.slice(start, end === -1 ? undefined : end);

    expect(removal).toContain("readViewerProductState(payload?.viewerState)");
    expect(removal).toContain('state: viewerState ?? "checking"');
    expect(hook).not.toContain('viewerState: "available"');
    expect(hook).not.toMatch(/\?\?\s*"available"/);
    expect(hook).not.toContain(
      'payload?.viewerState === "sold" ? "sold" : "available"',
    );
  });
});

describe("removal answers with a reason on every branch", () => {
  const query = read("db/queries/user-cart.ts");

  it.each([
    "SOLD",
    "PAYMENT_IN_PROGRESS",
    "STALE_ROW",
    "RELEASED",
    "RELEASE_MISSED",
  ])("names %s", (reason) => {
    expect(query).toContain(`"${reason}"`);
  });
});
