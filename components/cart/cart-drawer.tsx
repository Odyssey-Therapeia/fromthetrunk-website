"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type MotionProps,
} from "framer-motion";
import {
  ArrowRight,
  LockKeyhole,
  LoaderCircle,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import {
  CART_LINE_STATUS_LABEL,
  type CartLineVerdictReporter,
  useCartLineVerdicts,
} from "@/components/cart/cart-item";
import { CommerceCountBadge } from "@/components/layout/commerce-count-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/formatters";
import { CART_DELIVERY_ESTIMATE } from "@/lib/cart/delivery-estimate";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import type { ViewerProductState } from "@/lib/commerce/viewer-state";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tokens and mappings — the two things you may need to edit.
// ---------------------------------------------------------------------------

// One token for every savings figure in the drawer. Deep forest green: reads
// clearly as green without looking like a discount sticker on the ivory.
const SAVINGS_ACCENT = "#2E5A43";

// The strip panel. A pale sage tint of the accent, kept light so the green
// reads on the ivory without the numbers losing contrast.
const STRIP_BG = "#EDF2EC";

/**
 * The drawer renders each line itself now, so it needs the display fields the
 * old CartItem component was reading. `price` and `name` are confirmed working;
 * fabric and original price are resolved by the helpers below because the real
 * key names are not known yet. Replace both helpers with a direct field read
 * once you confirm them.
 */
type CartLineFields = {
  id: string;
  image?: null | string;
  name?: null | string;
  price?: null | number;
  reservedUntil?: null | string;
  slug?: null | string;
  status?: null | string;
  viewerState?: null | ViewerProductState;
  [key: string]: unknown;
};

// Whichever of these exists on the item wins. Add the real key to the front of
// the list, or delete the helper entirely and read the field directly.
const FABRIC_KEYS = [
  "fabric",
  "fabricType",
  "fabricName",
  "material",
  "category",
  "productType",
] as const;

const ORIGINAL_PRICE_KEYS = [
  "originalPrice",
  "compareAtPrice",
  "listPrice",
  "mrp",
  "originalPricePaise",
  "compareAtPricePaise",
  "listPricePaise",
  "mrpPaise",
] as const;

function readFabric(item: CartLineFields) {
  for (const key of FABRIC_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }

  return null;
}

/** Returns rupees. Keys ending in Paise are converted, everything else is not. */
function readOriginalPrice(item: CartLineFields) {
  for (const key of ORIGINAL_PRICE_KEYS) {
    const value = item[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;

    return key.endsWith("Paise") ? value / 100 : value;
  }

  return 0;
}

export function CartDrawer({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const previousAddSerial = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const addSerial = useCartStore((state) => state.addSerial);
  const {
    isError,
    isReleasing,
    presentedItems: items,
    presentationHasHydrated: hasHydrated,
    refresh,
    removeFromBag,
  } = useServerCart();
  const { reportVerdict, verdictFor } = useCartLineVerdicts();
  const { savingsPaise, subtotal, totalItems } = getCartTotals(items);
  // Checkout waits for a trusted verdict on every line and refuses a sold one.
  const hasSoldItem = items.some((item) => verdictFor(item) === "sold");
  const hasUncheckedItem = items.some(
    (item) => verdictFor(item) === "checking",
  );
  const canCheckout =
    hasHydrated && items.length > 0 && !hasSoldItem && !hasUncheckedItem;

  // savingsPaise is in paise; subtotal is already in rupees.
  const savings = savingsPaise / 100;
  const originalTotal = subtotal + savings;
  const hasSavings = hasHydrated && savingsPaise > 0;

  const lastRefreshRef = useRef(0);
  const hasReservedCartItem = items.some((item) => Boolean(item.reservedUntil));

  /*
   * Removed on the server, which owns the bag.
   *
   * This drawer renders its own row rather than the CartItem component, and it
   * was handing that row the store's removeItem. That path needs a signed
   * token; rows synced down from the account carry none, so it returned early
   * without ever sending a request — the line vanished locally, the server row
   * survived, and the next refresh brought the saree straight back.
   */
  const handleRemoveFromBag = useCallback(
    async (productId: string) => {
      const line = items.find((item) => item.id === productId);
      const result = await removeFromBag(productId);
      if (result.ok) {
        toast(`${line?.name ?? "This saree"} removed from your bag`);
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
    },
    [items, removeFromBag],
  );
  const earliestReservationExpiresAt = items.reduce<null | number>(
    (earliest, item) => {
      if (!item.reservedUntil) return earliest;
      const expiresAt = new Date(item.reservedUntil).getTime();
      if (!Number.isFinite(expiresAt)) return earliest;
      return earliest == null || expiresAt < earliest ? expiresAt : earliest;
    },
    null,
  );
  const reservationRemainingMs =
    earliestReservationExpiresAt == null
      ? 0
      : Math.max(0, earliestReservationExpiresAt - nowMs);
  const cartHoldLabel =
    earliestReservationExpiresAt != null && reservationRemainingMs > 0
      ? formatCartHoldTime(reservationRemainingMs)
      : null;

  const softEnterMotion: MotionProps = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 8 },
        transition: { duration: 0.28, ease: "easeOut" },
      };

  // Auto-open has exactly ONE authority: the cart-store total effect below.
  // The `ftt:cart-updated` event is dispatched only by the product card (it
  // also drives the fly-to-cart animation), so listening for it here would both
  // duplicate the open and miss the PDP, blouse, and Drape Room flows. Reading
  // the store instead covers every add path with no per-caller wiring.

  const refreshCart = useCallback(async () => {
    if (!hasHydrated || items.length === 0) return;
    lastRefreshRef.current = Date.now();
    await refresh();
  }, [hasHydrated, items.length, refresh]);

  useEffect(() => {
    if (!open) return;
    void refreshCart();
  }, [open, refreshCart]);

  useEffect(() => {
    if (!open || !hasHydrated || !hasReservedCartItem) return;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [open, hasHydrated, hasReservedCartItem]);

  useEffect(() => {
    if (
      !open ||
      !hasHydrated ||
      earliestReservationExpiresAt == null ||
      reservationRemainingMs > 0
    ) {
      return;
    }

    void refreshCart();
  }, [
    earliestReservationExpiresAt,
    hasHydrated,
    open,
    refreshCart,
    reservationRemainingMs,
  ]);

  useEffect(() => {
    const handleFocus = () => {
      if (!open) return;
      if (Date.now() - lastRefreshRef.current < 60_000) return;
      void refreshCart();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [open, refreshCart]);

  useEffect(() => {
    if (!hasHydrated) return;

    // First post-hydration pass only records the baseline, so a persisted cart
    // restored on page load never pops the drawer open.
    if (previousAddSerial.current === null) {
      previousAddSerial.current = addSerial;
      return;
    }

    /*
     * Opens on a deliberate add, not on the count.
     *
     * The count also rises when the account's bag is mirrored down — on load,
     * on sign-in, on any refetch — and reading that as an add popped the
     * drawer open at moments the shopper had not asked for anything. The
     * serial is bumped only by addItem and by the OTP replay, so both real add
     * paths open the bag exactly as they always did, and nothing else does.
     */
    if (addSerial > previousAddSerial.current) {
      setNowMs(Date.now());
      setOpen(true);
    }

    previousAddSerial.current = addSerial;
  }, [addSerial, hasHydrated]);

  const itemLabel =
    !hasHydrated || totalItems === 0
      ? "Your bag is empty"
      : `${totalItems} ${totalItems === 1 ? "piece" : "pieces"}`;
  const cartTriggerLabel =
    hasHydrated && totalItems > 0
      ? `Open bag, ${totalItems} ${totalItems === 1 ? "item" : "items"}`
      : "Open bag, empty";

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setNowMs(Date.now());
    }

    setOpen(nextOpen);
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* Live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {hasHydrated && totalItems > 0
          ? `${totalItems} item${totalItems !== 1 ? "s" : ""} in your bag, total ${formatCurrency(subtotal)}`
          : "Your bag is empty"}
      </div>
      <SheetTrigger asChild>
        {/* A real button, never a link to /cart: opening the bag must not
            navigate away from the page the customer is shopping. */}
        <button
          type="button"
          className={cn(
            "relative grid size-11 shrink-0 place-items-center rounded-full text-[#601D1C] transition hover:bg-[#601D1C]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]",
            triggerClassName,
          )}
          aria-label={cartTriggerLabel}
          data-ftt-cart-target
        >
          <ShoppingBag className="h-7 w-7" strokeWidth={2.1} aria-hidden="true" />
          {/* data-ftt-cart-count is the animation hook read by
              components/product/product-card-commerce-row.tsx — keep the name. */}
          {hasHydrated ? (
            <CommerceCountBadge count={totalItems} data-ftt-cart-count />
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 border-l border-[#E7DDD4] bg-[#FDF7F1] p-0 text-[#0E0D0E] shadow-[0_24px_80px_rgba(20,29,70,0.22)] sm:max-w-[440px]">
        {/* HEADER */}
        <div className="border-b border-[#E7DDD4] px-6 pb-4 pt-6">
          <SheetHeader className="space-y-0 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
              From the trunk
            </p>
            <SheetTitle className="mt-1.5 pr-8 font-serif text-[27px] font-medium leading-none text-[#141D46]">
              Shopping bag
            </SheetTitle>
            <SheetDescription className="sr-only">
              Review the pieces in your bag, then continue to checkout or open
              the full bag page.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[#6B625B]">
            <span>{hasHydrated ? itemLabel : "Loading"}</span>
            {hasHydrated && cartHoldLabel ? (
              <>
                <span aria-hidden="true" className="text-[#D9CEC3]">
                  |
                </span>
                <CartHoldTimer label={cartHoldLabel} />
              </>
            ) : null}
          </div>
        </div>

        {/* BODY — rows separated by hairlines, no card around each piece. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {!hasHydrated ? (
            <div className="py-5">
              <CartDrawerState
                title={isError ? "We couldn't open your bag." : "Opening your trunk..."}
                body={
                  isError
                    ? "Check your connection and try again."
                    : "We are loading your saved selection."
                }
                action={
                  isError ? (
                    <Button
                      className="mt-5 rounded-full bg-[#141D46] px-6 text-[#FDF7F1] hover:bg-[#0E0D0E]"
                      onClick={() => void refresh()}
                    >
                      Try again
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : items.length === 0 ? (
            <div className="py-5">
              <CartDrawerState
                title="Your bag is empty."
                body="Explore the collection and add a unique piece to begin."
                action={
                  <Button
                    asChild
                    className="mt-5 rounded-full bg-[#141D46] px-6 text-[#FDF7F1] hover:bg-[#0E0D0E]"
                    onClick={() => setOpen(false)}
                  >
                    <Link href="/collection">Explore collection</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-[#E7DDD4]">
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.li
                    key={item.id}
                    layout
                    {...(shouldReduceMotion
                      ? {}
                      : {
                          initial: { opacity: 0, x: 16 },
                          animate: { opacity: 1, x: 0 },
                          exit: { opacity: 0, x: 12 },
                          transition: {
                            duration: 0.26,
                            delay: index * 0.035,
                            ease: "easeOut",
                          },
                        })}
                  >
                    <CartLine
                      item={item as unknown as CartLineFields}
                      isReleasing={isReleasing(item.id)}
                      onRemove={handleRemoveFromBag}
                      onViewerState={reportVerdict}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* FOOTER */}
        <motion.div
          {...softEnterMotion}
          className="border-t border-[#E7DDD4] bg-[#FFFCF8]/95 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_50px_rgba(20,29,70,0.08)] backdrop-blur"
        >
          {/* Savings and delivery share one strip. Two cells, both centred. */}
          <div
            className={cn(
              "grid divide-x divide-[#E7DDD4] rounded-2xl py-3",
              hasSavings ? "grid-cols-2" : "grid-cols-1",
            )}
            style={{ backgroundColor: STRIP_BG }}
          >
            {hasSavings ? (
              <StripCell
                kind="savings"
                icon={
                  <Tag
                    className="h-4 w-4"
                    style={{ color: SAVINGS_ACCENT }}
                    aria-hidden="true"
                  />
                }
              >
                <span style={{ color: SAVINGS_ACCENT }}>You save</span>
                <span
                  className="block font-medium"
                  style={{ color: SAVINGS_ACCENT }}
                >
                  {formatCurrency(savings)}
                </span>
              </StripCell>
            ) : null}

            <StripCell
              kind="delivery"
              icon={<Truck className="h-4 w-4 text-[#9A8C82]" aria-hidden="true" />}
            >
              <span className="text-[#6B625B]">{CART_DELIVERY_ESTIMATE.title}</span>
              <span className="block text-[#141D46]">
                {CART_DELIVERY_ESTIMATE.drawerLabel}
              </span>
            </StripCell>
          </div>

          {/* Ledger. Subtotal is the sum before the markdown, so subtotal minus
              savings genuinely equals the total. */}
          <dl className="mt-4 space-y-2">
            {hasSavings ? (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <dt className="text-[#6B625B]">Subtotal</dt>
                  <dd className="text-[#141D46]">{formatCurrency(originalTotal)}</dd>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <dt style={{ color: SAVINGS_ACCENT }}>Savings</dt>
                  <dd style={{ color: SAVINGS_ACCENT }}>
                    &minus;{formatCurrency(savings)}
                  </dd>
                </div>
              </>
            ) : null}

            <div className="flex items-baseline justify-between border-t border-[#B39152]/40 pt-3">
              <dt className="text-[15px] text-[#141D46]">Total</dt>
              <dd className="font-serif text-[26px] leading-none text-[#141D46]">
                {hasHydrated ? formatCurrency(subtotal) : "—"}
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-xs leading-5 text-[#6B625B]">
            Shipping and taxes confirmed at checkout.
          </p>

          {/* A sold or unverified line disables the control; it never vanishes. */}
          {canCheckout ? (
            <Button
              asChild
              className="mt-4 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] hover:bg-[#0E0D0E]"
            >
              <Link href="/checkout" onClick={() => setOpen(false)}>
                Proceed to checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              className="mt-4 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1]"
              disabled
            >
              Proceed to checkout
            </Button>
          )}

          {/* The drawer is the quick view; the full bag page stays reachable on
              purpose, just never as the header icon's default action. */}
          <div className="mt-3 flex items-center justify-center gap-6 text-[13px]">
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="rounded-sm text-[#601D1C] underline underline-offset-4 transition hover:text-[#141D46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]"
            >
              View full bag
            </Link>
            <Link
              href="/collection"
              onClick={() => setOpen(false)}
              className="rounded-sm text-[#601D1C] underline underline-offset-4 transition hover:text-[#141D46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]"
            >
              Continue shopping
            </Link>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

/** One piece in the bag. No border: the hairline above it does that job. */
function CartLine({
  item,
  isReleasing,
  onRemove,
  onViewerState,
}: {
  item: CartLineFields;
  isReleasing: boolean;
  onRemove: (id: string) => Promise<void>;
  onViewerState: CartLineVerdictReporter;
}) {
  const name = item.name ?? "Untitled piece";
  const price = item.price ?? 0;
  const fabric = readFabric(item);
  const originalPrice = readOriginalPrice(item);
  const showOriginal = originalPrice > price;
  // The same server verdict the product card reads, never the row's status.
  const viewer = useCollectionStock(item.id, {
    reservedUntil: item.reservedUntil ?? null,
    state: item.viewerState ?? "checking",
  });
  const viewerState = viewer.state;
  useEffect(() => {
    onViewerState(item.id, viewerState);
    return () => onViewerState(item.id, null);
  }, [item.id, onViewerState, viewerState]);
  const isHeldForMe = viewerState === "in_my_cart";
  const isPaymentPending = viewerState === "payment_pending";
  const isSold = viewerState === "sold";
  const isReservedByOther = viewerState === "reserved_by_other";
  // Only the exact current hold is the shopper's to release. A row that has
  // already moved into payment keeps its line even when the last poll, sent
  // before another tab started paying, still says in_my_cart.
  const canRemove = isHeldForMe && item.status !== "payment_pending";
  // "Held for you" is a promise only the shopper's own hold can make.
  const heldUntil =
    isHeldForMe && item.reservedUntil
      ? formatHoldUntil(item.reservedUntil)
      : null;

  return (
    <div className="flex gap-3.5 py-3.5">
      <div className="relative h-[84px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[#EFE6DC]">
        {item.image ? (
          <Image
            src={item.image}
            alt={name}
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-[16px] leading-[1.3] text-[#141D46]">
            {item.slug ? (
              <Link href={`/collection/${item.slug}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          {canRemove ? (
            <button
              type="button"
              disabled={isReleasing}
              onClick={() => void onRemove(item.id)}
              aria-label={
                isReleasing
                  ? `Releasing ${name}`
                  : `Remove ${name} from your bag`
              }
              className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[#9A8C82] transition hover:bg-[#601D1C]/8 hover:text-[#601D1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152] disabled:cursor-wait disabled:opacity-60"
            >
              {isReleasing ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>

        {fabric ? (
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9A8C82]">
            {fabric}
          </p>
        ) : null}

        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[16px] font-medium text-[#141D46]">
            {formatCurrency(price)}
          </span>
          {showOriginal ? (
            <span className="text-[12px] text-[#9A8C82] line-through decoration-[#C5B8AC]">
              {formatCurrency(originalPrice)}
            </span>
          ) : null}
        </div>

        {isReleasing ||
        heldUntil ||
        isPaymentPending ||
        isSold ||
        isReservedByOther ? (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#B39152]/12 px-2 py-0.5 text-[10px] text-[#6B625B]">
            <LockKeyhole className="h-3 w-3 text-[#B39152]" aria-hidden="true" />
            {isReleasing
              ? "Releasing…"
              : heldUntil
                ? `Held for you until ${heldUntil}`
                : CART_LINE_STATUS_LABEL[viewerState]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StripCell({
  children,
  icon,
  kind,
}: {
  children: ReactNode;
  icon: ReactNode;
  kind: "delivery" | "savings";
}) {
  return (
    <div
      data-ftt-cart-delivery={kind === "delivery" ? "" : undefined}
      data-ftt-cart-savings={kind === "savings" ? "" : undefined}
      className="flex items-center justify-center gap-2 px-3 text-center text-[11px] leading-4"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function formatCartHoldTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatHoldUntil(iso: string) {
  const expiresAt = new Date(iso);
  if (!Number.isFinite(expiresAt.getTime())) return null;
  if (expiresAt.getTime() <= Date.now()) return null;

  return expiresAt
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      hour12: true,
      minute: "2-digit",
    })
    .toLowerCase();
}

function CartHoldTimer({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`Reservation hold ends in ${label}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-[#141D46] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]"
          >
            <LockKeyhole className="h-3.5 w-3.5 text-[#B39152]" aria-hidden="true" />
            <span className="tabular-nums">Reserved for the next {label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-[15rem] rounded-xl border border-[#B39152]/30 bg-[#FFFCF8] px-3 py-2 text-xs leading-5 text-[#601D1C] shadow-[0_14px_34px_rgba(20,29,70,0.16)]"
        >
          Your reserved piece will be released after one hour. Complete checkout
          before someone else buys it.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CartDrawerState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[#B39152]/45 bg-[#FFFCF8] p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#B39152]/12 text-[#B39152]">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-4 font-serif text-2xl text-[#141D46]">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#6B625B]">
        {body}
      </p>
      {action}
    </div>
  );
}
