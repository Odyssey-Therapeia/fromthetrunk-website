"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, Package, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/formatters";
import { formatSelectedOptions } from "@/lib/orders/selected-options";
import type { Order, OrderItem } from "@/types/domain";

const fetchOrders = async () => {
  const response = await fetch("/api/v2/orders");
  if (!response.ok) {
    throw new Error("Unable to load orders.");
  }
  return (await response.json()) as Order[];
};

type OrdersTab = "successful" | "attention";

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled: Boolean(session?.user?.id),
  });

  if (status === "loading") {
    return <OrderState message="Loading your trunk history..." />;
  }

  if (!session?.user?.id) {
    return (
      <OrderState message="Please sign in to view your orders.">
        <Button asChild className="mt-4 rounded-full bg-ftt-navy text-ftt-ivory">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </OrderState>
    );
  }

  const orders = data ?? [];
  const successfulOrders = orders.filter((order) => order.paymentStatus === "paid");
  const attentionOrders = orders.filter((order) => order.paymentStatus !== "paid");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.35fr)] lg:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
            Orders
          </p>
          <h2 className="mt-2 font-serif text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.94] text-ftt-navy">
            Your trunk history.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ftt-burgundy/60">
            Review purchases, payment status, and the sarees that have already
            found their next wardrobe.
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-ftt-border bg-ftt-card p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-gold">
            Total trunks
          </p>
          <p className="mt-2 font-serif text-4xl leading-none text-ftt-navy">
            {orders.length}
          </p>
        </div>
      </div>

      {isLoading ? (
        <OrderState message="Loading orders..." />
      ) : isError ? (
        <OrderState message="Unable to load orders right now." />
      ) : orders.length === 0 ? (
        <div className="ftt-account-glow-card overflow-hidden rounded-[1.75rem] border border-ftt-border bg-ftt-card shadow-[0_18px_50px_rgba(20,29,70,0.09)]">
          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
            <div>
              <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ftt-gold">
                First trunk
              </Badge>
              <h3 className="mt-5 font-serif text-[clamp(2rem,4vw,3.8rem)] leading-none text-ftt-navy">
                Your first trunk is waiting.
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-ftt-burgundy/60">
                Start with a restored saree that feels personal, considered,
                and ready for its next story.
              </p>
              <Button
                asChild
                className="mt-6 rounded-full bg-ftt-navy px-7 text-ftt-ivory hover:bg-ftt-midnight"
              >
                <Link href="/collection">Explore the collection</Link>
              </Button>
            </div>

            <div className="hidden rounded-[1.5rem] bg-ftt-navy p-5 text-ftt-ivory md:block">
              <ShoppingBag className="size-6 text-ftt-gold" />
              <p className="mt-12 font-serif text-3xl leading-tight">
                Unique pieces, packed with care.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <OrdersTabs
          attentionOrders={attentionOrders}
          successfulOrders={successfulOrders}
        />
      )}
    </div>
  );
}

function OrdersTabs({
  attentionOrders,
  successfulOrders,
}: {
  attentionOrders: Order[];
  successfulOrders: Order[];
}) {
  const tabs: Array<{
    count: number;
    emptyMessage: string;
    label: string;
    orders: Order[];
    value: OrdersTab;
  }> = [
    {
      count: successfulOrders.length,
      emptyMessage: "Paid orders will appear here once payment is confirmed.",
      label: "Successful",
      orders: successfulOrders,
      value: "successful",
    },
    {
      count: attentionOrders.length,
      emptyMessage: "No unpaid or failed orders right now.",
      label: "Unpaid / failed",
      orders: attentionOrders,
      value: "attention",
    },
  ];

  return (
    <Tabs defaultValue="successful" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-2 rounded-full border border-ftt-border bg-ftt-card p-1 text-ftt-burgundy/60 shadow-sm sm:inline-grid sm:w-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="min-h-11 rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy/60 data-[state=active]:bg-ftt-navy data-[state=active]:text-ftt-ivory data-[state=active]:shadow-sm sm:px-5 sm:text-[11px] sm:tracking-[0.18em]"
          >
            <span className="truncate">{tab.label}</span>
            <span className="ml-2 rounded-full bg-ftt-gold/15 px-2 py-0.5 text-[10px] text-ftt-gold">
              {tab.count}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {tab.orders.length > 0 ? (
            <div className="space-y-4">
              {tab.orders.map((order, index) => (
                <OrderTimelineCard
                  key={order.id}
                  order={order}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <OrderState message={tab.emptyMessage} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function OrderTimelineCard({ order, index }: { order: Order; index: number }) {
  const items = order.items ?? [];
  const statusLabel = humanize(order.status);
  const paymentLabel = humanize(order.paymentStatus);

  return (
    <Link
      href={`/account/orders/${order.id}`}
      className="ftt-account-glow-card group block rounded-[1.5rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_58px_rgba(20,29,70,0.12)]"
    >
      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
        <div className="flex items-center gap-3 md:block">
          <div className="grid size-11 place-items-center rounded-full bg-ftt-navy text-ftt-gold">
            <Package className="size-4" />
          </div>
          <div className="md:mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-gold">
              Trunk {String(index + 1).padStart(2, "0")}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-ftt-navy px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-ftt-ivory">
              {statusLabel}
            </Badge>
            <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-ftt-gold">
              {paymentLabel}
            </Badge>
          </div>

          <h3 className="mt-4 font-serif text-3xl leading-tight text-ftt-navy">
            Order {order.id.slice(0, 8)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ftt-burgundy/58">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="size-4 text-ftt-gold" />
              {formatOrderDate(order.placedAt ?? order.createdAt)}
            </span>
            <span>{items.length} piece{items.length === 1 ? "" : "s"}</span>
          </div>

          {items.length > 0 ? (
            <>
              <Separator className="my-4 bg-ftt-border" />
              <div className="space-y-2">
                {items.slice(0, 3).map((item: OrderItem, itemIndex: number) => (
                  <div
                    key={`${order.id}-${item.id ?? itemIndex}`}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ftt-navy">
                        {item.name}
                      </span>
                      {formatSelectedOptions(item.selectedOptions) ? (
                        <span className="block text-xs font-semibold text-ftt-navy/65">
                          {formatSelectedOptions(item.selectedOptions)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-ftt-burgundy/58">
                      {item.quantity} x {formatCurrency(item.pricePaise / 100)}
                    </span>
                  </div>
                ))}
                {items.length > 3 ? (
                  <p className="text-xs text-ftt-burgundy/45">
                    + {items.length - 3} more item{items.length - 3 === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 md:block md:text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-gold">
              Total
            </p>
            <p className="mt-1 text-lg font-semibold text-ftt-navy">
              {formatCurrency(order.totalPaise / 100)}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ftt-burgundy transition group-hover:text-ftt-navy md:mt-8">
            View
            <ArrowUpRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function OrderState({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ftt-border bg-ftt-card p-6 text-sm leading-6 text-ftt-burgundy/60 shadow-sm">
      {message}
      {children}
    </div>
  );
}

function humanize(value: string | null | undefined) {
  return String(value ?? "pending")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatOrderDate(value: Date | string | null | undefined) {
  if (!value) return "Date pending";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
