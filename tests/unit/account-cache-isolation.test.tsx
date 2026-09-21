// @vitest-environment jsdom
/**
 * One tab, two accounts: nothing the first loaded may reach the second.
 *
 * Spec LOGOUT: clear the authenticated cart, wishlist and query caches, keep
 * the account's data on the server, restore it when the same account signs in
 * again, and never show one account's cache to another account.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Both storages are in memory: the cart store binds localStorage when its
 * module evaluates, and the pending intent and checkout attempt live in
 * sessionStorage.
 */
vi.hoisted(() => {
  const memoryStorage = () => {
    const memory = new Map<string, string>();
    return {
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => void memory.delete(key),
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
});

type SessionStub = {
  data: null | { user: { id: string } };
  status: "authenticated" | "loading" | "unauthenticated";
};

const session = vi.hoisted(() => ({
  current: { data: null, status: "unauthenticated" } as SessionStub,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => session.current,
}));

import {
  CartServerSync,
  clearAccountClientState,
} from "@/components/cart/cart-server-sync";
import { getCheckoutAttempt } from "@/lib/checkout/checkout-attempt";
import type { CheckoutOrderPayload } from "@/lib/checkout/use-checkout-payment";
import {
  readIntent,
  rememberIntent,
  type PendingCommerceIntent,
} from "@/lib/commerce/auth-intent";
import { serverCartKey, type ServerCartItem } from "@/lib/commerce/use-server-cart";
import { useCartStore } from "@/lib/store/cart-store";
import { wishlistIdsKey } from "@/lib/wishlist/use-wishlist";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const SAREE = "00000000-0000-4000-8000-00000000000a";
const HOLD_UNTIL = "2026-09-11T11:00:00.000Z";

const signedIn = (userId: string): SessionStub => ({
  data: { user: { id: userId } },
  status: "authenticated",
});
const SIGNED_OUT: SessionStub = { data: null, status: "unauthenticated" };

const bagLine: ServerCartItem = {
  addedAt: "2026-09-11T10:00:00.000Z",
  productId: SAREE,
  reservedUntil: HOLD_UNTIL,
  selectedOptions: null,
  status: "active",
  viewerState: "in_my_cart",
};

const PAYLOAD: CheckoutOrderPayload = {
  items: [{ productId: SAREE, quantity: 1 }],
  shippingAddress: {
    city: "Kochi",
    country: "India",
    email: "shopper@example.com",
    line1: "1 Trunk Lane",
    name: "Shopper",
    postalCode: "682001",
  },
  shippingMethod: "standard",
};

const INTENT: PendingCommerceIntent = {
  id: "intent-1",
  productId: SAREE,
  source: "product-card",
  type: "add-to-cart",
};

/* The key shapes the account pages, the header and checkout actually use. */
const accountKeysFor = (userId: string) => [
  wishlistIdsKey(userId),
  ["wishlist", "products", userId, [SAREE]],
  ["profile", userId],
  ["addresses", userId],
  ["orders", userId],
  ["order", userId, "order-1"],
];

/* The server's rows per account, answered for whoever the session says. */
let rowsOnServer: Record<string, ServerCartItem[]> = {};
let cartReadsBy: string[] = [];
const fetchMock = vi.fn();

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const flush = async () => {
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderAs = async (next: SessionStub) => {
  session.current = next;
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CartServerSync />
      </QueryClientProvider>,
    );
  });
  await flush();
};

const cachedKeysMentioning = (userId: string) =>
  queryClient
    .getQueryCache()
    .findAll()
    .map((query) => query.queryKey)
    .filter((queryKey) => JSON.stringify(queryKey).includes(userId));

const seedAccountState = (userId: string) => {
  for (const queryKey of accountKeysFor(userId)) {
    queryClient.setQueryData(queryKey, { owner: userId });
  }
  rememberIntent(INTENT, Date.now());
  return getCheckoutAttempt(PAYLOAD).checkoutAttemptId;
};

beforeEach(() => {
  rowsOnServer = { "user-a": [bagLine] };
  cartReadsBy = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url !== "/api/v2/cart/items") {
      throw new Error(`Unexpected request: ${url}`);
    }
    const userId = session.current.data?.user.id ?? "anonymous";
    // Account B's bag is still on its way for the whole test.
    if (userId === "user-b") return new Promise(() => {});
    cartReadsBy.push(userId);
    return {
      json: async () => ({ items: rowsOnServer[userId] ?? [] }),
      ok: true,
      status: 200,
    };
  });
  vi.stubGlobal("fetch", fetchMock);

  window.sessionStorage.clear();
  useCartStore.setState({
    hasHydrated: false,
    items: [],
    presentationUserId: null,
    releasingIds: [],
  });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("switching accounts in one tab", () => {
  it("forgets account A's caches, bag, pending click and checkout attempt the moment B signs in", async () => {
    await renderAs(signedIn("user-a"));
    expect(useCartStore.getState().items.map((item) => item.id)).toEqual([SAREE]);

    const attemptBefore = seedAccountState("user-a");
    queryClient.setQueryData(["collection", "featured"], ["shared"]);

    await renderAs(signedIn("user-b"));

    expect(cachedKeysMentioning("user-a")).toEqual([]);
    // Nothing account-free is thrown away with it.
    expect(queryClient.getQueryData(["collection", "featured"])).toEqual(["shared"]);
    // B's own bag is still loading; the mirror is empty, never A's.
    expect(useCartStore.getState()).toMatchObject({
      items: [],
      presentationUserId: "user-b",
      releasingIds: [],
    });
    expect(readIntent(Date.now())).toBeNull();
    expect(getCheckoutAttempt(PAYLOAD).checkoutAttemptId).not.toBe(attemptBefore);
  });

  it("holds nothing while signed out, and brings A's bag back from the server when A signs in again", async () => {
    await renderAs(signedIn("user-a"));
    expect(cartReadsBy).toEqual(["user-a"]);
    seedAccountState("user-a");

    await renderAs(SIGNED_OUT);
    expect(cachedKeysMentioning("user-a")).toEqual([]);
    expect(useCartStore.getState()).toMatchObject({
      items: [],
      presentationUserId: null,
    });

    await renderAs(signedIn("user-a"));
    expect(cartReadsBy).toEqual(["user-a", "user-a"]);
    expect(queryClient.getQueryData(serverCartKey("user-a"))).toEqual([bagLine]);
    expect(useCartStore.getState().presentationUserId).toBe("user-a");
    expect(useCartStore.getState().items.map((item) => item.id)).toEqual([SAREE]);
  });

  it("lets a signed-out click replay after the sign-in it asked for", async () => {
    await renderAs(SIGNED_OUT);
    rememberIntent(INTENT, Date.now());

    await renderAs(signedIn("user-a"));

    expect(readIntent(Date.now())).toMatchObject({
      productId: SAREE,
      type: "add-to-cart",
    });
  });
});

describe("an explicit sign-out", () => {
  it("clears the same state before the session change arrives", async () => {
    await renderAs(signedIn("user-a"));
    const attemptBefore = seedAccountState("user-a");

    await act(async () => {
      // signOut has resolved: next-auth holds no session, but React has not
      // rendered that yet. This is the moment the redirect would paint over.
      session.current = SIGNED_OUT;
      clearAccountClientState(queryClient);

      expect(cachedKeysMentioning("user-a")).toEqual([]);
      expect(useCartStore.getState()).toMatchObject({
        items: [],
        presentationUserId: null,
        releasingIds: [],
      });
      expect(readIntent(Date.now())).toBeNull();
      expect(getCheckoutAttempt(PAYLOAD).checkoutAttemptId).not.toBe(
        attemptBefore,
      );

      root.render(
        <QueryClientProvider client={queryClient}>
          <CartServerSync />
        </QueryClientProvider>,
      );
    });
    await flush();

    // The session change reaching CartServerSync finds nothing to bring back.
    expect(useCartStore.getState().items).toEqual([]);
    expect(cachedKeysMentioning("user-a")).toEqual([]);
    expect(cartReadsBy).toEqual(["user-a"]);
  });

  it("runs straight after signOut, before the redirect", () => {
    const shell = read("components/account/account-shell.tsx");
    const signedOutAt = shell.indexOf("await signOut(");
    const clearedAt = shell.indexOf("clearAccountClientState(queryClient)");
    const redirectedAt = shell.indexOf("router.push(");

    expect(signedOutAt).toBeGreaterThan(-1);
    expect(clearedAt).toBeGreaterThan(signedOutAt);
    expect(redirectedAt).toBeGreaterThan(clearedAt);
  });
});

describe("account pages key their caches by the account", () => {
  /*
   * The clearing above finds an account's queries by the owner in the key.
   * An unkeyed page cache would be invisible to it and readable by the next
   * account for as long as the refetch took.
   */
  it.each([
    ["app/(site)/account/profile/page.tsx", 'queryKey: ["profile", userId]', 'queryKey: ["profile"]'],
    ["app/(site)/account/addresses/page.tsx", '["addresses", userId ?? "anonymous"]', 'queryKey: ["addresses"]'],
    ["app/(site)/account/orders/page.tsx", 'queryKey: ["orders", userId]', 'queryKey: ["orders"]'],
    ["app/(site)/account/orders/[id]/page.tsx", 'queryKey: ["order", userId, id]', 'queryKey: ["order", id]'],
    [
      "app/(site)/account/wishlist/page.tsx",
      'queryKey: ["wishlist", "products", userId, ids]',
      'queryKey: ["wishlist", "products", ids]',
    ],
  ])("%s", (file, keyed, unkeyed) => {
    const page = read(file);
    expect(page).toContain(keyed);
    expect(page).not.toContain(unkeyed);
  });
});
