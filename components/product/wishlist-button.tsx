"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";

import { Button } from "@/components/ui/button";
import { DrapeRoomActionTile } from "@/components/drape-room/drape-room-action-tile";
import type { ViewerProductDisplayState } from "@/lib/commerce/viewer-state";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { cn } from "@/lib/utils";
import {
  useWishlistActions,
  useWishlistMembership,
} from "@/lib/wishlist/use-wishlist";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  className?: string;
  presentation?: "icon" | "drape-room";
  /** Server-rendered seed, replaced by the shared viewer-state batch. */
  initialViewerState?: ViewerProductDisplayState;
  /** Only the Wishlist page may remove a save after the product is sold. */
  allowSoldRemoval?: boolean;
}

/**
 * Saves a saree to the shopper's trunk.
 *
 * A signed-out shopper is sent through CommerceAuthProvider, which owns the
 * only sign-in dialog on the page and replays this save once they are in. This
 * button raises no dialog of its own — one raised from inside the Drape Room
 * stacked a second aria-modal over the first and blacked out the screen.
 */
export function WishlistButton({
  productId,
  productName,
  className,
  presentation = "icon",
  initialViewerState = "checking",
  allowSoldRemoval = false,
}: WishlistButtonProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const commerceAuth = useCommerceAuth();
  const { isReady, isSaved } = useWishlistMembership(productId);
  const { isPending, toggle } = useWishlistActions();
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);
  const viewer = useCollectionStock(productId, {
    reservedUntil: null,
    state: initialViewerState,
  });

  const showSaved = optimisticSaved ?? isSaved;
  const isCheckingAvailability = viewer.state === "checking";
  const isSold = viewer.state === "sold";
  const canRemoveSoldSave = isSold && allowSoldRemoval && showSaved;
  /*
   * A verdict still loading blocks a new save only. Taking a save back out is
   * never a commerce action, so it cannot wait on availability — otherwise a
   * sold piece could get stuck on the Wishlist page behind "checking".
   */
  const checkingBlocksSave = isCheckingAvailability && !showSaved;

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      isPending ||
      checkingBlocksSave ||
      (isSold && !canRemoveSoldSave) ||
      (isAuthenticated && !isReady)
    )
      return;

    /*
     * Signed out, this hands off and returns. The provider opens the popup and
     * replays the save afterwards, so the shopper never taps the heart twice.
     */
    if (commerceAuth && !isAuthenticated) {
      commerceAuth.requireAuth({
        productId,
        source: presentation === "drape-room" ? "drape-room" : "product",
        type: "wishlist-toggle",
      });
      return;
    }

    const nextSaved = !showSaved;
    setOptimisticSaved(nextSaved);

    try {
      await toggle(productId, showSaved);
      toast[nextSaved ? "success" : "message"](
        nextSaved
          ? "Saved to your trunk"
          : `${productName} removed from wishlist`,
      );
    } catch {
      setOptimisticSaved(null);
      toast.error("Unable to update your wishlist");
      return;
    }
    setOptimisticSaved(null);
  };

  const label = showSaved
    ? `Remove ${productName} from wishlist`
    : `Save ${productName} to wishlist`;

  // Sold pieces offer no new save. The one exception is the Wishlist page,
  // where an already-saved piece remains removable from the account.
  if (isSold && !canRemoveSoldSave) return null;

  if (presentation === "drape-room") {
    return (
      <DrapeRoomActionTile
        active={showSaved}
        icon={
          <Heart
            className={cn("transition", showSaved && "fill-current")}
            aria-hidden="true"
          />
        }
        label="Wishlist"
        status={showSaved ? "Saved" : undefined}
        className={className}
        disabled={
          isPending || checkingBlocksSave || (isAuthenticated && !isReady)
        }
        onClick={handleClick}
        aria-pressed={showSaved}
        aria-label={label}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full transition",
        showSaved
          ? "text-red-500 hover:text-red-600"
          : "text-muted-foreground hover:text-red-400",
        className,
      )}
      disabled={
        isPending || checkingBlocksSave || (isAuthenticated && !isReady)
      }
      onClick={handleClick}
      aria-pressed={showSaved}
      aria-label={label}
    >
      <Heart
        className={cn("h-5 w-5 transition", showSaved && "fill-current")}
        aria-hidden="true"
      />
    </Button>
  );
}
