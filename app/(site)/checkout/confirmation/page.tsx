import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  type LucideIcon,
  Mail,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import {
  formatOrderShortId,
  formatOrderStatusLabel,
  formatPaymentStatusLabel,
  formatReceiptDate,
  getOrderPlacedDate,
  getShippingAddressLines,
} from "@/lib/orders/receipt-html";
import { getViewableOrder } from "@/lib/orders/viewable-order";
import type { Order, OrderItem } from "@/types/domain";
import { ClearCartOnConfirmation } from "./clear-cart-on-confirmation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: false },
};

type ConfirmationPageProps = {
  searchParams: Promise<{ key?: string; orderId?: string; payment?: string }>;
};

export default async function ConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const resolvedParams = await searchParams;
  const accessKey = resolvedParams?.key;
  const orderId = resolvedParams?.orderId;
  const paymentStatus = resolvedParams?.payment;

  // If no order ID, show generic confirmation
  if (!orderId) {
    return <GenericConfirmation />;
  }

  let order: Order | null = null;
  try {
    order = await getViewableOrder(orderId, accessKey);
  } catch (error) {
    console.error("Failed to load order confirmation", error);
  }

  if (!order) {
    return <GenericConfirmation />;
  }

  const shortOrderId = formatOrderShortId(order.id);
  const receiptHref = getReceiptHref(order.id, accessKey);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const addressLines = getShippingAddressLines(order);
  const paymentLabel = formatPaymentStatusLabel(order.paymentStatus);
  const orderStatusLabel = formatOrderStatusLabel(order.status);
  const paymentNeedsReview = paymentStatus === "review" || order.paymentStatus !== "paid";
  const placedDate = getOrderPlacedDate(order);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
      <ClearCartOnConfirmation />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-ftt-border bg-ftt-card p-6 shadow-[var(--ftt-soft-shadow)] sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ftt-gold">
                    Order confirmed
                  </p>
                  <p className="mt-1 text-sm text-ftt-burgundy/65">
                    Receipt #{shortOrderId}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="w-fit rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
              >
                {paymentLabel}
              </Badge>
            </div>

            <div className="mt-7 max-w-2xl">
              <h1 className="font-serif text-4xl leading-tight text-ftt-navy sm:text-5xl">
                We have your trunk ready.
              </h1>
              <p className="mt-4 text-base leading-7 text-ftt-burgundy/70">
                Order #{shortOrderId} has been placed successfully. We will pack
                the pieces with their order record and send tracking once dispatch
                is scheduled.
              </p>
              {paymentNeedsReview ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  We received the payment handoff and are checking the payment
                  record before dispatch.
                </p>
              ) : null}
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-full px-6">
                <a href={receiptHref} download>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  Download receipt
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-full border-ftt-border bg-ftt-ivory px-6 text-ftt-navy"
              >
                <Link href="/account/orders">View orders</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 rounded-full px-6 text-ftt-burgundy"
              >
                <Link href="/collection">Continue shopping</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatusTile
              icon={PackageCheck}
              label="Order status"
              value={orderStatusLabel}
              helper="Your order has entered the packing queue."
            />
            <StatusTile
              icon={ShieldCheck}
              label="Payment"
              value={paymentLabel}
              helper={paymentNeedsReview ? "Manual check in progress." : "Payment is recorded."}
            />
            <StatusTile
              icon={Truck}
              label="Dispatch"
              value={order.trackingNumber ? "Tracking added" : "Awaiting tracking"}
              helper={order.trackingCarrier || "Tracking details will follow."}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-ftt-navy">
                <Truck aria-hidden="true" className="h-4 w-4 text-ftt-gold" />
                <h2 className="font-serif text-2xl">Delivery details</h2>
              </div>
              <Separator className="my-4 bg-ftt-border" />
              <div className="space-y-1 text-sm leading-6 text-ftt-burgundy/70">
                {addressLines.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-ftt-navy">
                <Mail aria-hidden="true" className="h-4 w-4 text-ftt-gold" />
                <h2 className="font-serif text-2xl">Contact and record</h2>
              </div>
              <Separator className="my-4 bg-ftt-border" />
              <dl className="space-y-3 text-sm">
                <DetailRow label="Email" value={order.shippingEmail || "Not provided"} />
                <DetailRow label="Phone" value={order.shippingPhone || "Not provided"} />
                <DetailRow label="Placed" value={formatReceiptDate(placedDate)} />
                <DetailRow label="Shipping" value={order.shippingMethod || "Standard"} />
              </dl>
            </section>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-6 lg:sticky lg:top-28">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ftt-gold">
                Receipt summary
              </p>
              <h2 className="mt-1 font-serif text-2xl text-ftt-navy">
                Order #{shortOrderId}
              </h2>
            </div>
            <ReceiptText aria-hidden="true" className="h-6 w-6 text-ftt-burgundy/50" />
          </div>

          <div className="mt-5 rounded-2xl border border-ftt-border bg-ftt-ivory/70 p-4">
            <div className="flex items-center justify-between text-sm text-ftt-burgundy/70">
              <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span>{formatReceiptDate(placedDate)}</span>
            </div>
            <Separator className="my-4 bg-ftt-border" />
            <div className="space-y-4">
              {order.items?.map((item: OrderItem) => (
                <div key={item.id} className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-ftt-burgundy ring-1 ring-ftt-border">
                    <ShoppingBag aria-hidden="true" className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-5 text-ftt-navy">{item.name}</p>
                    <p className="mt-1 text-xs text-ftt-burgundy/60">
                      Qty {item.quantity} x {formatCurrency(item.pricePaise / 100)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ftt-navy">
                    {formatCurrency((item.pricePaise * item.quantity) / 100)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <Separator className="my-5 bg-ftt-border" />
          <dl className="space-y-3 text-sm">
            <TotalRow label="Subtotal" value={formatCurrency(order.subtotalPaise / 100)} />
            <TotalRow label="Shipping" value={formatCurrency(order.shippingCostPaise / 100)} />
            <TotalRow label="GST" value={formatCurrency(order.taxAmountPaise / 100)} />
            {order.discountCode ? (
              <TotalRow label="Discount code" value={order.discountCode} />
            ) : null}
            <div className="flex items-center justify-between border-t border-ftt-border pt-4 text-lg font-semibold text-ftt-navy">
              <dt>Total paid</dt>
              <dd>{formatCurrency(order.totalPaise / 100)}</dd>
            </div>
          </dl>

          <Button asChild className="mt-6 h-11 w-full rounded-full">
            <a href={receiptHref} download>
              <Download aria-hidden="true" className="h-4 w-4" />
              Download full receipt
            </a>
          </Button>
        </aside>
      </section>
    </div>
  );
}

function GenericConfirmation() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-ftt-gold">
          Order confirmed
        </p>
        <h1 className="mt-3 font-serif text-4xl text-ftt-navy">
          Your treasure is reserved
        </h1>
        <p className="mt-3 text-sm leading-6 text-ftt-burgundy/70">
          A confirmation email with tracking details will follow shortly.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="h-11 rounded-full px-8">
          <Link href="/account/orders">View orders</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-full px-8">
          <Link href="/collection">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

function getReceiptHref(orderId: string, accessKey?: string) {
  const params = new URLSearchParams({ orderId });
  if (accessKey) params.set("key", accessKey);
  return `/checkout/confirmation/receipt?${params.toString()}`;
}

type StatusTileProps = {
  helper: string;
  icon: LucideIcon;
  label: string;
  value: string;
};

function StatusTile({ helper, icon: Icon, label, value }: StatusTileProps) {
  return (
    <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ftt-gold/12 text-ftt-burgundy">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-gold">
        {label}
      </p>
      <h2 className="mt-1 text-base font-semibold text-ftt-navy">{value}</h2>
      <p className="mt-2 text-sm leading-6 text-ftt-burgundy/65">{helper}</p>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ftt-burgundy/55">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-ftt-navy">{value}</dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-ftt-burgundy/70">
      <dt>{label}</dt>
      <dd className="font-medium text-ftt-navy">{value}</dd>
    </div>
  );
}
