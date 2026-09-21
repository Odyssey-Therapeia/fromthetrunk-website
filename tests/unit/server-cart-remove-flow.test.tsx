// @vitest-environment jsdom
/**
 * Taking a saree out of the bag, through the real client hooks.
 *
 * Required test 6: remove → Releasing… → + Cart. Required test 7: the same
 * saree can be added straight back. Required test 13 (mutation side): a
 * malformed verdict announces "checking", never "available". A refusal's
 * verdict is applied at once, and a signed-out click invents none.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The cart store binds its persist storage when the module evaluates, and
 * Node's own localStorage shadows jsdom's and throws without a backing file.
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

type SessionStub = {
  data: null | { user: { id: string } };
  status: "authenticated" | "loading" | "unauthenticated";
};

const session = vi.hoisted(() => ({
  current: {
    data: { user: { id: "user-a" } },
    status: "authenticated",
  } as SessionStub,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => session.current,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartExpirySweeper } from "@/components/cart/cart-expiry-sweeper";
import { mergeServerBag } from "@/components/cart/cart-server-sync";
import {
  serverCartKey,
  useServerCart,
  type BagMutationResult,
  type ServerCartItem,
} from "@/lib/commerce/use-server-cart";
import {
  subscribeToViewerState,
  type ViewerStateAnnouncement,
} from "@/lib/commerce/viewer-state-bus";
import { CollectionStockProvider, useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { useCartStore, type CartItem } from "@/lib/store/cart-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const USER = "user-a";
const VIEWER_KEY = "user:user-a";
const A = "00000000-0000-4000-8000-000000000001";
const HOLD_UNTIL = "2026-09-11T11:00:00.000Z";

/* The card's canonical copy; releasing is the one overlay the client adds. */
const LABELS: Record<string, string> = {
  available: "+ Cart",
  checking: "Checking…",
  in_my_cart: "In bag",
  payment_pending: "In bag",
  reserved_by_other: "Notify me",
  sold: "Sold",
};

const bagLine = (overrides: Partial<ServerCartItem> = {}): ServerCartItem => ({
  addedAt: "2026-09-11T10:00:00.000Z",
  productId: A,
  reservedUntil: HOLD_UNTIL,
  selectedOptions: null,
  status: "active",
  viewerState: "in_my_cart",
  ...overrides,
});

const jsonResponse = (status: number, body: unknown) => ({
  json: async () => body,
  ok: status >= 200 && status < 300,
  status,
});

/* What the server currently believes, read by the fake routes below. */
let viewerStateOnServer = "in_my_cart";
let cartRowsOnServer: unknown[] = [];
let deleteAnswers: Array<(response: unknown) => void> = [];
let postAnswer: unknown = null;

const serverFake = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/v2/products/viewer-state") {
    const { productIds } = JSON.parse(String(init?.body)) as {
      productIds: string[];
    };
    return jsonResponse(200, {
      products: Object.fromEntries(
        productIds.map((id) => [
          id,
          {
            reservedUntil:
              viewerStateOnServer === "available" ? null : HOLD_UNTIL,
            state: viewerStateOnServer,
          },
        ]),
      ),
    });
  }
  if (url === "/api/v2/cart/items" && method === "GET") {
    return jsonResponse(200, { items: cartRowsOnServer });
  }
  if (url === `/api/v2/cart/items/${A}` && method === "DELETE") {
    return new Promise((resolve) => {
      deleteAnswers.push(resolve);
    });
  }
  if (url === "/api/v2/cart/items" && method === "POST") return postAnswer;
  throw new Error(`Unexpected request: ${method} ${url}`);
};

const fetchMock = vi.fn();

const harness: {
  cart: null | ReturnType<typeof useServerCart>;
  labels: string[];
} = { cart: null, labels: [] };

function Card() {
  const cart = useServerCart();
  const viewer = useCollectionStock(A, { reservedUntil: null, state: "available" });
  const label = cart.isReleasing(A) ? "Releasing…" : LABELS[viewer.state];

  useEffect(() => {
    harness.cart = cart;
  });
  useEffect(() => {
    harness.labels.push(label);
  }, [label]);

  return <span data-card-label="">{label}</span>;
}

let announcements: ViewerStateAnnouncement[] = [];
let cartUpdatedEvents = 0;
const countCartUpdated = () => {
  cartUpdatedEvents += 1;
};
let stopListening = () => {};
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const labelText = () =>
  container.querySelector("[data-card-label]")?.textContent;

const settleMicrotasks = async () => {
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const mount = async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CollectionStockProvider>
          <Card />
        </CollectionStockProvider>
      </QueryClientProvider>,
    );
  });
  // Registration settles, the first verdict arrives.
  await advance(250);
};

/** Starts a removal and hands back a way to answer its DELETE. */
const startRemoval = async () => {
  let removal!: Promise<BagMutationResult>;
  await act(async () => {
    removal = harness.cart!.removeFromBag(A);
    await settleMicrotasks();
  });
  expect(deleteAnswers).toHaveLength(1);

  return async (status: number, body: unknown) => {
    let result!: BagMutationResult;
    await act(async () => {
      deleteAnswers[0](jsonResponse(status, body));
      result = await removal;
    });
    await advance(0);
    return result;
  };
};

const cachedBag = () =>
  queryClient.getQueryData<ServerCartItem[]>(serverCartKey(USER));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  session.current = { data: { user: { id: USER } }, status: "authenticated" };
  viewerStateOnServer = "in_my_cart";
  cartRowsOnServer = [bagLine()];
  deleteAnswers = [];
  postAnswer = null;
  harness.cart = null;
  harness.labels = [];
  announcements = [];
  cartUpdatedEvents = 0;

  fetchMock.mockReset();
  fetchMock.mockImplementation(serverFake);
  vi.stubGlobal("fetch", fetchMock);

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(serverCartKey(USER), [bagLine()]);
  useCartStore.setState({
    hasHydrated: true,
    items: [],
    presentationUserId: USER,
    releasingIds: [],
  });

  stopListening = subscribeToViewerState((announcement) => {
    announcements.push(announcement);
  });
  window.addEventListener("ftt:cart-updated", countCartUpdated);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  stopListening();
  window.removeEventListener("ftt:cart-updated", countCartUpdated);
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("remove, then take it straight back", () => {
  it("goes In bag → Releasing… → + Cart, and the same saree can be added again at once", async () => {
    await mount();
    expect(labelText()).toBe("In bag");

    const answerDelete = await startRemoval();
    expect(labelText()).toBe("Releasing…");
    expect(useCartStore.getState().releasingIds).toEqual([A]);

    viewerStateOnServer = "available";
    cartRowsOnServer = [];
    const removed = await answerDelete(200, {
      reason: "RELEASED",
      released: true,
      removed: true,
      viewerState: "available",
    });

    expect(removed).toStrictEqual({ ok: true, viewerState: "available" });
    expect(announcements).toEqual([
      { productId: A, reservedUntil: null, state: "available", viewerKey: VIEWER_KEY },
    ]);
    expect(cachedBag()).toEqual([]);
    expect(useCartStore.getState().releasingIds).toEqual([]);
    expect(labelText()).toBe("+ Cart");
    expect(harness.labels.slice(harness.labels.indexOf("In bag"))).toEqual([
      "In bag",
      "Releasing…",
      "+ Cart",
    ]);

    // Required test 7: nothing left behind blocks the re-add.
    expect(harness.cart!.isReleasing(A)).toBe(false);
    viewerStateOnServer = "in_my_cart";
    cartRowsOnServer = [bagLine()];
    postAnswer = jsonResponse(200, {
      item: bagLine({ viewerState: undefined }),
      reservedUntil: HOLD_UNTIL,
      viewerState: "in_my_cart",
    });

    let added!: BagMutationResult;
    await act(async () => {
      added = await harness.cart!.addToBag({ productId: A });
    });
    await advance(0);

    expect(added.ok).toBe(true);
    expect(added.code).toBeUndefined();
    expect(added.viewerState).toBe("in_my_cart");
    // The POST's verdict rides on the line, so the drawer need not wait.
    expect(added.item?.viewerState).toBe("in_my_cart");
    expect(announcements[announcements.length - 1]).toEqual({
      productId: A,
      reservedUntil: HOLD_UNTIL,
      state: "in_my_cart",
      viewerKey: VIEWER_KEY,
    });
    expect(labelText()).toBe("In bag");
  });

  it("tells every card before it waits on the bag's own refetch", async () => {
    await mount();

    let releaseCartGet: (() => void) | undefined;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/v2/cart/items" && (init?.method ?? "GET") === "GET") {
        await new Promise<void>((resolve) => {
          releaseCartGet = resolve;
        });
        return jsonResponse(200, { items: [] });
      }
      return serverFake(url, init);
    });

    let removal!: Promise<BagMutationResult>;
    let finished = false;
    await act(async () => {
      removal = harness.cart!.removeFromBag(A);
      void removal.then(() => {
        finished = true;
      });
      await settleMicrotasks();
    });
    await act(async () => {
      deleteAnswers[0](jsonResponse(200, { removed: true, viewerState: "available" }));
      await settleMicrotasks();
    });

    // The bag's refetch is still out, and the cards have already been told.
    expect(releaseCartGet).toBeTypeOf("function");
    expect(finished).toBe(false);
    expect(cartUpdatedEvents).toBe(1);

    let result!: BagMutationResult;
    await act(async () => {
      releaseCartGet!();
      result = await removal;
    });
    await advance(0);
    expect(result).toStrictEqual({ ok: true, viewerState: "available" });
  });
});

describe("a malformed verdict never becomes + Cart", () => {
  it("announces checking for a confirmed removal whose verdict is malformed", async () => {
    await mount();
    viewerStateOnServer = "available";
    cartRowsOnServer = [];

    const answerDelete = await startRemoval();
    const result = await answerDelete(200, { removed: true, viewerState: "AVAILABLE" });

    expect(result).toStrictEqual({ ok: true });
    expect(announcements.map((announcement) => announcement.state)).toEqual([
      "checking",
    ]);
  });

  it("announces checking for a successful add whose verdict is malformed", async () => {
    viewerStateOnServer = "available";
    cartRowsOnServer = [];
    queryClient.setQueryData(serverCartKey(USER), []);
    await mount();
    expect(labelText()).toBe("+ Cart");

    // The add really did land; only the verdict in its answer is garbage.
    viewerStateOnServer = "in_my_cart";
    cartRowsOnServer = [bagLine()];
    postAnswer = jsonResponse(200, {
      item: bagLine({ viewerState: undefined }),
      viewerState: "weird",
    });
    const labelsBeforeAdd = harness.labels.length;
    let added!: BagMutationResult;
    await act(async () => {
      added = await harness.cart!.addToBag({ productId: A });
    });
    await advance(0);

    expect(added.ok).toBe(true);
    expect(added.viewerState).toBeUndefined();
    expect(added.item?.viewerState).toBeUndefined();
    expect(announcements.map((announcement) => announcement.state)).toEqual([
      "checking",
    ]);
    // The card waits for the follow-up poll's real verdict; it never falls
    // back to offering the saree it just added.
    const labelsAfterAdd = harness.labels.slice(labelsBeforeAdd);
    expect(labelsAfterAdd).not.toContain("+ Cart");
    expect(labelText()).toBe("In bag");
  });

  it("keeps only verdicts the server can send on the lines it reads", async () => {
    await mount();
    cartRowsOnServer = [
      bagLine({ viewerState: "bogus" as never }),
      bagLine({
        productId: "00000000-0000-4000-8000-000000000002",
        status: "payment_pending",
        viewerState: "payment_pending",
      }),
    ];

    await act(async () => {
      await harness.cart!.refresh();
    });

    const [malformed, pending] = cachedBag() ?? [];
    expect(malformed).not.toHaveProperty("viewerState");
    expect(pending?.viewerState).toBe("payment_pending");
  });
});

describe("a refusal is applied, never invented", () => {
  it.each([
    [
      "a payment in progress",
      200,
      { reason: "PAYMENT_IN_PROGRESS", removed: false, viewerState: "payment_pending" },
      "payment_pending",
    ],
    [
      "a refused request that names the verdict",
      409,
      { code: "PAYMENT_IN_PROGRESS", viewerState: "payment_pending" },
      "payment_pending",
    ],
    ["a piece that has sold", 409, { code: "PRODUCT_SOLD", viewerState: "sold" }, "sold"],
  ] as const)(
    "keeps the row and hands every surface the verdict for %s at once",
    async (_label, status, body, verdict) => {
      await mount();
      viewerStateOnServer = verdict;

      const answerDelete = await startRemoval();
      const result = await answerDelete(status, body);

      expect(result.ok).toBe(false);
      expect(result.viewerState).toBe(verdict);
      expect(announcements).toEqual([
        { productId: A, reservedUntil: null, state: verdict, viewerKey: VIEWER_KEY },
      ]);
      expect(cachedBag()?.map((line) => line.productId)).toEqual([A]);
      expect(useCartStore.getState().releasingIds).toEqual([]);
    },
  );

  it("leaves the last trusted verdict alone when a refusal names none", async () => {
    await mount();

    const answerDelete = await startRemoval();
    const result = await answerDelete(500, { code: "INTERNAL" });

    expect(result).toStrictEqual({ code: "INTERNAL", ok: false, reason: undefined });
    expect(announcements).toEqual([]);
    expect(labelText()).toBe("In bag");
  });

  it("refuses a signed-out removal without asking the server or inventing a verdict", async () => {
    session.current = { data: null, status: "unauthenticated" };
    useCartStore.setState({ presentationUserId: null });
    await mount();

    let result!: BagMutationResult;
    await act(async () => {
      result = await harness.cart!.removeFromBag(A);
    });

    expect(result).toStrictEqual({ code: "UNAUTHENTICATED", ok: false });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/v2/cart/items/")),
    ).toBe(false);
    expect(announcements).toEqual([]);
  });
});

describe("the drawer's copy of the verdict", () => {
  const drawerLine = (overrides: Partial<CartItem> = {}): CartItem => ({
    id: A,
    image: "",
    name: "Saree",
    price: 100,
    quantity: 1,
    reservedUntil: HOLD_UNTIL,
    slug: "saree",
    status: "payment_pending",
    ...overrides,
  });

  it("copies the server's verdict onto the mirrored line and never borrows a local one", () => {
    const [line] = mergeServerBag(
      [bagLine({ status: "payment_pending", viewerState: "payment_pending" })],
      [drawerLine({ viewerState: "in_my_cart" })],
    );
    expect(line.viewerState).toBe("payment_pending");

    const [withoutVerdict] = mergeServerBag(
      [bagLine({ viewerState: undefined })],
      [drawerLine({ viewerState: "in_my_cart" })],
    );
    expect(withoutVerdict.viewerState).toBeUndefined();
  });

  it("takes a verdict change even when nothing else about the line moved", () => {
    useCartStore.setState({ items: [drawerLine({ viewerState: "in_my_cart" })] });
    useCartStore
      .getState()
      .replaceItems([drawerLine({ viewerState: "payment_pending" })]);
    expect(useCartStore.getState().items[0]?.viewerState).toBe("payment_pending");

    const unchanged = useCartStore.getState().items;
    useCartStore
      .getState()
      .replaceItems([drawerLine({ viewerState: "payment_pending" })]);
    expect(useCartStore.getState().items).toBe(unchanged);
  });
});

/*
 * The poller's ten-second cadence and its back-off give way only to a change
 * to the bag. Opening the drawer, a hold running out and a return to the tab
 * re-read the bag; they used to ring the cards too, and each one cost a
 * verdict request off the cadence, even against a failing server.
 */
describe("only a change to the bag asks the cards off their cadence", () => {
  const VERDICTS_URL = "/api/v2/products/viewer-state";
  let verdictsFail = false;
  let holdVerdicts = false;
  let heldVerdicts: Array<() => void> = [];

  const verdictRequests = () =>
    fetchMock.mock.calls.filter(([url]) => url === VERDICTS_URL).length;
  const bagReads = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/v2/cart/items" &&
        ((init as RequestInit | undefined)?.method ?? "GET") === "GET",
    ).length;

  /* The drawer's mirrored line for the same saree the card shows. */
  const drawerLine = (reservedUntil: string): CartItem => ({
    id: A,
    image: "",
    name: "Saree",
    price: 100,
    quantity: 1,
    reservedUntil,
    slug: "saree",
    status: "active",
    viewerState: "in_my_cart",
  });

  /* The card, the header's drawer and the app's expiry sweeper, together. */
  const mountWithDrawer = async (reservedUntil: string) => {
    queryClient.setQueryData(serverCartKey(USER), [bagLine({ reservedUntil })]);
    cartRowsOnServer = [bagLine({ reservedUntil })];
    useCartStore.setState({ items: [drawerLine(reservedUntil)] });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CollectionStockProvider>
            <Card />
            <CartDrawer />
            <CartExpirySweeper />
          </CollectionStockProvider>
        </QueryClientProvider>,
      );
    });
    await advance(250);
  };

  const openDrawer = async () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      "button[data-ftt-cart-target]",
    );
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.click();
      await settleMicrotasks();
    });
    await advance(0);
    expect(document.body.textContent).toContain("Shopping bag");
  };

  beforeEach(() => {
    verdictsFail = false;
    holdVerdicts = false;
    heldVerdicts = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === VERDICTS_URL && verdictsFail) {
        return jsonResponse(500, { code: "ERROR" });
      }
      if (url === VERDICTS_URL && holdVerdicts) {
        await new Promise<void>((resolve) => {
          heldVerdicts.push(resolve);
        });
      }
      return serverFake(url, init);
    });
  });

  it("re-reads the bag when the drawer opens and when a hold runs out, and asks for no verdict", async () => {
    await mountWithDrawer(new Date(Date.now() + 3_000).toISOString());
    expect(verdictRequests()).toBe(1);

    const readsBeforeOpen = bagReads();
    await openDrawer();
    expect(bagReads()).toBeGreaterThan(readsBeforeOpen);
    expect(verdictRequests()).toBe(1);

    // The sweeper and the open drawer both re-read once the hold lapses.
    const readsBeforeExpiry = bagReads();
    await advance(3_000);
    expect(bagReads()).toBeGreaterThan(readsBeforeExpiry);
    expect(verdictRequests()).toBe(1);

    // The cadence itself is untouched.
    await advance(6_999);
    expect(verdictRequests()).toBe(1);
    await advance(1);
    expect(verdictRequests()).toBe(2);
  });

  it("takes a removal as exactly one follow-up behind the request in flight, and a re-add as one request at once", async () => {
    await mount();
    expect(verdictRequests()).toBe(1);

    holdVerdicts = true;
    await advance(10_000);
    expect(verdictRequests()).toBe(2);

    const answerDelete = await startRemoval();
    viewerStateOnServer = "available";
    cartRowsOnServer = [];
    await answerDelete(200, {
      reason: "RELEASED",
      released: true,
      removed: true,
      viewerState: "available",
    });
    expect(verdictRequests()).toBe(2);

    holdVerdicts = false;
    await act(async () => {
      for (const release of heldVerdicts.splice(0)) release();
      await settleMicrotasks();
    });
    expect(verdictRequests()).toBe(3);
    await advance(9_999);
    expect(verdictRequests()).toBe(3);
    await advance(1);
    expect(verdictRequests()).toBe(4);

    // With nothing in flight, the re-add asks at once, and only once.
    viewerStateOnServer = "in_my_cart";
    cartRowsOnServer = [bagLine()];
    postAnswer = jsonResponse(200, { item: bagLine(), viewerState: "in_my_cart" });
    await act(async () => {
      await harness.cart!.addToBag({ productId: A });
    });
    await advance(0);
    expect(verdictRequests()).toBe(5);
    await advance(9_999);
    expect(verdictRequests()).toBe(5);
  });

  it("re-reads the bag after a refused removal or add, and asks for no verdict off the cadence", async () => {
    await mount();
    expect(verdictRequests()).toBe(1);

    viewerStateOnServer = "payment_pending";
    const answerDelete = await startRemoval();
    const refusedRemoval = await answerDelete(200, {
      reason: "PAYMENT_IN_PROGRESS",
      removed: false,
      viewerState: "payment_pending",
    });
    expect(refusedRemoval.ok).toBe(false);

    postAnswer = jsonResponse(409, {
      code: "PRODUCT_RESERVED",
      viewerState: "reserved_by_other",
    });
    let refusedAdd!: BagMutationResult;
    await act(async () => {
      refusedAdd = await harness.cart!.addToBag({ productId: A });
    });
    await advance(0);
    expect(refusedAdd.ok).toBe(false);
    // Each refusal's own verdict reached the card without a request.
    expect(labelText()).toBe("Notify me");

    expect(verdictRequests()).toBe(1);
    await advance(9_999);
    expect(verdictRequests()).toBe(1);
    await advance(1);
    expect(verdictRequests()).toBe(2);
  });

  it("keeps a failing server's back-off through the drawer's re-reads and a return to the tab", async () => {
    verdictsFail = true;
    await mountWithDrawer(new Date(Date.now() + 30 * 60_000).toISOString());
    // One failure: the next request waits twenty seconds.
    expect(verdictRequests()).toBe(1);

    await openDrawer();
    await advance(5_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await harness.cart!.refresh();
      await settleMicrotasks();
    });
    expect(verdictRequests()).toBe(1);

    await advance(14_999);
    expect(verdictRequests()).toBe(1);
    await advance(1);
    expect(verdictRequests()).toBe(2);
  });
});
