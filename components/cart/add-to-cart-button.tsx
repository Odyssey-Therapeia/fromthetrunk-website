"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DrapeRoomActionTile } from "@/components/drape-room/drape-room-action-tile";
import {
  applyNotifyRefusal,
  notifyButtonClass,
  notifyRegisteredButtonClass,
} from "@/components/product/restock-notify-button";
import { trackWebsiteMetric } from "@/lib/analytics/client";
import { buildAddToCartEvent } from "@/lib/analytics/ga4-ecommerce";
import { isBlouseProduct } from "@/lib/products/product-type";
import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import { showAddedToCartToast } from "@/lib/cart/reservation-toast";
import {
  getSelectedSizeLabel,
  normalizeBlouseSize,
  type SelectedOptions,
} from "@/lib/catalog/blouse-size-chart";
import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";
import { subscribeToAddToBagReplay } from "@/lib/commerce/add-to-bag-replay";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import type { Product, StockStatus } from "@/types/domain";

export type AddToCartProduct = Pick<
  Product,
  | "detailsFabric"
  | "id"
  | "name"
  | "originalPricePaise"
  | "pricePaise"
  | "slug"
  | "stockStatus"
> & {
  imageUrl?: string;
  images?: Product["images"];
  tags?: Array<{ name?: null | string; slug?: null | string }>;
  typeSlug?: null | string;
};

interface AddToCartButtonProps {
  product: AddToCartProduct;
  /**
   * P4-05: optional flag-gated override for the initial stock status.
   * When isInventoryV2() is ON, the PDP passes effectiveStockStatus (derived
   * from quantity_available + active reservations) so the button's buyability
   * reflects v2 availability, not the raw stockStatus column.
   * When absent (flag OFF), falls back to product.stockStatus — byte-identical
   * to the pre-P4-05 behavior.
   */
  initialStatus?: StockStatus;
  onMissingRequiredOption?: () => void;
  requiresBlouseSize?: boolean;
  selectedOptions?: SelectedOptions;
  /** Reuses the same reservation path in compact commerce surfaces. */
  presentation?: "default" | "drape-room";
  className?: string;
  analyticsSource?: string;
  /**
   * Fired once, after a reservation succeeds and the line is in the store.
   *
   * The cart drawer auto-opens on any increase in cart quantity
   * (components/cart/cart-drawer.tsx) — one authority, no per-caller wiring.
   * A caller that is itself an `aria-modal` surface must use this hook to close
   * ITSELF here, so the bag never opens on top of it and leaves two modals
   * stacked with the lower one inert. Not fired for a size-only update, which
   * changes no quantity and therefore opens nothing.
   */
  onAdded?: () => void;
}

const stockLabels: Record<StockStatus, string> = {
  available: "Add to Bag",
  reserved: "Reserved",
  sold: "Sold",
};

export function AddToCartButton(props: AddToCartButtonProps) {
  const serverCart = useServerCart();

  return (
    <AddToCartButtonForViewer
      key={`${serverCart.userId ?? "anonymous"}:${props.product.id}`}
      {...props}
      serverCart={serverCart}
    />
  );
}

function AddToCartButtonForViewer({
  product,
  initialStatus,
  onMissingRequiredOption,
  requiresBlouseSize,
  selectedOptions,
  presentation = "default",
  className,
  analyticsSource = "pdp",
  onAdded,
  serverCart,
}: AddToCartButtonProps & {
  serverCart: ReturnType<typeof useServerCart>;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const updateSelectedOptions = useCartStore(
    (state) => state.updateSelectedOptions,
  );
  const commerceAuth = useCommerceAuth();
  // Read for the chosen size only. Whether the piece is this shopper's is the
  // server verdict's call; a bag row proves a row exists, not the hold.
  const existingItem = serverCart.items.find(
    (item) => item.productId === product.id,
  );
  const isReleasing = serverCart.isReleasing(product.id);
  const runAddFlowRef = useRef<
    ((options?: Record<string, unknown>, replay?: boolean) => Promise<void>) | null
  >(null);
  const addAttemptRef = useRef(0);
  const notifyAttemptRef = useRef(0);
  const [added, setAdded] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [notifyPending, setNotifyPending] = useState(false);
  const [notifyRegistered, setNotifyRegistered] = useState(false);
  const image = product.imageUrl ?? resolveMediaURL(product.images?.[0]) ?? "";
  const isBlouse = isBlouseProduct(product);
  const initialStockStatus = (initialStatus ?? product.stockStatus) as StockStatus;
  const viewer = useCollectionStock(product.id, {
    reservedUntil: null,
    state:
      initialStockStatus === "sold"
        ? "sold"
        : initialStockStatus === "reserved"
          ? "reserved_by_other"
          : "available",
  });
  const viewerState = viewer.state;
  const inCart =
    viewerState === "in_my_cart" || viewerState === "payment_pending";
  const selectedSize = normalizeBlouseSize(selectedOptions?.size);
  const existingSize = normalizeBlouseSize(existingItem?.selectedOptions?.size);
  const canUpdateSelectedOptions =
    Boolean(
      requiresBlouseSize &&
        viewerState === "in_my_cart" &&
        selectedSize &&
        selectedSize !== existingSize,
    );
  const canRemoveFromBag = viewerState === "in_my_cart";

  const stockStatus: StockStatus =
    viewerState === "sold"
      ? "sold"
      : viewerState === "available"
        ? "available"
        : "reserved";
  const canAttemptAdd = stockStatus === "available" && !inCart;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  const runAddToCartFlow = async (
    intentOptions?: Record<string, unknown>,
    replay = false,
  ) => {
    const intentSize = normalizeBlouseSize(intentOptions?.size);
    const size = intentSize ?? selectedSize;
    const isSizeUpdate = Boolean(
      requiresBlouseSize &&
        viewerState === "in_my_cart" &&
        size &&
        size !== existingSize,
    );
    if (
      (!replay && !canAttemptAdd && !isSizeUpdate) ||
      isReserving ||
      isReleasing
    )
      return;

    const attempt = ++addAttemptRef.current;
    setIsReserving(true);
    try {
      const result = await serverCart
        .addToBag({
          productId: product.id,
          ...(size ? { selectedOptions: { size } } : {}),
        })
        .catch(() => null);

      if (attempt !== addAttemptRef.current) return;
      if (result?.code === "VIEWER_CHANGED") return;
      if (!result?.ok) {
        toast.error(getAvailabilityErrorMessage(result?.code));
        return;
      }

      if (isSizeUpdate && size) {
        updateSelectedOptions(product.id, { size });
        setAdded(true);
        toast.success(`Updated blouse size to ${size}`);
        return;
      }

      /*
       * The local line is presentation only — name, price, image for the
       * drawer. It carries no reservation proof, because the hold and the row
       * that records it were written together on the server.
       */
      addItem({
        id: product.id,
        name: product.name,
        price: product.pricePaise / 100,
        originalPricePaise: product.originalPricePaise ?? null,
        image,
        slug: product.slug,
        detailsFabric: product.detailsFabric ?? null,
        ...(size ? { selectedOptions: { size } } : {}),
      });
      trackWebsiteMetric(
        "add_to_cart",
        {
          pricePaise: product.pricePaise,
          productId: product.id,
          slug: product.slug,
          source: analyticsSource,
          stockStatus,
        },
        buildAddToCartEvent(
          {
            category: isBlouse ? "Blouse" : "Saree",
            id: product.id,
            name: product.name,
            pricePaise: product.pricePaise,
            variant: size ?? product.detailsFabric,
          },
          {
            source: analyticsSource,
            stockStatus,
          },
        ),
      );
      setAdded(true);
      showAddedToCartToast({
        noun: isBlouse ? "blouse" : "saree",
        title: size
          ? `Added to bag, Size ${size}`
          : `${product.name} added to your bag`,
      });
      // Same batch as addItem above, so a modal caller unmounts in the SAME
      // commit that raises the cart quantity. The drawer's quantity effect then
      // opens the bag in the next commit — the two surfaces are never active
      // together.
      onAdded?.();
    } finally {
      if (attempt === addAttemptRef.current) setIsReserving(false);
    }
  };

  useEffect(() => {
    runAddFlowRef.current = runAddToCartFlow;
  });

  useEffect(
    () =>
      subscribeToAddToBagReplay((intent) => {
        if (
          intent.productId !== product.id ||
          intent.source !== analyticsSource ||
          !runAddFlowRef.current
        ) {
          return false;
        }

        return runAddFlowRef.current(intent.selectedOptions, true);
      }),
    [analyticsSource, product.id],
  );

  const handleAddToCart = async () => {
    if (requiresBlouseSize && !selectedSize) {
      onMissingRequiredOption?.();
      return;
    }

    if ((!canAttemptAdd && !canUpdateSelectedOptions) || isReserving || isReleasing)
      return;

    if (commerceAuth && !serverCart.isAuthenticated) {
      commerceAuth.requireAuth({
        productId: product.id,
        source: analyticsSource,
        type: "add-to-cart",
        ...(selectedSize ? { selectedOptions: { size: selectedSize } } : {}),
      });
      return;
    }

    await runAddToCartFlow(
      selectedSize ? { size: selectedSize } : undefined,
    );
  };

  const handleRemoveFromBag = async () => {
    if (!canRemoveFromBag || isReleasing) return;

    const result = await serverCart.removeFromBag(product.id);
    if (result.code === "VIEWER_CHANGED") return;
    if (!result.ok) {
      const paymentInProgress =
        result.viewerState === "payment_pending" ||
        result.code === "PAYMENT_IN_PROGRESS" ||
        result.code === "PAYMENT_RESERVATION_CONFLICT";
      toast.error(
        paymentInProgress
          ? "This saree has a payment in progress"
          : "Could not release this item",
        {
          description: paymentInProgress
            ? "Finish or cancel that payment before removing it."
            : "It is still in your bag. Check your connection and try again.",
        },
      );
      return;
    }

    toast.success(`${product.name} removed from your bag`);
  };

  const handleNotify = async () => {
    if (notifyPending || notifyRegistered) return;

    if (commerceAuth && !serverCart.isAuthenticated) {
      commerceAuth.requireAuth({
        productId: product.id,
        source: analyticsSource,
        type: "notify-me",
      });
      return;
    }

    const initiatingUserId = serverCart.userId;
    const attempt = ++notifyAttemptRef.current;
    setNotifyPending(true);
    try {
      const response = await fetch("/api/v2/wishlist/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        viewerState?: unknown;
      } | null;

      if (
        attempt !== notifyAttemptRef.current ||
        initiatingUserId == null ||
        useCartStore.getState().presentationUserId !== initiatingUserId
      ) {
        return;
      }

      if (response.ok) {
        setNotifyRegistered(true);
        window.dispatchEvent(
          new CustomEvent("ftt:notify-registered", {
            detail: { productId: product.id, userId: initiatingUserId },
          }),
        );
        toast.success("We'll email you if this piece becomes available.");
      } else if (
        applyNotifyRefusal({
          payload,
          productId: product.id,
          userId: initiatingUserId,
        })
      ) {
        // The verdict on screen was stale; confirm the bag behind the correction.
        await serverCart.refresh();
      } else {
        toast.error("Unable to register. Please try again.");
      }
    } catch {
      if (
        attempt === notifyAttemptRef.current &&
        initiatingUserId != null &&
        useCartStore.getState().presentationUserId === initiatingUserId
      ) {
        toast.error("Unable to register. Please try again.");
      }
    } finally {
      if (attempt === notifyAttemptRef.current) setNotifyPending(false);
    }
  };

  useEffect(() => {
    const markRegistered = (event: Event) => {
      const detail = (
        event as CustomEvent<{ productId?: string; userId?: string }>
      ).detail;
      if (
        detail?.productId === product.id &&
        detail.userId === serverCart.userId
      ) {
        setNotifyRegistered(true);
      }
    };
    window.addEventListener("ftt:notify-registered", markRegistered);
    return () => window.removeEventListener("ftt:notify-registered", markRegistered);
  }, [product.id, serverCart.userId]);

  if (viewerState === "sold") {
    if (presentation === "drape-room") return null;

    return (
      <Button className={cn("w-full rounded-full py-6", className)} disabled>
        Sold
      </Button>
    );
  }

  if (presentation === "drape-room") {
    const unavailableReason =
      viewerState === "reserved_by_other"
        ? "This saree is reserved by another buyer."
        : canRemoveFromBag
          ? "Remove this saree from your bag."
          : undefined;

    return (
      <DrapeRoomActionTile
        icon={
          isReleasing ? (
            <LoaderCircle
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : canRemoveFromBag ? (
            <Trash2 aria-hidden="true" />
          ) : (
            <ShoppingBag aria-hidden="true" />
          )
        }
        label={
          // A release in flight outranks whatever the verdict now says: the
          // tile must not offer the saree back before the release finishes.
          isReleasing
            ? "Releasing…"
            : inCart
              ? "In bag"
              : viewerState === "checking"
                ? "Checking…"
                : viewerState === "reserved_by_other"
                  ? notifyRegistered
                    ? "Notify registered"
                    : notifyPending
                      ? "Registering…"
                      : "Notify me"
                  : isReserving
                    ? "Reserving…"
                    : "Add to bag"
        }
        status={
          added
            ? "Added"
            : inCart
              ? "In your bag"
              : viewerState === "checking"
                ? "Checking"
                : stockStatus === "reserved"
                  ? "Reserved"
                  : undefined
        }
        aria-busy={isReserving || isReleasing}
        aria-label={
          isReleasing
            ? `Releasing ${product.name}`
            : canRemoveFromBag
              ? `Remove ${product.name} from bag`
              : inCart
                ? `${product.name} is in your bag`
                : viewerState === "checking"
                  ? `Checking availability for ${product.name}`
                  : viewerState === "reserved_by_other"
                    ? `Notify me when ${product.name} becomes available`
                    : unavailableReason
                      ? `Add to cart. ${unavailableReason}`
                      : "Add to cart"
        }
        title={unavailableReason}
        className={className}
        disabled={
          canRemoveFromBag
            ? isReleasing
            : isReleasing || inCart || viewerState === "checking"
              ? true
              : viewerState === "reserved_by_other"
                ? notifyPending || notifyRegistered
                : isReserving || stockStatus !== "available"
        }
        onClick={
          canRemoveFromBag
            ? () => void handleRemoveFromBag()
            : viewerState === "reserved_by_other"
              ? () => void handleNotify()
              : handleAddToCart
        }
      />
    );
  }

  /*
   * A release in flight outranks a verdict that lands before it finishes, as
   * on the tile. Once the DELETE answers, the verdict can read checking or
   * another shopper's hold while the release is still settling, and an enabled
   * Notify me there invited a click mid-release. The bag's own split below
   * keeps its spinner, and an available verdict already reads Releasing….
   */
  if (
    isReleasing &&
    (viewerState === "checking" || viewerState === "reserved_by_other")
  ) {
    return (
      <Button className={cn("w-full rounded-full py-6", className)} disabled>
        Releasing…
      </Button>
    );
  }

  if (viewerState === "checking") {
    return (
      <Button className={cn("w-full rounded-full py-6", className)} disabled>
        Checking…
      </Button>
    );
  }

  if (viewerState === "reserved_by_other") {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(
          "w-full rounded-full py-6",
          notifyButtonClass,
          notifyRegistered && notifyRegisteredButtonClass,
          className,
        )}
        disabled={notifyPending || notifyRegistered}
        onClick={() => void handleNotify()}
      >
        {notifyRegistered
          ? "Notify registered"
          : notifyPending
            ? "Registering…"
            : "Notify me"}
      </Button>
    );
  }

  if (inCart) {
    const sizeLabel = getSelectedSizeLabel(
      existingItem?.selectedOptions as SelectedOptions | null | undefined,
    );
    return (
      <div className={cn("flex w-full items-stretch gap-2", className)}>
        <Button
          type="button"
          className="min-w-0 flex-1 rounded-full py-6"
          disabled={!canUpdateSelectedOptions || isReserving || isReleasing}
          onClick={handleAddToCart}
          aria-live="polite"
        >
          {isReleasing
            ? "Releasing…"
            : canUpdateSelectedOptions
              ? "Update Size"
              : sizeLabel
                ? `${sizeLabel} · In bag`
                : "In bag"}
        </Button>
        {canRemoveFromBag ? (
          <Button
            type="button"
            variant="outline"
            className="h-auto w-12 shrink-0 rounded-full border-[#B39152]/70 bg-[#FDF7F1] px-0 text-[#601D1C] hover:border-[#601D1C]/55 hover:bg-[#601D1C]/6"
            disabled={isReleasing}
            onClick={() => void handleRemoveFromBag()}
            aria-label={
              isReleasing
                ? `Releasing ${product.name}`
                : `Remove ${product.name} from bag`
            }
          >
            {isReleasing ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Button
      className={cn("w-full rounded-full py-6 text-[#FDF7F1]", className)}
      disabled={
        isReserving ||
        // The verdict can say available before the release has finished;
        // offering the saree back then races the shopper's own removal.
        isReleasing ||
        (stockStatus !== "available" && !canUpdateSelectedOptions) ||
        (inCart && !canUpdateSelectedOptions)
      }
      onClick={handleAddToCart}
    >
      {isReleasing
        ? "Releasing…"
        : canUpdateSelectedOptions
          ? "Update Size"
          : isReserving
            ? "Reserving..."
            : added
              ? "Added to Bag"
              : stockLabels[stockStatus]}
    </Button>
  );
}
