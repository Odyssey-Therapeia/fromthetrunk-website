"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { CartItem } from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
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

export function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const previousTotalItems = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const removeItem = useCartStore((state) => state.removeItem);
  const { subtotal, totalItems } = getCartTotals(items);
  const canCheckout = hasHydrated && items.length > 0;
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

  useEffect(() => {
    const handleCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ quantity?: number }>).detail;

      if ((detail?.quantity ?? 1) > 0) {
        setNowMs(Date.now());
        setOpen(true);
      }
    };

    window.addEventListener("ftt:cart-updated", handleCartUpdated);

    return () => {
      window.removeEventListener("ftt:cart-updated", handleCartUpdated);
    };
  }, []);

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

    if (previousTotalItems.current === null) {
      previousTotalItems.current = totalItems;
      return;
    }

    if (totalItems > previousTotalItems.current) {
      setOpen(true);
    }

    previousTotalItems.current = totalItems;
  }, [hasHydrated, totalItems]);

  const itemLabel =
    !hasHydrated || totalItems === 0
      ? "Your bag is empty"
      : `${totalItems} ${totalItems === 1 ? "piece" : "pieces"} in your bag`;

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
          ? `${totalItems} item${totalItems !== 1 ? "s" : ""} in your bag, subtotal ${formatCurrency(subtotal)}`
          : "Your bag is empty"}
      </div>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-[#601D1C] hover:bg-[#B39152]/10 hover:text-[#141D46]"
          aria-label={`View cart${hasHydrated && totalItems > 0 ? `, ${totalItems} items` : ""}`}
          data-ftt-cart-target
        >
          <ShoppingBag className="h-7 w-7" strokeWidth={2.4} />
          {hasHydrated && totalItems > 0 ? (
            <span
              data-ftt-cart-count
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-[#B39152]/70 bg-[#141D46] px-1 text-[10px] font-medium text-[#FDF7F1]"
              aria-hidden="true"
            >
              {totalItems}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 border-l border-[#E7DDD4] bg-[#FDF7F1] p-0 text-[#0E0D0E] shadow-[0_24px_80px_rgba(20,29,70,0.22)] sm:max-w-[480px]">
        <div className="border-b border-[#E7DDD4] bg-[#FFFCF8] px-5 pb-5 pt-6">
          <SheetHeader className="text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#B39152]">
              From the trunk
            </p>
            <div className="flex items-end justify-between gap-4 pr-8">
              <SheetTitle className="shrink-0 font-serif text-3xl font-medium leading-none text-[#141D46]">
                Shopping Bag
              </SheetTitle>
              <div className="flex min-w-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                <span className="rounded-full border border-[#B39152]/45 bg-[#B39152]/10 px-3 py-1 text-xs font-medium text-[#141D46]">
                  {hasHydrated ? itemLabel : "Loading"}
                </span>
                {hasHydrated && cartHoldLabel ? (
                  <CartHoldTimerBadge label={cartHoldLabel} />
                ) : null}
              </div>
            </div>
          </SheetHeader>

          <motion.div
            {...softEnterMotion}
            className="mt-5 rounded-2xl border border-[#B39152]/25 bg-[#141D46] p-4 text-[#FDF7F1]"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#B39152]/18 text-[#B39152]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Your trunk is protected.</p>
                <p className="mt-1 text-xs leading-5 text-[#FDF7F1]/70">
                  Authenticated pieces, secure packing, and shipping confirmed
                  at checkout.
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!hasHydrated ? (
            <CartDrawerState
              title="Opening your trunk..."
              body="We are loading your saved selection."
            />
          ) : items.length === 0 ? (
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
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.div
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
                    <CartItem item={item} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <motion.div
          {...softEnterMotion}
          className="border-t border-[#E7DDD4] bg-[#FFFCF8]/95 px-5 py-5 shadow-[0_-18px_50px_rgba(20,29,70,0.08)] backdrop-blur"
        >
          <div className="mb-4 grid grid-cols-3 gap-2">
            <CartPromise icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              Verified
            </CartPromise>
            <CartPromise icon={<PackageCheck className="h-3.5 w-3.5" />}>
              Packed
            </CartPromise>
            <CartPromise icon={<LockKeyhole className="h-3.5 w-3.5" />}>
              Secure
            </CartPromise>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6B625B]">Subtotal</span>
            <span className="font-semibold text-[#141D46]">
              {hasHydrated ? formatCurrency(subtotal) : "—"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#6B625B]">
            Shipping, taxes, and final availability are confirmed at checkout.
          </p>

          {canCheckout ? (
            <Button
              asChild
              className="mt-5 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] hover:bg-[#0E0D0E]"
            >
              <Link href="/checkout" onClick={() => setOpen(false)}>
                Proceed to Checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              className="mt-5 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1]"
              disabled
            >
              Proceed to Checkout
            </Button>
          )}

          <Button
            asChild
            variant="outline"
            className="mt-3 h-11 w-full rounded-full border-[#B39152]/45 bg-transparent text-[#601D1C] hover:bg-[#B39152]/10 hover:text-[#601D1C]"
          >
            <Link href="/collection" onClick={() => setOpen(false)}>
              Continue Shopping
            </Link>
          </Button>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

function formatCartHoldTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function CartHoldTimerBadge({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`Reservation hold ends in ${label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#141D46]/20 bg-[#141D46] px-3 py-1 text-xs font-semibold text-[#FDF7F1] shadow-[0_10px_24px_rgba(20,29,70,0.14)] outline-none transition hover:bg-[#1D285C] focus-visible:ring-2 focus-visible:ring-[#B39152]/70"
          >
            <LockKeyhole className="h-3.5 w-3.5 text-[#B39152]" />
            <span className="tabular-nums">Hold {label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
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
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="mt-4 font-serif text-2xl text-[#141D46]">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#6B625B]">
        {body}
      </p>
      {action}
    </div>
  );
}

function CartPromise({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-2 py-2 text-[11px] font-medium text-[#141D46]">
      <span className="text-[#B39152]">{icon}</span>
      {children}
    </div>
  );
}
