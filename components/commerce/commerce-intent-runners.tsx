"use client";

/**
 * Performs the action a shopper asked for before they signed in.
 *
 * Mounted once, high in the tree, because the card or dialog that made the
 * request may well have unmounted by the time the session lands — sign-in can
 * re-render the page underneath it.
 *
 * The Drape Room is closed before the popup opens and reopened afterwards, so
 * two aria-modal surfaces are never on screen together. That stacking is what
 * left the room inert behind a dark screen.
 */

import { useCallback } from "react";
import { toast } from "sonner";

import { useCommerceIntentRunner } from "@/components/commerce/commerce-auth-provider";
import { useWishlistActions } from "@/lib/wishlist/use-wishlist";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import { useCartStore } from "@/lib/store/cart-store";
import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import { replayAddToBagAtOrigin } from "@/lib/commerce/add-to-bag-replay";
import { readViewerProductState } from "@/lib/commerce/viewer-state";
import {
  announceViewerState,
  commerceViewerKey,
} from "@/lib/commerce/viewer-state-bus";

export function CommerceIntentRunners() {
  const { save } = useWishlistActions();
  const { addToBag, userId } = useServerCart();
  const addItem = useCartStore((state) => state.addItem);
  const markExplicitAdd = useCartStore((state) => state.markExplicitAdd);

  useCommerceIntentRunner(
    "wishlist-toggle",
    useCallback(
      async (intent) => {
        try {
          // A pre-auth click means "save this". The account may already hold
          // the saree from another tab or device, so replay must be idempotent
          // and must never turn an already-saved item into a removal.
          await save(intent.productId);
          if (useCartStore.getState().presentationUserId !== userId) return;
          toast.success("Saved to your trunk");
        } catch {
          if (useCartStore.getState().presentationUserId === userId) {
            toast.error("Unable to update your wishlist");
          }
        }
      },
      [save, userId],
    ),
  );

  useCommerceIntentRunner(
    "add-to-cart",
    useCallback(
      async (intent) => {
        if (intent.type !== "add-to-cart") return;
        /*
         * Prefer the mounted origin. It resumes the exact same command as the
         * direct click, including its existing animation, and that command
         * performs the one POST. If navigation removed the origin while the
         * shopper signed in, fall back to the server command and still open
         * the drawer once.
         */
        if (await replayAddToBagAtOrigin(intent)) return;

        const result = await addToBag({
          productId: intent.productId,
          ...(intent.type === "add-to-cart" && intent.selectedOptions
            ? { selectedOptions: intent.selectedOptions }
            : {}),
        });

        if (result.ok) {
          /*
           * The replay is an add the shopper made — the click simply happened
           * before the session did. The line itself arrives by sync, which is
           * deliberately silent, so the deliberate part is announced here and
           * the bag opens exactly as it does for a signed-in click.
           */
          if (result.item) {
            addItem({
              addedAt: result.item.addedAt,
              detailsFabric: result.item.detailsFabric ?? null,
              expiresAt: result.item.reservedUntil ?? undefined,
              id: result.item.productId,
              image: result.item.imageUrl ?? "",
              name: result.item.name ?? "",
              originalPricePaise: result.item.originalPricePaise ?? null,
              price: (result.item.pricePaise ?? 0) / 100,
              reservedUntil: result.item.reservedUntil,
              selectedOptions:
                (result.item.selectedOptions as { size?: string } | null) ??
                undefined,
              slug: result.item.slug,
            });
          } else {
            // Compatibility with a rolling deployment where an older server
            // can confirm the mutation before it knows how to return the row.
            markExplicitAdd();
          }
          toast.success("Added to your bag");
          return;
        }
        // Someone else may have claimed it while the shopper was signing in.
        if (result.code !== "VIEWER_CHANGED") {
          toast.error(getAvailabilityErrorMessage(result.code));
        }
      },
      [addItem, addToBag, markExplicitAdd],
    ),
  );

  useCommerceIntentRunner(
    "notify-me",
    useCallback(async (intent) => {
      try {
        const response = await fetch("/api/v2/wishlist/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: intent.productId }),
        });
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          reservedUntil?: unknown;
          viewerState?: unknown;
        } | null;

        if (
          userId == null ||
          useCartStore.getState().presentationUserId !== userId
        ) {
          return;
        }

        if (response.ok) {
          window.dispatchEvent(
            new CustomEvent("ftt:notify-registered", {
              detail: { productId: intent.productId, userId },
            }),
          );
          toast.success("We'll email you if this piece becomes available.");
          return;
        }

        /*
         * A refusal carries the server's verdict for this shopper. Applying it
         * corrects every card and product page at once, instead of leaving
         * "Notify me" offered over a piece that has sold, come free or turned
         * out to be their own. The presentation only ever belongs to a
         * signed-in account, so the guard above proves this viewer key.
         */
        const viewerState = readViewerProductState(payload?.viewerState);
        if (viewerState) {
          announceViewerState({
            productId: intent.productId,
            reservedUntil:
              typeof payload?.reservedUntil === "string"
                ? payload.reservedUntil
                : null,
            state: viewerState,
            viewerKey: commerceViewerKey("authenticated", userId),
          });
        }

        switch (payload?.code) {
          // The hold can lapse while the shopper is signing in.
          case "PRODUCT_AVAILABLE":
            toast.success("This piece is available now", {
              description: "It is back in the collection — you can add it to your bag.",
            });
            return;
          case "PRODUCT_SOLD":
            toast.error("This saree has found its next home");
            return;
          case "NOTIFY_OWN_HOLD":
            toast(
              viewerState === "payment_pending"
                ? "This saree has a payment in progress"
                : "This saree is already in your bag",
            );
            return;
          case "NOTIFY_NOT_ELIGIBLE":
            toast.error("Notify me isn't available for this piece right now");
            return;
        }
        toast.error("Unable to register. Please try again.");
      } catch {
        if (useCartStore.getState().presentationUserId === userId) {
          toast.error("Unable to register. Please try again.");
        }
      }
    }, [userId]),
  );

  return null;
}
