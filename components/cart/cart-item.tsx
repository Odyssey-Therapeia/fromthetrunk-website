"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/formatters";
import { type CartItem as CartItemType, useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";

interface CartItemProps {
  item: CartItemType;
  className?: string;
}

export function CartItem({ item, className }: CartItemProps) {
  const removeItem = useCartStore((state) => state.removeItem);
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const href = item.slug ? `/collection/${item.slug}` : "/collection";
  const reservedUntilLabel = formatReservationExpiry(item.reservedUntil);

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
            <Image
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

              <p className="mt-2 text-sm font-semibold text-[#141D46]">
                {formatCurrency(item.price * quantity)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                removeItem(item.id);
                toast(`${item.name} removed from your bag`);
              }}
              aria-label={`Remove ${item.name} from bag`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C] transition hover:border-[#601D1C]/45 hover:bg-[#601D1C]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E7DDD4] pt-3">
            <span className="rounded-full bg-[#B39152]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141D46]">
              Reserved for you
            </span>

            <span className="text-right text-xs text-[#6B625B]">
              {reservedUntilLabel ?? "Ready for checkout"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
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
