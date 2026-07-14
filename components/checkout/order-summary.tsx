"use client";

import Image from "next/image";
import Link from "next/link";
import { Info, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { getSelectedSizeLabel } from "@/lib/catalog/blouse-size-chart";
import type { OneOfOneConflictCopy } from "@/lib/checkout/one-of-one-conflict-copy";
import { formatCurrency } from "@/lib/formatters";
import type { ShippingMethod } from "@/lib/config/order-pricing";
import type { CartItem } from "@/lib/store/cart-store";

export type DiscountState = {
  code: string;
  onCodeChange: (value: string) => void;
  applied: { code: string; amountPaise: number } | null;
  error: string | null;
  isValidating: boolean;
  onApply: () => void;
  onRemove: () => void;
};

type OrderSummaryProps = {
  items: CartItem[];
  subtotal: number;
  shippingMethod: ShippingMethod;
  shippingCost: number;
  taxAmount: number;
  taxRateLabel: string;
  total: number;
  discount: DiscountState;
  onRemoveItem: (id: string) => void;
  conflict?: OneOfOneConflictCopy | null;
  disabled?: boolean;
  error?: string | null;
};

// LAUNCH: the order summary now shows a flat "Shipping — Free" line instead of
// the paid packaging tier, so the packaging label is unused. Kept for restore.
// const packagingLabel = (method: ShippingMethod) =>
//   method === "express" ? "Premium Trunk Packaging" : "Normal Care Packaging";

/** The persistent order manifest shown beside every checkout step. */
export function OrderSummary({
  items,
  subtotal,
  // shippingMethod — unused while shipping is a flat free line (kept in props).
  shippingCost,
  taxAmount,
  taxRateLabel,
  total,
  conflict,
  discount,
  onRemoveItem,
  disabled,
  error,
}: OrderSummaryProps) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-ftt-border bg-ftt-card shadow-[var(--ftt-soft-shadow)]">
        <header className="border-b border-ftt-border bg-ftt-ivory px-6 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
            Your trunk
          </p>
          <h3 className="mt-1 font-serif text-2xl text-ftt-navy">
            Order summary
          </h3>
        </header>

        <div className="space-y-6 p-6">
          <ul className="space-y-5">
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ftt-border bg-ftt-ivory">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={80}
                      height={80}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-[8px] uppercase tracking-widest text-ftt-burgundy/50">
                      No image
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <p className="break-words text-sm font-semibold text-ftt-navy">
                    {item.name}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-widest text-ftt-burgundy/50">
                    Qty {item.quantity}
                  </p>
                  {getSelectedSizeLabel(item.selectedOptions) ? (
                    <p className="mt-1 text-xs font-semibold text-ftt-navy/70">
                      {getSelectedSizeLabel(item.selectedOptions)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-ftt-burgundy">
                    {formatCurrency(item.price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  disabled={disabled}
                  aria-label={`Remove ${item.name}`}
                  title="Remove item"
                  className="grid size-7 shrink-0 place-items-center self-start rounded-full border border-ftt-border bg-ftt-ivory text-ftt-burgundy/50 transition hover:border-ftt-burgundy/40 hover:text-ftt-burgundy disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="h-px bg-ftt-border" />

          <DiscountField discount={discount} disabled={disabled} />

          <div className="h-px bg-ftt-border" />

          <dl className="space-y-3 text-sm">
            <Row label="Subtotal" value={formatCurrency(subtotal)} />
            {discount.applied ? (
              <Row
                label={`Discount (${discount.applied.code})`}
                value={`-${formatCurrency(discount.applied.amountPaise / 100)}`}
                accent
              />
            ) : null}
            {/* LAUNCH: shipping is free. Original paid packaging row kept for restore:
              <Row
                label={packagingLabel(shippingMethod)}
                value={shippingCost === 0 ? "Complimentary" : formatCurrency(shippingCost)}
              /> */}
            <div className="flex min-w-0 items-center justify-between gap-4">
              <dt className="flex min-w-0 items-center gap-1.5 break-words text-ftt-burgundy/60">
                Shipping
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Estimated delivery time"
                        className="grid size-4 shrink-0 place-items-center rounded-full text-ftt-burgundy/45 transition hover:text-ftt-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold/40"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[13rem] border-none bg-ftt-burgundy text-center font-medium leading-5 text-ftt-ivory">
                      Your order will be delivered in 7 to 10 days.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </dt>
              <dd className="shrink-0 text-right font-medium text-ftt-navy">
                {shippingCost === 0 ? "Free" : formatCurrency(shippingCost)}
              </dd>
            </div>
            {/* LAUNCH: GST removed — row stays hidden while taxAmount is 0
                (ENABLE_GST off). Reappears automatically if GST is re-enabled. */}
            {taxAmount > 0 ? (
              <Row
                label={`Estimated GST (${taxRateLabel})`}
                value={formatCurrency(taxAmount)}
              />
            ) : null}
          </dl>

          <div className="h-px bg-ftt-border" />

          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="font-serif text-lg text-ftt-navy">Total</span>
            <span className="shrink-0 text-right font-serif text-3xl text-ftt-burgundy">
              {formatCurrency(total)}
            </span>
          </div>

          {conflict ? (
            <div
              aria-live="polite"
              className="rounded-2xl border border-ftt-burgundy/20 bg-ftt-burgundy/8 p-4 text-sm text-ftt-burgundy"
            >
              <p className="font-serif text-base text-ftt-navy">
                {conflict.title}
              </p>
              <p className="mt-2 leading-6 text-ftt-burgundy/75">
                {conflict.message}
              </p>
              {conflict.ctaHref ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-3 border-ftt-burgundy/30 bg-ftt-ivory text-ftt-burgundy hover:bg-ftt-burgundy hover:text-ftt-ivory"
                >
                  <Link href={conflict.ctaHref}>{conflict.ctaLabel}</Link>
                </Button>
              ) : null}
            </div>
          ) : error ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <p className="text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/50">
            Secure checkout via Razorpay
          </p>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-3xl border border-ftt-gold/15 bg-ftt-gold/8 p-6">
        <ShieldCheck className="size-7 shrink-0 text-ftt-burgundy" />
        <div className="space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy">
            FTT Buyer Assurance
          </h4>
          <p className="text-xs leading-relaxed text-ftt-burgundy/70">
            Every piece is authenticated and protected in transit. Payment is
            handled securely by Razorpay. We never see your card details.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 justify-between gap-4">
      <dt className={accent ? "min-w-0 break-words text-ftt-gold" : "min-w-0 break-words text-ftt-burgundy/60"}>
        {label}
      </dt>
      <dd
        className={
          accent
            ? "shrink-0 text-right font-semibold text-ftt-gold"
            : "shrink-0 text-right font-medium text-ftt-navy"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function DiscountField({
  discount,
  disabled,
}: {
  discount: DiscountState;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        Discount code
      </p>
      {discount.applied ? (
        <div className="flex items-center justify-between rounded-xl border border-ftt-gold/30 bg-ftt-gold/8 px-4 py-3">
          <div>
            <span className="font-mono text-xs font-semibold tracking-widest text-ftt-gold">
              {discount.applied.code}
            </span>
            <p className="mt-0.5 text-[10px] text-ftt-gold/80">
              Saving {formatCurrency(discount.applied.amountPaise / 100)}
            </p>
          </div>
          <button
            type="button"
            onClick={discount.onRemove}
            className="text-[10px] uppercase tracking-widest text-ftt-burgundy/50 underline underline-offset-2 hover:text-ftt-burgundy"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 gap-2">
          <Input
            value={discount.code}
            onChange={(event) => discount.onCodeChange(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") discount.onApply();
            }}
            placeholder="Enter code"
            disabled={disabled || discount.isValidating}
            className="min-w-0 rounded-xl border-ftt-border bg-ftt-ivory font-mono text-sm uppercase text-ftt-navy focus-visible:ring-ftt-gold/20"
          />
          <Button
            type="button"
            variant="outline"
            onClick={discount.onApply}
            disabled={!discount.code.trim() || discount.isValidating || disabled}
            className="shrink-0 rounded-xl border-ftt-gold/45 text-ftt-burgundy hover:bg-ftt-gold/10 hover:text-ftt-burgundy"
          >
            <span className="text-[10px] uppercase tracking-widest">
              {discount.isValidating ? "..." : "Apply"}
            </span>
          </Button>
        </div>
      )}
      {discount.error ? (
        <p className="text-xs font-medium text-destructive">{discount.error}</p>
      ) : null}
    </div>
  );
}
