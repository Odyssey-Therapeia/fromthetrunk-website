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
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

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
import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import { formatCurrency } from "@/lib/formatters";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tokens and mappings — the two things you may need to edit.
// ---------------------------------------------------------------------------

// Point this at whatever CartDeliveryEstimateCard derives its range from, so
// the drawer and the full bag page never disagree.
const DELIVERY_ESTIMATE_LABEL = "7 to 10 days";

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
  const previousTotalItems = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const removeItem = useCartStore((state) => state.removeItem);
  const { savingsPaise, subtotal, totalItems } = getCartTotals(items);
  const canCheckout = hasHydrated && items.length > 0;

  // savingsPaise is in paise; subtotal is already in rupees.
  const savings = savingsPaise / 100;
  const originalTotal = subtotal + savings;
  const hasSavings = hasHydrated && savingsPaise > 0;

  const lastAvailabilityCheckRef = useRef(0);
  const hasReservedCartItem = items.some((item) => Boolean(item.reservedUntil));
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

  const recheckCartAvailability = useCallback(async () => {
    if (!hasHydrated || items.length === 0) return;
    lastAvailabilityCheckRef.current = Date.now();

    for (const item of items) {
      if (item.reservedUntil && new Date(item.reservedUntil).getTime() <= Date.now()) {
        toast.error(getAvailabilityErrorMessage("RESERVATION_EXPIRED"));
        removeItem(item.id);
        continue;
      }

      if (!item.slug) continue;

      const response = await fetch(`/api/v2/products/${encodeURIComponent(item.slug)}/stock`, {
        headers: { Accept: "application/json" },
      }).catch(() => null);
      if (!response?.ok) continue;

      const stock = (await response.json().catch(() => null)) as {
        reservedUntil?: null | string;
        stockStatus?: "available" | "reserved" | "sold";
      } | null;
      if (!stock) continue;

      if (stock.stockStatus === "sold") {
        toast.error(getAvailabilityErrorMessage("PRODUCT_SOLD"));
        removeItem(item.id);
        continue;
      }

      const heldByAnotherBuyer =
        stock.stockStatus === "reserved" &&
        (!item.reservedUntil ||
          !stock.reservedUntil ||
          Math.abs(
            new Date(stock.reservedUntil).getTime() -
              new Date(item.reservedUntil).getTime(),
          ) > 1000);
      if (heldByAnotherBuyer) {
        toast.error(getAvailabilityErrorMessage("PRODUCT_RESERVED"));
        removeItem(item.id);
      }
    }
  }, [hasHydrated, items, removeItem]);

  useEffect(() => {
    if (!open) return;
    void recheckCartAvailability();
  }, [open, recheckCartAvailability]);

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

    void recheckCartAvailability();
  }, [
    earliestReservationExpiresAt,
    hasHydrated,
    open,
    recheckCartAvailability,
    reservationRemainingMs,
  ]);

  useEffect(() => {
    const handleFocus = () => {
      if (!open) return;
      if (Date.now() - lastAvailabilityCheckRef.current < 60_000) return;
      void recheckCartAvailability();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [open, recheckCartAvailability]);

  useEffect(() => {
    if (!hasHydrated) return;

    // First post-hydration pass only records the baseline, so a persisted cart
    // restored on page load never pops the drawer open.
    if (previousTotalItems.current === null) {
      previousTotalItems.current = totalItems;
      return;
    }

    // Opens on an increase only — removals and re-renders leave it closed.
    if (totalItems > previousTotalItems.current) {
      setNowMs(Date.now());
      setOpen(true);
    }

    previousTotalItems.current = totalItems;
  }, [hasHydrated, totalItems]);

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
                title="Opening your trunk..."
                body="We are loading your saved selection."
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
                      onRemove={removeItem}
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
              icon={<Truck className="h-4 w-4 text-[#9A8C82]" aria-hidden="true" />}
            >
              <span className="text-[#6B625B]">Estimated delivery</span>
              <span className="block text-[#141D46]">{DELIVERY_ESTIMATE_LABEL}</span>
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
  onRemove,
}: {
  item: CartLineFields;
  onRemove: (id: string) => void;
}) {
  const name = item.name ?? "Untitled piece";
  const price = item.price ?? 0;
  const fabric = readFabric(item);
  const originalPrice = readOriginalPrice(item);
  const showOriginal = originalPrice > price;
  const heldUntil = item.reservedUntil ? formatHoldUntil(item.reservedUntil) : null;

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
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${name} from your bag`}
            className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[#9A8C82] transition hover:bg-[#601D1C]/8 hover:text-[#601D1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
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

        {heldUntil ? (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#B39152]/12 px-2 py-0.5 text-[10px] text-[#6B625B]">
            <LockKeyhole className="h-3 w-3 text-[#B39152]" aria-hidden="true" />
            Held for you until {heldUntil}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StripCell({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-3 text-center text-[11px] leading-4">
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