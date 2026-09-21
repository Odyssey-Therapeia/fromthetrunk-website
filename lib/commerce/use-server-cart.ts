"use client";

/**
 * The signed-in shopper's bag, held on the server.
 *
 * localStorage is no longer where ownership lives. It could not answer "is
 * this saree in MY bag or someone else's?" for the server, it vanished when a
 * shopper cleared their browser, and it could not follow them to a second
 * device. The rows now hang off the account, so a refresh, a new tab and a
 * different browser all show the same bag.
 *
 * There is no guest bag. Signed out, this hook holds nothing, asks for
 * nothing, and answers every mutation with a refusal — the popup is what a
 * signed-out click is supposed to produce.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useCartStore } from "@/lib/store/cart-store";
import { announceCartChangedAcrossTabs } from "@/lib/commerce/cart-tab-bus";
import {
  announceViewerState,
  commerceViewerKey,
} from "@/lib/commerce/viewer-state-bus";
import {
  readViewerProductState,
  type ViewerProductState,
} from "@/lib/commerce/viewer-state";

export type ServerCartItem = {
  addedAt: string;
  detailsFabric?: null | string;
  imageAlt?: null | string;
  imageUrl?: null | string;
  name?: string;
  originalPricePaise?: null | number;
  pricePaise?: number;
  productId: string;
  reservedUntil: null | string;
  selectedOptions: Record<string, unknown> | null;
  slug?: string;
  status: string;
  /**
   * The same server verdict the cards read for this product. The drawer and
   * checkout decide trash from this, never from the row's own status.
   */
  viewerState?: ViewerProductState;
};

export type BagMutationResult = {
  ok: boolean;
  /** Short code when the server refused, for the caller's own messaging. */
  code?: string;
  /** The server's own words for the refusal, when it gave any. */
  reason?: string;
  /** Canonical display row returned by the authenticated cart command. */
  item?: ServerCartItem;
  /** The server's verdict, present only when it sent a valid one. */
  viewerState?: ViewerProductState;
};

/**
 * Keyed by account.
 *
 * An unkeyed cache is one shopper's bag shown to the next: sign out of A, into
 * B, and B reads A's rows out of the cache until the refetch lands.
 */
export const serverCartKey = (userId: null | string) =>
  ["server-cart", userId ?? "anonymous"] as const;

/** A line keeps its verdict only when it is one the server can actually send. */
const withTrustedViewerState = (item: ServerCartItem): ServerCartItem => {
  if (!item || typeof item !== "object") return item;
  const { viewerState, ...line } = item;
  const trusted = readViewerProductState(viewerState);
  return trusted ? { ...line, viewerState: trusted } : line;
};

const fetchServerCart = async (): Promise<ServerCartItem[]> => {
  const response = await fetch("/api/v2/cart/items", {
    // The bag is per-account and changes under the shopper. Nothing between
    // here and the database may answer this from a store.
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Unable to load the server cart (${response.status}).`);
  }

  const payload = (await response.json().catch(() => null)) as {
    items?: ServerCartItem[];
  } | null;
  if (!Array.isArray(payload?.items)) {
    throw new Error("The server cart response was incomplete.");
  }
  return payload.items.map(withTrustedViewerState);
};

const readServerCartItem = (value: unknown): ServerCartItem | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ServerCartItem>;
  if (
    typeof item.addedAt !== "string" ||
    typeof item.productId !== "string" ||
    typeof item.status !== "string" ||
    !(
      item.reservedUntil === null ||
      typeof item.reservedUntil === "string"
    ) ||
    !(
      item.selectedOptions === null ||
      (typeof item.selectedOptions === "object" && item.selectedOptions != null)
    )
  ) {
    return undefined;
  }
  return withTrustedViewerState(item as ServerCartItem);
};

export function useServerCart() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  /*
   * "Authenticated" is the session's own word for it, not the presence of an
   * id on a possibly-half-loaded object. Everything commerce does hangs off
   * this one answer, so it may not be approximated.
   */
  const isAuthenticated = status === "authenticated" && Boolean(userId);
  const viewerKey = commerceViewerKey(status, userId);
  const queryClient = useQueryClient();
  const cartKey = serverCartKey(userId);

  // Release state is presentation-only, but it must be shared by every hook
  // instance so a drawer removal also disables the matching product card.
  const releasingIds = useCartStore((state) => state.releasingIds);
  const presentationItems = useCartStore((state) => state.items);
  const presentationHasHydrated = useCartStore((state) => state.hasHydrated);
  const presentationUserId = useCartStore(
    (state) => state.presentationUserId,
  );
  const setReleasing = useCartStore((state) => state.setReleasing);
  const presentationMatchesViewer =
    presentationUserId === (isAuthenticated ? userId : null);

  const { data: items, isPending, isError } = useQuery({
    queryKey: cartKey,
    queryFn: fetchServerCart,
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 15_000,
  });

  /*
   * Re-reads the account's bag, and nothing more. Opening the drawer, a hold
   * running out and a return to the tab land here: none of them changed the
   * bag, so the cards keep their ten-second cadence and its back-off instead
   * of asking again on top of it.
   */
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: serverCartKey(userId) });
  }, [queryClient, userId]);

  /*
   * After a change to the bag: an add or a removal the server accepted, or a
   * checkout outcome that settled lines. The verdict every card renders
   * depends on who holds what, so the cards re-ask first: holding their
   * request behind the bag's own refetch only delayed the one answer the
   * shopper is looking at.
   */
  const refreshAfterBagChange = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ftt:cart-updated"));
    }
    await refresh();
  }, [refresh]);

  const addMutation = useMutation({
    mutationFn: async (input: {
      productId: string;
      selectedOptions?: Record<string, unknown>;
    }): Promise<BagMutationResult> => {
      if (!isAuthenticated) {
        return { code: "UNAUTHENTICATED", ok: false };
      }

      const response = await fetch("/api/v2/cart/items", {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        item?: unknown;
        reservedUntil?: unknown;
        viewerState?: unknown;
      } | null;
      const viewerState = readViewerProductState(payload?.viewerState);
      const returnedItem = readServerCartItem(payload?.item);
      // The POST's verdict is this line's verdict; the drawer should not wait
      // for the bag refetch to learn whether it may offer trash.
      const confirmedItem =
        returnedItem && viewerState && !returnedItem.viewerState
          ? { ...returnedItem, viewerState }
          : returnedItem;
      const payloadReservedUntil =
        typeof payload?.reservedUntil === "string" ? payload.reservedUntil : null;

      // This request was authenticated as the account captured above. If the
      // global presentation has already switched accounts, the server result
      // still belongs to the old account and must not animate or paint into
      // the new one.
      if (useCartStore.getState().presentationUserId !== userId) {
        return { code: "VIEWER_CHANGED", ok: false };
      }

      if (response.ok) {
        /*
         * The card is told now, not at the next poll. Waiting for the tick is
         * what left a just-added saree still offering "+ Cart" on the grid
         * behind the drawer.
         */
        announceViewerState({
          productId: input.productId,
          reservedUntil: confirmedItem?.reservedUntil ?? payloadReservedUntil,
          // A successful add with a malformed verdict may still animate, but
          // must not leave the old "available" button active behind it.
          state: viewerState ?? "checking",
          viewerKey,
        });

        if (confirmedItem) {
          // Upsert only into an already-authoritative snapshot. A one-row POST
          // response is not proof that the rest of a still-loading bag is
          // empty, but it can update a snapshot we already hold immediately.
          queryClient.setQueryData<ServerCartItem[]>(cartKey, (current) => {
            if (!current) return current;
            const index = current.findIndex(
              (item) => item.productId === confirmedItem.productId,
            );
            if (index < 0) return [...current, confirmedItem];
            return current.map((item, itemIndex) =>
              itemIndex === index ? confirmedItem : item,
            );
          });
        }
      } else if (viewerState) {
        // A refusal that names the verdict — sold, or another shopper's hold —
        // is the answer the next poll would bring, so every surface takes it
        // now. A refusal without one leaves the last trusted verdict alone.
        announceViewerState({
          productId: input.productId,
          reservedUntil: payloadReservedUntil,
          state: viewerState,
          viewerKey,
        });
      }

      return {
        code: payload?.code,
        ...(confirmedItem ? { item: confirmedItem } : {}),
        ok: response.ok,
        ...(viewerState ? { viewerState } : {}),
      };
    },
    // The mutation resolves as soon as the authoritative POST does, so the
    // existing motion can begin immediately. Revalidation still runs, but it
    // is background confirmation rather than part of the animation's latency.
    onSettled: (result) => {
      // Only an add the server accepted changed the bag. A refusal already
      // announced any verdict it named, and a click that never reached the
      // server, or reached it for an account since gone, changed nothing here.
      void (result?.ok ? refreshAfterBagChange() : refresh());
    },
    onSuccess: (result) => {
      if (result.ok) announceCartChangedAcrossTabs(userId);
    },
  });

  const removeFromBag = useCallback(
    async (productId: string): Promise<BagMutationResult> => {
      /*
       * There is no guest bag to delete from. Answering honestly here is what
       * keeps a signed-out click from reporting a removal it never made — and
       * with no request made, there is no verdict to report either.
       */
      if (!isAuthenticated) {
        return { code: "UNAUTHENTICATED", ok: false };
      }

      if (useCartStore.getState().isReleasing(productId)) {
        return { code: "RELEASE_IN_PROGRESS", ok: false };
      }
      setReleasing(productId, true);

      try {
        const response = await fetch(
          `/api/v2/cart/items/${encodeURIComponent(productId)}`,
          { cache: "no-store", method: "DELETE" },
        );
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          reason?: string;
          removed?: boolean;
          viewerState?: unknown;
        } | null;
        const viewerState =
          readViewerProductState(payload?.viewerState) ?? undefined;

        if (useCartStore.getState().presentationUserId !== userId) {
          return { code: "VIEWER_CHANGED", ok: false };
        }

        /*
         * A refusal keeps the row, but when it names the verdict — a payment
         * in progress, a piece already sold — every surface takes it now, so
         * the card stops offering trash in the same moment the drawer does.
         */
        const refuse = (): BagMutationResult => {
          if (viewerState) {
            announceViewerState({
              productId,
              reservedUntil: null,
              state: viewerState,
              viewerKey,
            });
          }
          return {
            code: payload?.code,
            ok: false,
            reason: payload?.reason,
            ...(viewerState ? { viewerState } : {}),
          };
        };

        /*
         * A network or server failure keeps the row. Dropping it locally would
         * strand a live hold with nobody left able to release it, and the
         * saree would sit unbuyable for the rest of its window.
         */
        if (!response.ok) {
          const refusal = refuse();
          // A rejected command can still tell us our local snapshot was
          // stale (for example, another tab already removed the row). Pull
          // the account's canonical bag before returning while still keeping
          // the row whenever the server says it remains owned. A refusal
          // removed nothing, and any verdict it named is already announced,
          // so the cards keep their cadence.
          await refresh();
          return refusal;
        }

        /*
         * A 200 is not automatically a removal. The server answers 200 with
         * removed:false when a payment is open against the saree — reading the
         * status code alone told the shopper their piece was gone while the
         * server still held it and a live payment link was outstanding.
         */
        if (payload?.removed !== true) {
          const refusal = refuse();
          await refresh();
          return refusal;
        }

        /*
         * Everything that draws this saree is corrected in this one commit —
         * the account's bag, the row the drawer draws, the header count that
         * derives from it, and the verdict every card reads. A surface left to
         * find out from the next poll is a surface that disagrees with the one
         * beside it, which is how an emptied drawer ended up sitting behind a
         * card still reading "In bag".
         */
        queryClient.setQueryData<ServerCartItem[]>(
          serverCartKey(userId),
          (current) =>
            current?.filter((item) => item.productId !== productId),
        );
        /*
         * The server's own verdict, verbatim.
         *
         * Collapsing everything that was not "sold" into "available" assumed a
         * removal always frees the saree. It does not: the row can go while
         * the hold stays — a release that missed, or a line that never owned
         * the hold in the first place — and the honest answer there is
         * "reserved_by_other". Announcing "available" flipped the card to
         * "+ Cart" over a piece the database still held, and the next click
         * came back as another shopper's claim on the shopper's own saree.
         */
        announceViewerState({
          productId,
          reservedUntil: null,
          // DELETE proved the row is gone, not what the product now offers.
          // If its verdict is malformed, wait safely for the batch refresh.
          state: viewerState ?? "checking",
          viewerKey,
        });
        announceCartChangedAcrossTabs(userId);

        // Confirm against the server after the optimistic correction, never
        // instead of it.
        await refreshAfterBagChange();
        return { ok: true, ...(viewerState ? { viewerState } : {}) };
      } catch {
        return { code: "NETWORK", ok: false };
      } finally {
        // An old account's completion must not clear a new account's release
        // spinner for the same one-of-one product.
        if (useCartStore.getState().presentationUserId === userId) {
          setReleasing(productId, false);
        }
      }
    },
    [
      isAuthenticated,
      queryClient,
      refresh,
      refreshAfterBagChange,
      setReleasing,
      userId,
      viewerKey,
    ],
  );

  const bagProductIds = new Set((items ?? []).map((item) => item.productId));

  return {
    addToBag: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isAuthenticated,
    hasSnapshot: !isAuthenticated || items !== undefined,
    isError,
    isLoading: status === "loading" || (isAuthenticated && isPending),
    isReleasing: (productId: string) => releasingIds.includes(productId),
    items: isAuthenticated ? (items ?? []) : [],
    hasItem: (productId: string) => isAuthenticated && bagProductIds.has(productId),
    // Rendered cart surfaces use this gated mirror. Effects clear an old
    // account immediately afterwards, but the render-time identity check is
    // what prevents even one frame of shopper A appearing for shopper B.
    presentedItems: presentationMatchesViewer ? presentationItems : [],
    presentationHasHydrated:
      presentationMatchesViewer && presentationHasHydrated,
    refresh,
    /** For a change to the bag made outside this hook, such as a paid order. */
    refreshAfterBagChange,
    removeFromBag,
    /** The account this bag belongs to, for callers that key their own state. */
    userId,
  };
}
