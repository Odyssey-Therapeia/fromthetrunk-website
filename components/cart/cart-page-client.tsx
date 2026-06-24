"use client";

import type { ReactNode } from "react";
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
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { CartItem } from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types/domain";

interface CartPageClientProps {
  featuredPicks: Product[];
}

export function CartPageClient({ featuredPicks }: CartPageClientProps) {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const { subtotal, totalItems } = getCartTotals(items);
  const canCheckout = hasHydrated && items.length > 0;
  const shouldReduceMotion = useReducedMotion();
  const softEnterMotion: MotionProps = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 8 },
        transition: { duration: 0.3, ease: "easeOut" },
      };

  return (
    <main className="min-h-screen bg-[#FDF7F1] text-[#0E0D0E]">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
        <section className="overflow-hidden rounded-[2rem] border border-[#E7DDD4] bg-[#141D46] shadow-[0_18px_55px_rgba(20,29,70,0.16)] lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="bg-[linear-gradient(135deg,#141D46_0%,#10183B_62%,#601D1C_150%)] p-6 text-[#FDF7F1] sm:p-8 lg:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#B39152]">
              Shopping Bag
            </p>

            <h1 className="mt-5 max-w-3xl font-serif text-[clamp(3rem,7vw,6.5rem)] font-medium leading-[0.92] text-[#FDF7F1]">
              Your trunk selection.
            </h1>

            <p className="mt-5 max-w-xl text-sm leading-7 text-[#FDF7F1]/72 sm:text-base">
              Review the pieces you have chosen before checkout. Each saree is
              authenticated, packed with care, and sent with its story intact.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <CartHeroStat label="Pieces">
                {hasHydrated ? totalItems : "—"}
              </CartHeroStat>
              <CartHeroStat label="Subtotal">
                {hasHydrated ? formatCurrency(subtotal) : "—"}
              </CartHeroStat>
              <CartHeroStat label="Promise">Verified</CartHeroStat>
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#FDF7F1] p-5 lg:border-l lg:border-t-0">
            <div className="flex h-full min-h-[260px] flex-col justify-between rounded-[1.5rem] border border-[#B39152]/35 bg-[#FFFCF8] p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
                  Trunk assurance
                </p>
                <h2 className="mt-3 font-serif text-3xl leading-none text-[#141D46]">
                  Not pre-owned. Re-storied.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#6B625B]">
                  A final review before your heirloom continues its next life.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <AssuranceRow icon={<ShieldCheck className="h-4 w-4" />}>
                  Authentication checked
                </AssuranceRow>
                <AssuranceRow icon={<PackageCheck className="h-4 w-4" />}>
                  Secure trunk packing
                </AssuranceRow>
                <AssuranceRow icon={<LockKeyhole className="h-4 w-4" />}>
                  Checkout protected
                </AssuranceRow>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem] md:items-start lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[#E7DDD4] bg-[#FFFCF8] p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
                  Review
                </p>
                <h2 className="mt-1 font-serif text-3xl text-[#141D46]">
                  {hasHydrated && totalItems > 0
                    ? `${totalItems} ${totalItems === 1 ? "piece" : "pieces"} selected`
                    : "Your bag"}
                </h2>
              </div>

              <Button
                asChild
                variant="outline"
                className="rounded-full border-[#B39152]/45 bg-transparent text-[#601D1C] hover:bg-[#B39152]/10 hover:text-[#601D1C]"
              >
                <Link href="/collection">Continue Shopping</Link>
              </Button>
            </div>

            {!hasHydrated ? (
              <CartPageState
                title="Opening your trunk..."
                body="We are loading your saved selection."
              />
            ) : items.length === 0 ? (
              <>
                <CartPageState
                  title="Your bag is empty."
                  body="Begin with a one-of-one piece from the current collection."
                  action={
                    <Button
                      asChild
                      className="mt-5 rounded-full bg-[#141D46] px-6 text-[#FDF7F1] hover:bg-[#0E0D0E]"
                    >
                      <Link href="/collection">Explore the collection</Link>
                    </Button>
                  }
                />

                {featuredPicks.length > 0 ? (
                  <section className="rounded-[1.5rem] border border-[#E7DDD4] bg-[#FFFCF8] p-5">
                    <div className="mb-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
                        Featured Picks
                      </p>
                      <h2 className="mt-1 font-serif text-3xl text-[#141D46]">
                        Begin with something rare
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#6B625B]">
                        Handpicked pieces to start your trunk.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {featuredPicks.slice(0, 4).map((product, index) => (
                        <FeaturedPick
                          key={product.id}
                          product={product}
                          index={index}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
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
                            initial: { opacity: 0, y: 10 },
                            animate: { opacity: 1, y: 0 },
                            exit: { opacity: 0, y: 8 },
                            transition: {
                              duration: 0.26,
                              delay: index * 0.04,
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

          <OrderSummaryPanel
            hasHydrated={hasHydrated}
            canCheckout={canCheckout}
            subtotal={subtotal}
            totalItems={totalItems}
            motionProps={softEnterMotion}
          />
        </section>
      </div>
    </main>
  );
}

function OrderSummaryPanel({
  hasHydrated,
  canCheckout,
  subtotal,
  totalItems,
  motionProps,
}: {
  hasHydrated: boolean;
  canCheckout: boolean;
  subtotal: number;
  totalItems: number;
  motionProps: MotionProps;
}) {
  return (
    <motion.aside
      {...motionProps}
      className="sticky top-24 rounded-[1.75rem] border border-[#E7DDD4] bg-[#FFFCF8] p-5 shadow-[0_18px_50px_rgba(20,29,70,0.10)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#B39152]">
            Summary
          </p>
          <h2 className="mt-1 font-serif text-3xl text-[#141D46]">
            Order summary
          </h2>
        </div>

        <div className="grid h-11 w-11 place-items-center rounded-full bg-[#141D46] text-[#FDF7F1]">
          <ShoppingBag className="h-5 w-5" />
        </div>
      </div>

      <Separator className="my-5 bg-[#E7DDD4]" />

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[#6B625B]">Pieces</span>
          <span className="font-medium text-[#141D46]">
            {hasHydrated ? totalItems : "—"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#6B625B]">Subtotal</span>
          <span className="font-semibold text-[#141D46]">
            {hasHydrated ? formatCurrency(subtotal) : "—"}
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#B39152]/25 bg-[#B39152]/10 p-4">
        <p className="text-sm font-medium text-[#141D46]">
          Authentication is included.
        </p>
        <p className="mt-1 text-xs leading-5 text-[#6B625B]">
          Shipping and taxes are calculated at checkout.
        </p>
      </div>

      {canCheckout ? (
        <Button
          asChild
          className="mt-6 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] hover:bg-[#0E0D0E]"
        >
          <Link href="/checkout">
            Proceed to Checkout
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button
          className="mt-6 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1]"
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
        <Link href="/collection">Continue Shopping</Link>
      </Button>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <SummaryPromise icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          Verified
        </SummaryPromise>
        <SummaryPromise icon={<PackageCheck className="h-3.5 w-3.5" />}>
          Packed
        </SummaryPromise>
        <SummaryPromise icon={<LockKeyhole className="h-3.5 w-3.5" />}>
          Secure
        </SummaryPromise>
      </div>
    </motion.aside>
  );
}

function CartHeroStat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/9 p-4 backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[#FDF7F1]/55">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl text-[#FDF7F1]">{children}</p>
    </div>
  );
}

function AssuranceRow({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-2 text-sm font-medium text-[#141D46]">
      <span className="text-[#B39152]">{icon}</span>
      {children}
    </div>
  );
}

function SummaryPromise({
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

function CartPageState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-[#B39152]/45 bg-[#FFFCF8] p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#B39152]/12 text-[#B39152]">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="mt-5 font-serif text-3xl text-[#141D46]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B625B]">
        {body}
      </p>
      {action}
    </div>
  );
}

function FeaturedPick({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const image = resolveMediaURL(product.images?.[0]);

  return (
    <Link
      href={`/collection/${product.slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-[#E7DDD4] bg-[#FDF7F1] p-3 transition hover:-translate-y-0.5 hover:border-[#B39152]/60 hover:shadow-[0_12px_32px_rgba(20,29,70,0.10)]"
    >
      <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-[#601D1C]/10">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="96px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-[#6B625B]">
            FTT
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
          Pick {String(index + 1).padStart(2, "0")}
        </p>
        <p className="mt-1 line-clamp-2 font-serif text-lg leading-tight text-[#141D46]">
          {product.name}
        </p>
        <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-[#6B625B]">
          {product.detailsFabric ?? "Heirloom"}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#141D46]">
          {formatCurrency(product.pricePaise / 100)}
        </p>
      </div>
    </Link>
  );
}
