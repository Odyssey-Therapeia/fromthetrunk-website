"use client";

/**
 * Keeps the client bag a mirror of the account's bag.
 *
 * The bag itself lives on the server, but the drawer, the header count, the
 * add-to-bag animation and the trash control all read the client store. Rather
 * than rewrite those surfaces, this pulls the server's copy into the store —
 * so a bag survives a refresh and follows the shopper to another device, and
 * none of the existing UI had to change at all.
 *
 * Membership comes from the server and only from the server. The local rows
 * may colour in a name or a thumbnail, but a line the account does not have is
 * not in the bag, however long it has been sitting in localStorage.
 *
 * Signed out there is no bag to draw. Leaving the persisted store alone looked
 * harmless and was not: a bag survived a sign-out, so the drawer counted down a
 * reservation nobody was holding, the header showed a badge, and checkout
 * offered to sell pieces the session had no claim to. The account's rows are
 * safe on the server and come back at sign-in; what goes is the picture of them.
 */

import { useEffect, useRef } from "react";
import {
  useQueryClient,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";

import { clearCheckoutAttempt } from "@/lib/checkout/checkout-attempt";
import { forgetIntent } from "@/lib/commerce/auth-intent";
import {
  serverCartKey,
  useServerCart,
  type ServerCartItem,
} from "@/lib/commerce/use-server-cart";
import { useCartStore, type CartItem } from "@/lib/store/cart-store";

type ServerCartLine = ServerCartItem & {
  detailsFabric?: null | string;
  imageAlt?: null | string;
  imageUrl?: null | string;
  name?: string;
  originalPricePaise?: null | number;
  pricePaise?: number;
  slug?: string;
};

/*
 * Every query root that holds one account's private answers, and where in its
 * key that account sits. A root missing here is a cache the next shopper in
 * this tab can read.
 */
const ACCOUNT_QUERY_OWNER_INDEX = new Map<string, number>([
  ["addresses", 1],
  ["order", 1],
  ["orders", 1],
  ["profile", 1],
  ["server-cart", 1],
  ["wishlist", 2],
]);

const belongsToAnotherAccount = (
  query: Query,
  nextUserId: null | string,
): boolean => {
  const [root] = query.queryKey;
  const ownerIndex =
    typeof root === "string" ? ACCOUNT_QUERY_OWNER_INDEX.get(root) : undefined;
  if (ownerIndex === undefined) return false;
  return nextUserId === null || query.queryKey[ownerIndex] !== nextUserId;
};

/*
 * Account caches, the commerce click waiting to replay, and the checkout
 * attempt id. The intent and the attempt carry no account of their own, so
 * leaving them meant the next account in this tab could replay the previous
 * shopper's click or resume their payment attempt. Queries already keyed to
 * `nextUserId` stay, so a fresh sign-in's first fetches are not thrown away.
 */
function forgetOtherAccounts(
  queryClient: QueryClient,
  nextUserId: null | string,
): void {
  const filters = {
    predicate: (query: Query) => belongsToAnotherAccount(query, nextUserId),
  };
  void queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
  forgetIntent();
  clearCheckoutAttempt();
}

/**
 * Everything this tab drew for a signed-in account, cleared at sign-out.
 *
 * The rows stay in PostgreSQL and come back when the same account signs in
 * again. Called straight after signOut so the old account is gone before the
 * redirect paints, not only once the session change reaches CartServerSync —
 * which then runs the same clearing again, harmlessly.
 */
export function clearAccountClientState(queryClient: QueryClient): void {
  useCartStore.setState({
    hasHydrated: false,
    items: [],
    presentationUserId: null,
    releasingIds: [],
  });
  forgetOtherAccounts(queryClient, null);
}

/*
 * Merged onto the server's row, never the other way round.
 *
 * The server answers with the thumbnail now, but a line added on this device a
 * moment ago already has one, and preferring what is on screen avoids a flash
 * of empty box while the account's copy arrives. `||` rather than `??` on the
 * image: the server sends an empty string for a product with no media, and an
 * empty string must fall through to the local one, not win over it.
 */
const toCartItem = (line: ServerCartLine, existing?: CartItem): CartItem => ({
  addedAt: line.addedAt,
  detailsFabric: line.detailsFabric ?? existing?.detailsFabric ?? null,
  expiresAt: line.reservedUntil ?? undefined,
  id: line.productId,
  image: line.imageUrl || existing?.image || "",
  name: line.name || existing?.name || "",
  originalPricePaise: line.originalPricePaise ?? existing?.originalPricePaise ?? null,
  // The drawer draws rupees; the server speaks paise.
  price: line.pricePaise != null ? line.pricePaise / 100 : (existing?.price ?? 0),
  quantity: 1,
  reservedUntil: line.reservedUntil,
  selectedOptions:
    (line.selectedOptions as CartItem["selectedOptions"]) ??
    existing?.selectedOptions,
  slug: line.slug || existing?.slug,
  status: line.status,
  // Never borrowed from the local row: a verdict is the server's or nothing.
  viewerState: line.viewerState,
});

/**
 * The server's bag, drawn with whatever the local cache can add to it.
 *
 * Exported for the regression tests: a local row the server did not return is
 * dropped, never unioned in. Unioning is what let a deleted saree survive its
 * own removal — the DELETE succeeded, the server stopped returning the row,
 * and the local copy quietly put it back.
 */
export function mergeServerBag(
  serverItems: ServerCartLine[],
  localItems: CartItem[],
): CartItem[] {
  const localById = new Map(localItems.map((item) => [item.id, item]));
  return serverItems.map((line) =>
    toCartItem(line, localById.get(line.productId)),
  );
}

export function CartServerSync() {
  const { hasSnapshot, isAuthenticated, isLoading, items, userId } =
    useServerCart();
  const setHasHydrated = useCartStore((state) => state.setHasHydrated);
  const queryClient = useQueryClient();
  const previousUserId = useRef<null | string | undefined>(undefined);

  useEffect(() => {
    const nextUserId = isAuthenticated ? userId : null;
    const previous = previousUserId.current;

    if (previous !== nextUserId) {
      useCartStore.setState({
        hasHydrated: false,
        items: [],
        presentationUserId: nextUserId,
        releasingIds: [],
      });
      previousUserId.current = nextUserId;

      // Only a real previous account has anything to forget. Coming from
      // signed out, the pending click is this shopper's own and must survive
      // the sign-in it asked for.
      if (previous) {
        const previousKey = serverCartKey(previous);
        void queryClient.cancelQueries({ exact: true, queryKey: previousKey });
        queryClient.removeQueries({ exact: true, queryKey: previousKey });
        forgetOtherAccounts(queryClient, nextUserId);
      }
    }

    // Never turn a failed or still-loading GET into an authoritative empty bag.
    if (isLoading) return;

    const store = useCartStore.getState();
    if (!isAuthenticated) {
      store.replaceItems([]);
      setHasHydrated(true);
      // Clear any pre-cutover browser-owned rows. Version 4 persists no items.
      void useCartStore.persist.clearStorage();
      return;
    }

    if (!hasSnapshot) {
      setHasHydrated(false);
      return;
    }

    // Written imperatively: this is a store mirror, not React state, and the
    // store's own equality check keeps a no-op poll from re-rendering anything.
    const next = mergeServerBag(items as ServerCartLine[], store.items);
    store.replaceItems(next);
    setHasHydrated(true);
  }, [
    hasSnapshot,
    isAuthenticated,
    isLoading,
    items,
    queryClient,
    setHasHydrated,
    userId,
  ]);

  return null;
}
