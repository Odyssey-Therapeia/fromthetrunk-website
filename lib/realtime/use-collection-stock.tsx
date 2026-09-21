"use client";

/**
 * One live stock source for a grid of product cards.
 *
 * Cards previously ran `useLiveProductStock({ enabled: false })`, so a
 * collection page never saw a reservation change: a saree another shopper had
 * just claimed still offered "Add to bag". Turning that flag on per card would
 * have opened one subscription per card instead.
 *
 * This registers the ids currently on screen and polls one batched endpoint
 * for them every ten seconds — one request per cycle, only while the tab is
 * visible and online, never with two requests on the wire, and immediately
 * after a change to the bag in this tab or another, so the shopper's own
 * actions never wait for a tick. A plain re-read of the bag is not a change
 * and waits its turn.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import { CART_TAB_SYNC_KEY, isCartTabSignal } from "@/lib/commerce/cart-tab-bus";
import {
  advanceViewerStateSequence,
  commerceViewerKey,
  readViewerStateSequence,
  subscribeToViewerState,
} from "@/lib/commerce/viewer-state-bus";
import {
  MAX_VIEWER_STATE_IDS,
  readViewerProductState,
  type ViewerProductDisplayState,
} from "@/lib/commerce/viewer-state";

export type CollectionStockEntry = {
  reservedUntil: null | string;
  state: ViewerProductDisplayState;
};

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_BACKOFF_MS = 80_000;
/** Long enough for a whole grid to mount, short enough to feel immediate. */
const REGISTRATION_SETTLE_MS = 250;
/**
 * The route's own id rule. A single id it rejects fails validation for the
 * whole batch, which used to stop every card on the page from updating.
 */
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHECKING_ENTRY: CollectionStockEntry = {
  reservedUntil: null,
  state: "checking",
};

type CollectionStockValue = {
  register: (productId: string) => () => void;
  stockById: Map<string, CollectionStockEntry>;
  viewerKey: string;
};

type VerdictMap = Record<string, unknown>;

/**
 * How one polling cycle ended. Only "transport-failure" slows the cadence;
 * "aborted" and "stale" belong to a cycle something newer has replaced.
 */
type RefreshOutcome = "aborted" | "ok" | "stale" | "transport-failure";

const CollectionStockContext = createContext<CollectionStockValue | null>(null);
const EMPTY_COLLECTION_STOCK = new Map<string, CollectionStockEntry>();

/** The normal cadence doubles after each failure, then stays bounded. */
export const collectionStockPollDelay = (failureCount: number): number =>
  Math.min(
    POLL_INTERVAL_MS * 2 ** Math.min(Math.max(0, failureCount), 3),
    MAX_POLL_BACKOFF_MS,
  );

/**
 * The cycle's verdict map, or null for a transport failure: a request that
 * threw, a non-2xx answer, or a body with no products map in it.
 */
async function requestVerdicts(
  ids: string[],
  signal: AbortSignal,
): Promise<VerdictMap | null> {
  try {
    /*
     * The server decides. It holds both the product's hold and this shopper's
     * own bag row, so the browser never infers ownership — which is what let a
     * card's badge and its button disagree about the same saree.
     */
    const response = await fetch("/api/v2/products/viewer-state", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productIds: ids }),
      signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { products?: unknown } | null;
    const verdicts = payload?.products;
    return verdicts != null &&
      typeof verdicts === "object" &&
      !Array.isArray(verdicts)
      ? (verdicts as VerdictMap)
      : null;
  } catch {
    return null;
  }
}

/**
 * The map after one answer, or the same map when nothing moved, so a quiet
 * poll re-renders no card.
 *
 * `verdicts` is null when the request failed. A failed request, and a missing
 * or malformed entry in a good one, leave every trusted verdict alone and
 * turn only ids with no entry at all into "checking".
 */
function applyVerdicts(
  current: Map<string, CollectionStockEntry>,
  productIds: string[],
  verdicts: VerdictMap | null,
  skippedIds: Set<string>,
): Map<string, CollectionStockEntry> {
  let next: Map<string, CollectionStockEntry> | null = null;
  const write = (productId: string, entry: CollectionStockEntry) => {
    const existing = (next ?? current).get(productId);
    if (
      existing?.state === entry.state &&
      existing.reservedUntil === entry.reservedUntil
    ) {
      return;
    }
    next ??= new Map(current);
    next.set(productId, entry);
  };

  for (const productId of productIds) {
    if (skippedIds.has(productId)) continue;
    const verdict = verdicts?.[productId] as
      | { reservedUntil?: unknown; state?: unknown }
      | null
      | undefined;
    const state = readViewerProductState(verdict?.state);

    if (!state) {
      // Never replace a verdict that was previously parsed and trusted.
      // With no trusted verdict, "checking" is deliberately non-buyable.
      if (!(next ?? current).has(productId)) write(productId, CHECKING_ENTRY);
      continue;
    }

    write(productId, {
      reservedUntil:
        typeof verdict?.reservedUntil === "string" ? verdict.reservedUntil : null,
      state,
    });
  }

  return next ?? current;
}

export function CollectionStockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const viewerKey = commerceViewerKey(
    sessionStatus,
    session?.user?.id ?? null,
  );
  const viewerKeyRef = useRef(viewerKey);
  const [stockSnapshot, setStockSnapshot] = useState<{
    stockById: Map<string, CollectionStockEntry>;
    viewerKey: string;
  }>(() => ({ stockById: new Map(), viewerKey }));
  // The old snapshot is never rendered for a new viewer, even before effects
  // run. This avoids the one-frame account-A "In bag" leak without a
  // synchronous setState in an identity-change effect.
  const stockById =
    stockSnapshot.viewerKey === viewerKey
      ? stockSnapshot.stockById
      : EMPTY_COLLECTION_STOCK;

  useEffect(() => {
    viewerKeyRef.current = viewerKey;
  }, [viewerKey]);
  // Ref-counted, because the same saree can appear in a grid and a rail at once
  // and one unmounting must not silence the other.
  const subscriberCounts = useRef(new Map<string, number>());
  const settleTimer = useRef<null | number>(null);
  /*
   * Back-off belongs to the provider, not to one run of the polling effect.
   * That effect restarts whenever a card mounts or unmounts, and a count that
   * restarted with it meant a failing server never saw a slower cadence.
   */
  const failureCountRef = useRef(0);
  /*
   * When a failing server may be asked again. A wake — focus, visibility,
   * coming back online — waits for it just as the timer does.
   */
  const retryAtRef = useRef(0);
  /*
   * When each product last heard an announcement, stamped on the page's one
   * forward-only counter. A request notes the counter as it leaves; its
   * answer may not overwrite a verdict announced after that. Without this, a
   * poll sent just before a removal committed landed after the removal's
   * announcement and put "In bag" back over an emptied drawer. A checkout
   * preflight's stamped verdict is held to the same rule.
   */
  const announcedAtRef = useRef(new Map<string, number>());

  /*
   * The tracked set is held as a sorted string, not an array.
   *
   * A grid mounts fifty cards in one pass. Storing an array meant fifty new
   * identities, fifty effect re-runs and fifty full-catalogue requests before
   * the page had finished painting — enough to make the database retry. A
   * string changes only when the membership genuinely changes, and the settle
   * delay folds a whole grid's registrations into one.
   */
  const [idsKey, setIdsKey] = useState("");

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      setIdsKey([...subscriberCounts.current.keys()].sort().join(","));
    }, REGISTRATION_SETTLE_MS);
  }, []);

  const register = useCallback(
    (productId: string) => {
      const counts = subscriberCounts.current;
      counts.set(productId, (counts.get(productId) ?? 0) + 1);
      scheduleSettle();

      return () => {
        const remaining = (counts.get(productId) ?? 1) - 1;
        if (remaining <= 0) counts.delete(productId);
        else counts.set(productId, remaining);
        scheduleSettle();
      };
    },
    [scheduleSettle],
  );

  useEffect(
    () => () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  /*
   * One polling cycle: exactly one request, for as many tracked ids as the
   * route accepts. A grid larger than that is not chunked into a second
   * request; the ids past the cap wait as "checking" instead.
   */
  const refresh = useCallback(
    async (ids: string[], signal: AbortSignal): Promise<RefreshOutcome> => {
      const requestViewerKey = viewerKey;
      const validIds = ids.filter((id) => PRODUCT_ID_PATTERN.test(id));
      const requestedIds = validIds.slice(0, MAX_VIEWER_STATE_IDS);
      // An id the route would reject, or one past the cap, can never be
      // confirmed by this cycle, so it waits as "checking" rather than keeping
      // a seed nobody can verify. A verdict it already has is left alone.
      const unverifiableIds = [
        ...ids.filter((id) => !PRODUCT_ID_PATTERN.test(id)),
        ...validIds.slice(MAX_VIEWER_STATE_IDS),
      ];

      const commit = (verdicts: VerdictMap | null, sentAtSequence: number) => {
        const announcedAt = announcedAtRef.current;
        const skippedIds = new Set(
          ids.filter(
            (productId) => (announcedAt.get(productId) ?? 0) > sentAtSequence,
          ),
        );
        setStockSnapshot((current) => {
          const base =
            current.viewerKey === requestViewerKey
              ? current.stockById
              : EMPTY_COLLECTION_STOCK;
          // Unrequested ids never read the answer, even if it names them.
          const next = applyVerdicts(
            applyVerdicts(base, unverifiableIds, null, skippedIds),
            requestedIds,
            verdicts,
            skippedIds,
          );
          return next === current.stockById
            ? current
            : { stockById: next, viewerKey: requestViewerKey };
        });
      };

      if (requestedIds.length === 0) {
        commit(null, readViewerStateSequence());
        return "ok";
      }

      const sentAtSequence = readViewerStateSequence();
      const verdicts = await requestVerdicts(requestedIds, signal);

      if (signal.aborted) return "aborted";
      if (viewerKeyRef.current !== requestViewerKey) return "stale";

      // A failed request leaves every id this cycle asked about unconfirmed.
      commit(verdicts, sentAtSequence);
      return verdicts ? "ok" : "transport-failure";
    },
    [viewerKey],
  );

  /*
   * A verdict the shopper's own mutation just proved, applied without waiting
   * for a round trip. The poll still corrects everything else; this only
   * short-circuits the one card the shopper is looking at, which is the card
   * that used to sit there reading "In bag" over an empty drawer.
   */
  useEffect(
    () =>
      subscribeToViewerState((announcement) => {
        if (announcement.viewerKey !== viewerKey) return;
        const { productId, reservedUntil, sentAtSequence, state } = announcement;
        const announcedAt = announcedAtRef.current;
        // A stamped verdict that left before this saree's newest announcement
        // is older news: a slow checkout preflight must not put back the
        // "In bag" a removal has just taken away.
        if (
          sentAtSequence != null &&
          (announcedAt.get(productId) ?? 0) > sentAtSequence
        ) {
          return;
        }
        announcedAt.set(productId, advanceViewerStateSequence());
        setStockSnapshot((current) => {
          const currentStock =
            current.viewerKey === viewerKey
              ? current.stockById
              : EMPTY_COLLECTION_STOCK;
          const existing = currentStock.get(productId);
          if (existing?.state === state && existing.reservedUntil === reservedUntil) {
            return current;
          }
          const next = new Map(currentStock);
          next.set(productId, { reservedUntil, state });
          return { stockById: next, viewerKey };
        });
      }),
    [viewerKey],
  );

  useEffect(() => {
    if (idsKey.length === 0 || sessionStatus === "loading") return;

    const trackedIds = idsKey.split(",");
    let cancelled = false;
    let timer: null | number = null;
    /** The cycle on the wire. There is never more than one. */
    let inFlight: AbortController | null = null;
    /*
     * A mutation that lands mid-request is remembered, not thrown away.
     *
     * Dropping it is what left a card reading "In bag" after the shopper had
     * just emptied the drawer: the removal's cart-updated event arrived while
     * a poll was still in flight, so the one request that would have corrected
     * the card never ran, and the stale verdict sat there for another interval.
     */
    let pending = false;
    const canPoll = () =>
      document.visibilityState === "visible" && navigator.onLine !== false;
    const clearTimer = () => {
      if (timer == null) return;
      window.clearTimeout(timer);
      timer = null;
    };
    const abortInFlight = () => {
      inFlight?.abort();
      inFlight = null;
      pending = false;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (cancelled || !canPoll()) return;
      timer = window.setTimeout(() => {
        timer = null;
        tick();
      }, delay);
    };
    const tick = () => {
      if (cancelled || inFlight || !canPoll()) return;
      clearTimer();
      const cycle = new AbortController();
      inFlight = cycle;
      void refresh(trackedIds, cycle.signal)
        .catch((): RefreshOutcome =>
          cycle.signal.aborted ? "aborted" : "transport-failure",
        )
        .then((outcome) => {
          if (inFlight === cycle) inFlight = null;
          // An aborted cycle was replaced by whatever aborted it, and that
          // owns the schedule now. It proved nothing about the server.
          if (cancelled || outcome === "aborted") return;
          if (outcome === "ok") {
            failureCountRef.current = 0;
            retryAtRef.current = 0;
          }
          if (outcome === "transport-failure") {
            failureCountRef.current += 1;
            retryAtRef.current =
              Date.now() + collectionStockPollDelay(failureCountRef.current);
          }
          if (pending) {
            pending = false;
            tick();
            return;
          }
          schedule(collectionStockPollDelay(failureCountRef.current));
        });
    };

    /*
     * Only a change to the bag may queue a request behind one in flight, or
     * go ahead of a back-off: the server's answer to it can postdate that
     * request, and the server has just answered the change itself. Focus,
     * visibility and coming back online are already served by the request on
     * the wire, and queueing them made every return to the tab cost two. Nor
     * does a return to the tab ask a failing server early.
     */
    const handleMutation = () => {
      if (inFlight) pending = true;
      else tick();
    };
    const handleWake = () => {
      if (inFlight) return;
      const backedOffMs = retryAtRef.current - Date.now();
      if (backedOffMs > 0) schedule(backedOffMs);
      else tick();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleWake();
      else clearTimer();
    };
    const handleOffline = () => {
      clearTimer();
      // A request that cannot land must not count against the server.
      abortInFlight();
    };
    /*
     * Another tab changed this account's bag. Its bell carries no verdict and
     * no account, so this tab asks for its own verdicts, as it would after a
     * change made here. The bag's re-read no longer rings the cards, so this
     * is what keeps a second tab's grid from waiting on the tick.
     */
    const handleTabSignal = (event: StorageEvent) => {
      if (event.key !== CART_TAB_SYNC_KEY || !isCartTabSignal(event.newValue)) {
        return;
      }
      // Only a signed-in shopper has a bag another tab could have changed.
      if (viewerKeyRef.current.startsWith("user:")) handleMutation();
    };

    tick();
    // A tab that slept through several ticks needs the truth immediately.
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWake);
    window.addEventListener("online", handleWake);
    window.addEventListener("offline", handleOffline);
    // Rung only by a change to the bag, never by a plain re-read of it.
    window.addEventListener("ftt:cart-updated", handleMutation);
    window.addEventListener("storage", handleTabSignal);

    return () => {
      cancelled = true;
      clearTimer();
      // The next set of cards, or the next viewer, starts its own cycle; this
      // one's answer must not land on top of it.
      abortInFlight();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWake);
      window.removeEventListener("online", handleWake);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("ftt:cart-updated", handleMutation);
      window.removeEventListener("storage", handleTabSignal);
    };
  }, [idsKey, refresh, sessionStatus]);

  const value = useMemo(
    () => ({ register, stockById, viewerKey }),
    [register, stockById, viewerKey],
  );

  return (
    <CollectionStockContext.Provider value={value}>
      {children}
    </CollectionStockContext.Provider>
  );
}

/**
 * The server's verdict for one card.
 *
 * With no provider mounted this is the caller's initial value, so a card
 * outside a grid still renders and SSR agrees with the first client paint.
 * Inside a provider, the seed only stands in while nothing better is known
 * for a signed-out visitor. The page's seed was rendered for nobody in
 * particular, so a signed-in shopper waits on "checking" instead — it cannot
 * know whose hold a reserved piece is, and "available" may already be stale.
 * A session still loading may be that same shopper, so it waits on
 * "checking" too, on the server render and the first client paint alike.
 * A sold seed stays sold: waiting never makes a sold piece buyable.
 */
export function useCollectionStock(
  productId: string,
  initial: CollectionStockEntry,
): CollectionStockEntry {
  const context = useContext(CollectionStockContext);
  const register = context?.register;

  useEffect(() => {
    if (!register || !productId) return;
    return register(productId);
  }, [productId, register]);

  const entry = context?.stockById.get(productId);
  if (entry && entry.state !== "checking") return entry;
  if (initial.state === "sold") return initial;
  if (
    entry ||
    context?.viewerKey === "loading" ||
    context?.viewerKey.startsWith("user:")
  ) {
    return CHECKING_ENTRY;
  }
  return initial;
}
