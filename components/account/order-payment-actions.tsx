"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/cart-store";

type PaymentStatus = "failed" | "paid" | "pending" | "refunded" | null | undefined;

type ReorderPreviewItem = {
  productId: string | null;
  slug: string | null;
  name: string;
  pricePaise: number;
  image: string | null;
  selectedOptions?: Record<string, boolean | null | number | string>;
  available: boolean;
};

/**
 * Repay / Reorder controls for an unpaid order.
 *  - pending → warning + Repay (money may be in transit; no reorder — pieces are
 *    still reserved to this order).
 *  - failed  → Repay + Reorder (re-add the still-available one-of-one pieces).
 * Repay re-surfaces the order's existing (server-priced) Razorpay payment link.
 * Reorder reuses the standard /api/v2/cart/reserve flow — no reservation logic here.
 */
export function OrderPaymentActions({
  orderId,
  paymentStatus,
  compact = false,
}: {
  orderId: string;
  paymentStatus: PaymentStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [repaying, setRepaying] = useState(false);
  const [reordering, setReordering] = useState(false);

  // Nothing to do for settled orders.
  if (paymentStatus === "paid" || paymentStatus === "refunded") return null;

  const isFailed = paymentStatus === "failed";

  const handleRepay = async () => {
    if (repaying || reordering) return;
    setRepaying(true);
    try {
      const res = await fetch(`/api/v2/payments/orders/${orderId}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        paymentLinkUrl?: string;
      };
      if (!res.ok) {
        toast.error(data.message || "Unable to start payment. Please try again.");
        return;
      }
      if (data.paymentLinkUrl) {
        window.location.assign(data.paymentLinkUrl);
        return;
      }
      toast.error("Payment link unavailable. Please reorder the pieces.");
    } catch {
      toast.error("Unable to start payment. Please try again.");
    } finally {
      setRepaying(false);
    }
  };

  const handleReorder = async () => {
    if (repaying || reordering) return;
    setReordering(true);
    try {
      const res = await fetch(`/api/v2/orders/${orderId}/reorder-preview`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { items?: ReorderPreviewItem[] };
      const items = data.items ?? [];
      if (items.length === 0) {
        toast.error("Nothing to reorder.");
        return;
      }

      let added = 0;
      let skipped = 0;
      for (const item of items) {
        if (!item.available || !item.productId || !item.slug) {
          skipped += 1;
          continue;
        }
        try {
          const reserve = await fetch("/api/v2/cart/reserve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: item.productId, quantity: 1 }),
          });
          const payload = (await reserve.json().catch(() => ({}))) as {
            reservationToken?: string;
            reservedUntil?: string;
          };
          if (!reserve.ok) {
            skipped += 1;
            continue;
          }
          const size =
            typeof item.selectedOptions?.size === "string"
              ? item.selectedOptions.size
              : undefined;
          addItem({
            id: item.productId,
            name: item.name,
            price: item.pricePaise / 100,
            image: item.image ?? "",
            slug: item.slug,
            reservationToken: payload.reservationToken ?? null,
            reservedUntil: payload.reservedUntil ?? null,
            ...(size ? { selectedOptions: { size } } : {}),
          });
          added += 1;
        } catch {
          skipped += 1;
        }
      }

      if (added > 0) {
        toast.success(
          skipped > 0
            ? `${added} added to your bag · ${skipped} no longer available`
            : `${added} added to your bag`,
        );
        router.push("/cart");
      } else {
        toast.error("These pieces are no longer available.");
      }
    } catch {
      toast.error("Unable to reorder. Please try again.");
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {isFailed ? (
        <p className="flex items-start gap-2 text-xs leading-5 text-[#601D1C]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Payment failed for this order. Repay to complete it, or reorder the available pieces.</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-[#B39152]/25 bg-[#B39152]/8 px-3 py-2 text-xs leading-5 text-[#601D1C]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B39152]" aria-hidden="true" />
          <span>
            Payment not completed. If any amount was debited it will be auto-refunded —
            please wait for it to reflect in your account before retrying.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleRepay}
          disabled={repaying || reordering}
          className="rounded-full text-[#FDF7F1]"
          size={compact ? "sm" : "default"}
        >
          {repaying ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CreditCard className="h-4 w-4" aria-hidden="true" />
          )}
          Repay
        </Button>

        {isFailed ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleReorder}
            disabled={repaying || reordering}
            className="rounded-full"
            size={compact ? "sm" : "default"}
          >
            {reordering ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Reorder
          </Button>
        ) : null}
      </div>
    </div>
  );
}
