"use client";

/**
 * One wishlist, one backing: the shopper's account.
 *
 * Commerce is authenticated-first, so a shopper is signed in through the
 * shared commerce popup before any save is attempted. Every surface — product
 * card, product page, Drape Room, header — reads and writes through here, so a
 * heart can never disagree with the badge counting it.
 *
 * Nothing in this module opens a dialog. A sign-in dialog raised from inside
 * the Drape Room stacked a second modal over the first and blacked out the
 * screen; sign-in belongs to CommerceAuthProvider alone.
 */

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { dispatchWishlistUpdated } from "@/lib/wishlist/wishlist-events";

export const wishlistIdsKey = (userId: null | string) =>
  ["wishlist", "ids", userId ?? "anonymous"] as const;

/** Account-scoped ids. Guests never call this function. */
const fetchWishlistIds = async (): Promise<string[]> => {
  const response = await fetch("/api/v2/wishlist", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Unable to load the wishlist (${response.status}).`);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("The wishlist response was incomplete.");
  }
  return payload.filter((id): id is string => typeof id === "string");
};

/**
 * The ids saved for whoever is looking, and whether that answer is settled.
 *
 * `isReady` is false while the session resolves or the guest store rehydrates.
 * Rendering a heart before then flashes the wrong state on every page load.
 */
export function useWishlistIds(): { ids: string[]; isReady: boolean } {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const isAuthenticated = status === "authenticated" && Boolean(userId);
  const queryClient = useQueryClient();
  const previousUserId = useRef<null | string>(null);

  const { data: accountIds, isPending } = useQuery({
    queryKey: wishlistIdsKey(userId),
    queryFn: fetchWishlistIds,
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    const nextUserId = isAuthenticated ? userId : null;
    const previous = previousUserId.current;
    previousUserId.current = nextUserId;

    if (!previous || previous === nextUserId) return;
    const previousKey = wishlistIdsKey(previous);
    void queryClient.cancelQueries({ exact: true, queryKey: previousKey });
    queryClient.removeQueries({ exact: true, queryKey: previousKey });
  }, [isAuthenticated, queryClient, userId]);

  if (status === "loading") return { ids: [], isReady: false };
  // A signed-out shopper has no saves to show; the heart is still clickable
  // and routes through the commerce popup.
  if (!isAuthenticated) return { ids: [], isReady: true };

  return { ids: accountIds ?? [], isReady: !isPending };
}

export function useWishlistMembership(productId: string): {
  isReady: boolean;
  isSaved: boolean;
} {
  const { ids, isReady } = useWishlistIds();
  return { isReady, isSaved: ids.includes(productId) };
}

export function useWishlistActions(): {
  isPending: boolean;
  save: (productId: string) => Promise<void>;
  toggle: (productId: string, isSaved: boolean) => Promise<void>;
} {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isAuthenticated = Boolean(session?.user?.id);

  const accountMutation = useMutation({
    mutationFn: async ({
      productId,
      isSaved,
    }: {
      isSaved: boolean;
      productId: string;
    }) => {
      const response = await fetch("/api/v2/wishlist", {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) throw new Error("Wishlist update failed");
      return response.json();
    },
    onSuccess: (_data, { productId, isSaved }) => {
      void queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      dispatchWishlistUpdated({
        productId,
        reason: isSaved ? "remove" : "add",
      });
    },
  });

  const toggle = useCallback(
    async (productId: string, isSaved: boolean) => {
      // Callers route a signed-out shopper through CommerceAuthProvider first,
      // so reaching here without a session is a bug, not a guest path.
      if (!isAuthenticated) return;
      await accountMutation.mutateAsync({ isSaved, productId });
    },
    [accountMutation, isAuthenticated],
  );

  const save = useCallback(
    async (productId: string) => {
      // Replaying the pre-auth intent means "make sure this is saved". POST is
      // idempotent, whereas toggling could delete an item saved on another tab
      // or device while the shopper was completing sign-in.
      if (!isAuthenticated) return;
      await accountMutation.mutateAsync({ isSaved: false, productId });
    },
    [accountMutation, isAuthenticated],
  );

  return { isPending: accountMutation.isPending, save, toggle };
}
