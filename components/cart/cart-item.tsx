"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/formatters";
import { getSelectedSizeLabel } from "@/lib/catalog/blouse-size-chart";
import type {
  ViewerProductDisplayState,
  ViewerProductState,
} from "@/lib/commerce/viewer-state";
import type { CartItem as CartItemType } from "@/lib/store/cart-store";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { cn } from "@/lib/utils";

/**
 * What a bag line says about its piece, shared by the drawer, the bag page and
 * the checkout summary so the three never describe one verdict differently.
 * Only the shopper's own hold is "for you"; everything else names the reason
 * the line has no remove control.
 */
export const CART_LINE_STATUS_LABEL: Record<ViewerProductDisplayState, string> =
  {
    available: "Hold ended",
    checking: "Checking…",
    in_my_cart: "Reserved for you",
    payment_pending: "In bag",
    reserved_by_other: "Reserved",
    sold: "Sold",
  };

/** A line tells its container which verdict it draws; null when it unmounts. */
export type CartLineVerdictReporter = (
  productId: string,
  state: null | ViewerProductDisplayState,
) => void;

/**
 * The verdicts a bag's lines are drawing, gathered for the control that gates
 * checkout.
 *
 * Each line reads its own verdict, because a hook cannot run once per item in
 * a loop. The lines report upward so checkout is blocked on the very answer
 * the lines show. The row status it used to read never says "sold" and cannot
 * see another shopper's hold, so a sold line still offered checkout.
 */
export function useCartLineVerdicts() {
  const [verdicts, setVerdicts] = useState<
    Record<string, ViewerProductDisplayState>
  >({});

  const reportVerdict = useCallback<CartLineVerdictReporter>(
    (productId, state) => {
      setVerdicts((current) => {
        if (state == null) {
          if (!(productId in current)) return current;
          const next = { ...current };
          delete next[productId];
          return next;
        }
        return current[productId] === state
          ? current
          : { ...current, [productId]: state };
      });
    },
    [],
  );

  // Before a line reports, assume the same seed the line itself starts from.
  const verdictFor = useCallback(
    (item: {
      id: string;
      viewerState?: null | ViewerProductState;
    }): ViewerProductDisplayState =>
      verdicts[item.id] ?? item.viewerState ?? "checking",
    [verdicts],
  );

  return { reportVerdict, verdictFor };
}

interface CartItemProps {
  item: CartItemType;
  className?: string;
  onViewerState?: CartLineVerdictReporter;
}

export function CartItem({ item, className, onViewerState }: CartItemProps) {
  const { isReleasing: isReleasingProduct, removeFromBag } = useServerCart();
  const isReleasing = isReleasingProduct(item.id);
  // The same server verdict the product card reads, never the row's status.
  const viewer = useCollectionStock(item.id, {
    reservedUntil: item.reservedUntil ?? null,
    state: item.viewerState ?? "checking",
  });
  const viewerState = viewer.state;
  useEffect(() => {
    if (!onViewerState) return;
    onViewerState(item.id, viewerState);
    return () => onViewerState(item.id, null);
  }, [item.id, onViewerState, viewerState]);
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const href = item.slug ? `/collection/${item.slug}` : "/collection";
  const selectedSizeLabel = getSelectedSizeLabel(item.selectedOptions);
  const isHeldForMe = viewerState === "in_my_cart";
  // Only the exact current hold is the shopper's to release. A payment in
  // progress, a sale, another shopper's hold or an unverified line keeps it,
  // and so does a row already in payment while the last poll still says
  // in_my_cart (another tab has just started paying).
  const canRemove = isHeldForMe && item.status !== "payment_pending";
  const reservedUntilLabel = isHeldForMe
    ? formatReservationExpiry(item.reservedUntil)
    : null;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[1.35rem] border border-[#E7DDD4] bg-[#FFFCF8] p-3 shadow-[0_10px_30px_rgba(20,29,70,0.07)] transition hover:border-[#B39152]/55 hover:shadow-[0_16px_38px_rgba(20,29,70,0.10)]",
        className,
      )}
    >
      <div className="flex gap-3">
        <Link
          href={href}
          prefetch={false}
          className="relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#601D1C]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152]"
          aria-label={`View ${item.name}`}
        >
          {item.image ? (
            <ResilientProductImage
              src={item.image}
              alt={item.name}
              fill
              sizes="96px"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B625B]">
              FTT
            </div>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={href}
                prefetch={false}
                className="line-clamp-2 font-serif text-lg leading-tight text-[#141D46] underline-offset-4 hover:underline"
              >
                {item.name}
              </Link>

              <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.22em] text-[#6B625B]">
                {item.detailsFabric ?? "Unique"}
              </p>
              {selectedSizeLabel ? (
                <p className="mt-1 text-xs font-semibold text-[#141D46]/72">
                  {selectedSizeLabel}
                </p>
              ) : null}

              <p className="mt-2 text-sm font-semibold text-[#141D46]">
                {formatCurrency(item.price * quantity)}
              </p>
            </div>

            {canRemove ? (
              <button
                type="button"
                disabled={isReleasing}
                onClick={async () => {
                /*
                 * Removed on the server, which owns the bag.
                 *
                 * This used to call the local store's removeItem, whose
                 * release needs a signed token. Rows synced down from the
                 * account carry none, so that path returned early without
                 * ever sending a request: the line vanished locally, the
                 * server row survived, and a refresh brought the saree back.
                 *
                 * The row stays until the server confirms the hold is gone,
                 * so a quick re-add cannot race the release.
                 */
                const result = await removeFromBag(item.id);
                if (result.ok) {
                  toast(`${item.name} removed from your bag`);
                  return;
                }
                // The answer belongs to an account that has since signed out.
                if (result.code === "VIEWER_CHANGED") return;
                toast.error(
                  result.viewerState === "payment_pending"
                    ? "This saree has a payment in progress"
                    : "Could not release this saree",
                  {
                    description:
                      result.viewerState === "payment_pending"
                        ? "Finish or cancel that payment before removing it."
                        : "It is still in your bag. Check your connection and try again.",
                  },
                );
                }}
                aria-label={
                  isReleasing
                    ? `Releasing ${item.name}`
                    : `Remove ${item.name} from bag`
                }
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C] transition hover:border-[#601D1C]/45 hover:bg-[#601D1C]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] disabled:cursor-wait disabled:opacity-60"
              >
                {isReleasing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E7DDD4] pt-3">
            <span className="max-w-full rounded-full bg-[#B39152]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141D46]">
              {isReleasing ? "Releasing…" : CART_LINE_STATUS_LABEL[viewerState]}
            </span>

            <span className="min-w-0 text-right text-xs text-[#6B625B]">
              {cartLineNote(viewerState, reservedUntilLabel)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function cartLineNote(
  viewerState: ViewerProductDisplayState,
  reservedUntilLabel: null | string,
) {
  switch (viewerState) {
    case "in_my_cart":
      return reservedUntilLabel ?? "Ready for checkout";
    case "payment_pending":
      return "Payment in progress";
    case "sold":
      return "No longer available";
    case "reserved_by_other":
      return "Held by another shopper";
    case "available":
      return "No longer reserved for you";
    case "checking":
      return "Checking availability";
  }
}

function formatReservationExpiry(value: null | string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `Held until ${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}
import { ResilientProductImage } from "@/components/media/resilient-product-image";
