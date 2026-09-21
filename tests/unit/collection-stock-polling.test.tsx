// @vitest-environment jsdom
/**
 * The batched viewer-state poller, run against fake timers and held requests.
 *
 * Required test 19: one batched request every ten seconds, visible tab only,
 * paused offline, never two requests on the wire. Required test 13 (polling
 * side): a failed or malformed answer never becomes "+ Cart". Required test 6
 * (race): a poll that left before a removal's announcement cannot put
 * "In bag" back.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { CART_TAB_SYNC_KEY } from "@/lib/commerce/cart-tab-bus";
import {
  announceViewerState,
  readViewerStateSequence,
} from "@/lib/commerce/viewer-state-bus";
import {
  CollectionStockProvider,
  useCollectionStock,
  type CollectionStockEntry,
} from "@/lib/realtime/use-collection-stock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const productId = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const A = productId(1);
const B = productId(2);
const C = productId(3);
const HOLD_UNTIL = "2026-09-11T10:30:00.000Z";

const AVAILABLE_SEED: CollectionStockEntry = {
  reservedUntil: null,
  state: "available",
};
const SOLD_SEED: CollectionStockEntry = { reservedUntil: null, state: "sold" };
const HELD_SEED: CollectionStockEntry = {
  reservedUntil: HOLD_UNTIL,
  state: "reserved_by_other",
};
const available = { reservedUntil: null, state: "available" };
const inMyCart = { reservedUntil: HOLD_UNTIL, state: "in_my_cart" };
const heldByOther = { reservedUntil: HOLD_UNTIL, state: "reserved_by_other" };

const SIGNED_IN: SessionStub = {
  data: { user: { id: "user-a" } },
  status: "authenticated",
};
const SIGNED_OUT: SessionStub = { data: null, status: "unauthenticated" };
const LOADING: SessionStub = { data: null, status: "loading" };

type HeldRequest = {
  productIds: string[];
  /** Whether the request before this one had been aborted when this one left. */
  previousWasAborted: boolean | null;
  reject: (error: unknown) => void;
  resolve: (response: unknown) => void;
  signal: AbortSignal;
};

let requests: HeldRequest[] = [];
const fetchMock = vi.fn();

const holdRequest = (_url: string, init: RequestInit) =>
  new Promise((resolve, reject) => {
    const signal = init.signal as AbortSignal;
    const previous = requests[requests.length - 1];
    requests.push({
      previousWasAborted: previous ? previous.signal.aborted : null,
      productIds: (JSON.parse(String(init.body)) as { productIds: string[] })
        .productIds,
      reject,
      resolve,
      signal,
    });
    // A real fetch rejects the moment its signal aborts.
    signal.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });

const verdicts = (products: unknown) => ({
  json: async () => ({ products }),
  ok: true,
  status: 200,
});
const httpError = (status: number) => ({
  json: async () => ({ code: "ERROR" }),
  ok: false,
  status,
});

let visibility: DocumentVisibilityState = "visible";
let online = true;
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  get: () => online,
});

let container: HTMLDivElement;
let root: Root;

function Probe({ id, seed }: { id: string; seed: CollectionStockEntry }) {
  const entry = useCollectionStock(id, seed);
  return <output data-product={id}>{entry.state}</output>;
}

const renderCards = async (
  ids: string[],
  seeds: Record<string, CollectionStockEntry> = {},
) => {
  await act(async () => {
    root.render(
      <CollectionStockProvider>
        {ids.map((id) => (
          <Probe id={id} key={id} seed={seeds[id] ?? AVAILABLE_SEED} />
        ))}
      </CollectionStockProvider>,
    );
  });
};

const stateOf = (id: string) =>
  container.querySelector(`[data-product="${id}"]`)?.textContent;

const settleMicrotasks = async () => {
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const respond = async (request: HeldRequest, response: unknown) => {
  await act(async () => {
    request.resolve(response);
    await settleMicrotasks();
  });
};

const failRequest = async (request: HeldRequest, error: unknown) => {
  await act(async () => {
    request.reject(error);
    await settleMicrotasks();
  });
};

const dispatch = async (target: EventTarget, type: string) => {
  await act(async () => {
    target.dispatchEvent(new Event(type));
    await settleMicrotasks();
  });
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  requests = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(holdRequest);
  vi.stubGlobal("fetch", fetchMock);
  visibility = "visible";
  online = true;
  session.current = SIGNED_IN;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("one batched request every ten seconds", () => {
  it("asks for every registered card in one request once the grid settles", async () => {
    await renderCards([C, A, B]);
    await advance(249);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/products/viewer-state",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requests[0].productIds).toEqual([A, B, C]);

    await respond(
      requests[0],
      verdicts({ [A]: available, [B]: heldByOther, [C]: inMyCart }),
    );
    expect(stateOf(A)).toBe("available");
    expect(stateOf(B)).toBe("reserved_by_other");
    expect(stateOf(C)).toBe("in_my_cart");

    await advance(9_999);
    expect(requests).toHaveLength(1);
    await advance(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].productIds).toEqual([A, B, C]);
  });

  it("sends exactly one request of at most 200 ids; the rest, and ids the route rejects, wait as checking", async () => {
    session.current = SIGNED_OUT;
    const ids = Array.from({ length: 205 }, (_, index) => productId(index + 1));
    const polled = ids.slice(0, 200);
    const [pastTheCap, ...alsoPastTheCap] = ids.slice(200);
    const trustedPastTheCap = alsoPastTheCap.pop()!;
    await renderCards([...ids, "not-a-uuid"]);

    // A verdict a mutation already proved is trusted, cap or no cap.
    await act(async () => {
      announceViewerState({
        productId: trustedPastTheCap,
        reservedUntil: HOLD_UNTIL,
        state: "reserved_by_other",
        viewerKey: "unauthenticated",
      });
    });

    await advance(250);
    expect(requests).toHaveLength(1);
    expect(requests[0].productIds).toEqual(polled);

    await respond(
      requests[0],
      verdicts({
        ...Object.fromEntries(polled.map((id) => [id, available])),
        // An answer for an id this cycle never asked about proves nothing.
        [pastTheCap]: available,
      }),
    );

    // No chunked follow-up: the next request is the next tick, and it is
    // again a single one.
    expect(requests).toHaveLength(1);
    await advance(9_999);
    expect(requests).toHaveLength(1);
    await advance(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].productIds).toEqual(polled);

    expect(polled.every((id) => stateOf(id) === "available")).toBe(true);
    expect([pastTheCap, ...alsoPastTheCap].map(stateOf)).toEqual([
      "checking",
      "checking",
      "checking",
      "checking",
    ]);
    expect(stateOf(trustedPastTheCap)).toBe("reserved_by_other");
    // Nothing can ever confirm an id the route would refuse.
    expect(stateOf("not-a-uuid")).toBe("checking");
  });

  it("keeps a failed single request from touching any trusted verdict past the cap", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => productId(index + 1));
    await renderCards(ids);
    await advance(250);
    await respond(
      requests[0],
      verdicts(Object.fromEntries(ids.slice(0, 200).map((id) => [id, inMyCart]))),
    );
    expect(stateOf(ids[0])).toBe("in_my_cart");
    expect(stateOf(ids[200])).toBe("checking");

    await advance(10_000);
    await failRequest(requests[1], new TypeError("Failed to fetch"));
    expect(requests).toHaveLength(2);
    expect(stateOf(ids[0])).toBe("in_my_cart");
    expect(stateOf(ids[200])).toBe("checking");
  });
});

describe("visible, online tabs only", () => {
  it("stays silent while the tab is hidden and asks exactly once when it comes back", async () => {
    visibility = "hidden";
    await renderCards([A]);
    await advance(60_000);
    expect(requests).toHaveLength(0);

    visibility = "visible";
    // Returning to a tab fires both events; they may cost one request.
    await dispatch(document, "visibilitychange");
    await dispatch(window, "focus");
    expect(requests).toHaveLength(1);

    await respond(requests[0], verdicts({ [A]: available }));
    visibility = "hidden";
    await dispatch(document, "visibilitychange");
    await advance(120_000);
    expect(requests).toHaveLength(1);

    visibility = "visible";
    await dispatch(document, "visibilitychange");
    expect(requests).toHaveLength(2);
  });

  it("pauses offline without counting the abandoned request, then resumes online", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: available }));
    await advance(10_000);
    expect(requests).toHaveLength(2);

    online = false;
    await dispatch(window, "offline");
    expect(requests[1].signal.aborted).toBe(true);
    await advance(120_000);
    await dispatch(window, "focus");
    expect(requests).toHaveLength(2);
    expect(stateOf(A)).toBe("available");

    online = true;
    await dispatch(window, "online");
    expect(requests).toHaveLength(3);

    await respond(requests[2], verdicts({ [A]: available }));
    // Not backed off: going offline was not the server failing.
    await advance(9_999);
    expect(requests).toHaveLength(3);
    await advance(1);
    expect(requests).toHaveLength(4);
  });
});

describe("never two requests on the wire", () => {
  it("lets focus, visibility and online ride the request already in flight", async () => {
    await renderCards([A, B]);
    await advance(250);
    expect(requests).toHaveLength(1);

    await advance(30_000);
    await dispatch(window, "focus");
    await dispatch(document, "visibilitychange");
    await dispatch(window, "online");
    expect(requests).toHaveLength(1);

    await respond(requests[0], verdicts({ [A]: available, [B]: available }));
    // No queued follow-up: the next request is the normal tick.
    expect(requests).toHaveLength(1);
    await advance(9_999);
    expect(requests).toHaveLength(1);
    await advance(1);
    expect(requests).toHaveLength(2);
  });

  it("queues exactly one follow-up for mutations that land mid-request", async () => {
    await renderCards([A]);
    await advance(250);

    await dispatch(window, "ftt:cart-updated");
    await dispatch(window, "ftt:cart-updated");
    await dispatch(window, "focus");
    expect(requests).toHaveLength(1);

    await respond(requests[0], verdicts({ [A]: inMyCart }));
    expect(requests).toHaveLength(2);

    await respond(requests[1], verdicts({ [A]: inMyCart }));
    expect(requests).toHaveLength(2);
    await advance(9_999);
    expect(requests).toHaveLength(2);
    await advance(1);
    expect(requests).toHaveLength(3);

    // With nothing in flight, a mutation asks at once.
    await respond(requests[2], verdicts({ [A]: inMyCart }));
    await dispatch(window, "ftt:cart-updated");
    expect(requests).toHaveLength(4);
  });

  it("aborts the request in flight when the registered cards change, and neither applies nor counts it", async () => {
    await renderCards([A]);
    await advance(250);
    const first = requests[0];
    expect(first.signal.aborted).toBe(false);

    // Its body is still arriving when the grid grows.
    let finishBody!: (body: unknown) => void;
    await respond(first, {
      json: () =>
        new Promise((resolve) => {
          finishBody = resolve;
        }),
      ok: true,
      status: 200,
    });

    await renderCards([A, B]);
    await advance(250);
    expect(first.signal.aborted).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1].previousWasAborted).toBe(true);
    expect(requests[1].productIds).toEqual([A, B]);

    await act(async () => {
      finishBody({ products: { [A]: inMyCart } });
      await settleMicrotasks();
    });
    expect(stateOf(A)).toBe("checking");

    await respond(requests[1], verdicts({ [A]: available, [B]: available }));
    expect(stateOf(A)).toBe("available");
    // The abandoned request was not a failure.
    await advance(10_000);
    expect(requests).toHaveLength(3);
  });

  it("backs off 10, 20, 40, 80 and 80 seconds on repeated transport failures, and one good answer resets it", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: available }));

    const expectNextRequestAfter = async (ms: number) => {
      const before = requests.length;
      await advance(ms - 1);
      expect(requests).toHaveLength(before);
      await advance(1);
      expect(requests).toHaveLength(before + 1);
      return requests[before];
    };

    await respond(await expectNextRequestAfter(10_000), httpError(500));
    await failRequest(
      await expectNextRequestAfter(20_000),
      new TypeError("Failed to fetch"),
    );
    await respond(await expectNextRequestAfter(40_000), {
      json: async () => ({ products: null }),
      ok: true,
      status: 200,
    });
    await respond(await expectNextRequestAfter(80_000), httpError(429));
    // A good answer resets the cadence even when it leaves a card out.
    await respond(await expectNextRequestAfter(80_000), verdicts({}));
    await expectNextRequestAfter(10_000);
  });
});

describe("an answer that cannot be trusted never becomes + Cart", () => {
  it("keeps the page's seed when no provider is mounted", async () => {
    await act(async () => {
      root.render(
        <>
          <Probe id={A} seed={AVAILABLE_SEED} />
          <Probe id={B} seed={{ reservedUntil: HOLD_UNTIL, state: "reserved_by_other" }} />
        </>,
      );
    });
    expect(stateOf(A)).toBe("available");
    expect(stateOf(B)).toBe("reserved_by_other");
    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a signed-in shopper checking until the first verdict, but keeps a sold seed sold", async () => {
    await renderCards([A, B], { [B]: SOLD_SEED });
    expect(stateOf(A)).toBe("checking");
    expect(stateOf(B)).toBe("sold");

    await advance(250);
    await failRequest(requests[0], new TypeError("Failed to fetch"));
    expect(stateOf(A)).toBe("checking");
    expect(stateOf(B)).toBe("sold");

    await advance(20_000);
    await respond(
      requests[1],
      verdicts({ [A]: available, [B]: { reservedUntil: null, state: "sold" } }),
    );
    expect(stateOf(A)).toBe("available");
    expect(stateOf(B)).toBe("sold");
  });

  it("keeps the seed for a signed-out first paint", async () => {
    session.current = SIGNED_OUT;
    await renderCards([A, B], { [B]: SOLD_SEED });
    expect(stateOf(A)).toBe("available");
    expect(stateOf(B)).toBe("sold");
  });

  it("shows checking while the session loads and asks nothing, then the seeds once signed out, then the verdicts once signed in", async () => {
    const seeds = { [A]: AVAILABLE_SEED, [B]: HELD_SEED, [C]: SOLD_SEED };
    const states = () => [A, B, C].map(stateOf);

    // A loading session may be the very shopper who holds B, and the page's
    // seeds were rendered for nobody in particular.
    session.current = LOADING;
    await renderCards([A, B, C], seeds);
    expect(states()).toEqual(["checking", "checking", "sold"]);
    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(states()).toEqual(["checking", "checking", "sold"]);

    session.current = SIGNED_OUT;
    await renderCards([A, B, C], seeds);
    expect(states()).toEqual(["available", "reserved_by_other", "sold"]);

    session.current = SIGNED_IN;
    await renderCards([A, B, C], seeds);
    expect(states()).toEqual(["checking", "checking", "sold"]);
    // The signed-out visitor's request never lands on the shopper's cards.
    expect(requests).toHaveLength(2);
    expect(requests[0].signal.aborted).toBe(true);
    await respond(
      requests[1],
      verdicts({
        [A]: heldByOther,
        [B]: inMyCart,
        [C]: { reservedUntil: null, state: "sold" },
      }),
    );
    expect(states()).toEqual(["reserved_by_other", "in_my_cart", "sold"]);
  });

  it.each([
    ["a server error", () => httpError(500)],
    ["a rate limit", () => httpError(429)],
    [
      "a body with no products map",
      () => ({ json: async () => ({}), ok: true, status: 200 }),
    ],
    ["a products list instead of a map", () => verdicts([])],
    [
      "a body that is not JSON",
      () => ({
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
        ok: true,
        status: 200,
      }),
    ],
    [
      "a state the server never sends",
      () => verdicts({ [A]: { reservedUntil: null, state: "AVAILABLE" } }),
    ],
    [
      "a client-only state",
      () => verdicts({ [A]: { reservedUntil: null, state: "checking" } }),
    ],
    ["an answer that leaves the card out", () => verdicts({})],
  ])(
    "turns %s into checking for a card with no trusted verdict",
    async (_label, response) => {
      session.current = SIGNED_OUT;
      await renderCards([A]);
      expect(stateOf(A)).toBe("available");

      await advance(250);
      await respond(requests[0], response());
      expect(stateOf(A)).toBe("checking");
    },
  );

  it("turns a request that throws into checking too", async () => {
    session.current = SIGNED_OUT;
    await renderCards([A]);
    await advance(250);
    await failRequest(requests[0], new TypeError("Failed to fetch"));
    expect(stateOf(A)).toBe("checking");
  });

  it("keeps a trusted verdict through every later malformed or failed answer", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: heldByOther }));
    expect(stateOf(A)).toBe("reserved_by_other");

    const laterAnswers = [
      verdicts({ [A]: { reservedUntil: null, state: "available!" } }),
      verdicts({ [A]: null }),
      verdicts({}),
      httpError(500),
      { json: async () => ({ products: null }), ok: true, status: 200 },
    ];
    for (const [index, answer] of laterAnswers.entries()) {
      // Long enough for any back-off step; a held request blocks the next.
      await advance(80_000);
      expect(requests).toHaveLength(index + 2);
      await respond(requests[index + 1], answer);
      expect(stateOf(A)).toBe("reserved_by_other");
    }
  });
});

describe("mutation announcements", () => {
  it("never lets a poll that left before an announcement overwrite it", async () => {
    await renderCards([A, B]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: inMyCart, [B]: available }));
    expect(stateOf(A)).toBe("in_my_cart");

    await advance(10_000);
    const leftBeforeRemoval = requests[1];
    await act(async () => {
      announceViewerState({
        productId: A,
        reservedUntil: null,
        state: "available",
        viewerKey: "user:user-a",
      });
    });
    expect(stateOf(A)).toBe("available");

    // The older poll lands carrying the pre-removal verdict.
    await respond(
      leftBeforeRemoval,
      verdicts({ [A]: inMyCart, [B]: heldByOther }),
    );
    expect(stateOf(A)).toBe("available");
    // The rest of that answer is still news.
    expect(stateOf(B)).toBe("reserved_by_other");

    // A poll that leaves after the announcement is trusted again.
    await advance(10_000);
    await respond(requests[2], verdicts({ [A]: heldByOther, [B]: heldByOther }));
    expect(stateOf(A)).toBe("reserved_by_other");
  });

  it("ignores an announcement proved for another account, or one with no valid state", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: inMyCart }));

    await act(async () => {
      announceViewerState({
        productId: A,
        reservedUntil: null,
        state: "available",
        viewerKey: "user:user-b",
      });
      window.dispatchEvent(
        new CustomEvent("ftt:viewer-state", {
          detail: {
            productId: A,
            reservedUntil: null,
            state: "AVAILABLE",
            viewerKey: "user:user-a",
          },
        }),
      );
    });
    expect(stateOf(A)).toBe("in_my_cart");
  });

  it("never lets a stamped verdict that left before a newer announcement overwrite it", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: inMyCart }));

    // A checkout preflight notes the counter as its request leaves...
    const preflightLeftAt = readViewerStateSequence();
    // ...the shopper takes the saree out while it travels...
    await act(async () => {
      announceViewerState({
        productId: A,
        reservedUntil: null,
        state: "available",
        viewerKey: "user:user-a",
      });
    });
    expect(stateOf(A)).toBe("available");

    // ...and it lands still carrying the hold the removal gave up.
    await act(async () => {
      announceViewerState({
        productId: A,
        reservedUntil: HOLD_UNTIL,
        sentAtSequence: preflightLeftAt,
        state: "in_my_cart",
        viewerKey: "user:user-a",
      });
    });
    expect(stateOf(A)).toBe("available");

    // A preflight that left after the removal is news.
    const laterLeftAt = readViewerStateSequence();
    await act(async () => {
      announceViewerState({
        productId: A,
        reservedUntil: HOLD_UNTIL,
        sentAtSequence: laterLeftAt,
        state: "reserved_by_other",
        viewerKey: "user:user-a",
      });
    });
    expect(stateOf(A)).toBe("reserved_by_other");
  });
});

describe("another tab's change to the bag", () => {
  const ringTabBell = async (key: string, newValue: null | string) => {
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
      await settleMicrotasks();
    });
  };

  it("asks at once when another tab rings the bag bell, and for no other storage write", async () => {
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: inMyCart }));

    await ringTabBell("ftt-wishlist", "1:1");
    await ringTabBell(CART_TAB_SYNC_KEY, "not-a-signal");
    await ringTabBell(CART_TAB_SYNC_KEY, null);
    expect(requests).toHaveLength(1);

    await ringTabBell(CART_TAB_SYNC_KEY, "1757570000000:1");
    expect(requests).toHaveLength(2);

    // Rung twice more while that request travels, it queues one follow-up.
    await ringTabBell(CART_TAB_SYNC_KEY, "1757570000000:2");
    await ringTabBell(CART_TAB_SYNC_KEY, "1757570000000:3");
    expect(requests).toHaveLength(2);
    await respond(requests[1], verdicts({ [A]: available }));
    expect(requests).toHaveLength(3);
    await respond(requests[2], verdicts({ [A]: available }));
    expect(requests).toHaveLength(3);
    expect(stateOf(A)).toBe("available");
  });

  it("leaves a signed-out tab on its cadence, since it has no bag to change", async () => {
    session.current = SIGNED_OUT;
    await renderCards([A]);
    await advance(250);
    await respond(requests[0], verdicts({ [A]: available }));

    await ringTabBell(CART_TAB_SYNC_KEY, "1757570000000:1");
    expect(requests).toHaveLength(1);
    await advance(10_000);
    expect(requests).toHaveLength(2);
  });
});
