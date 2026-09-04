"use client";

import { Sparkles } from "lucide-react";

import type { DrapeSaree } from "@/lib/drape-room/product";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import { cn } from "@/lib/utils";

export interface DrapeRoomTriggerProps {
  product: DrapeSaree;
  className?: string;
  disabled?: boolean;
  /** Isolated UI tests may inject open without mounting the portal host. */
  onOpen?: (product: DrapeSaree) => void;
}

export function DrapeRoomTrigger({
  product,
  className,
  disabled = false,
  onOpen,
}: DrapeRoomTriggerProps) {
  const enabled = useDrapeRoomOperationalStore(
    (state) => state.drapeUiAvailable,
  );
  const open = useDrapeRoomOperationalStore((state) => state.open);
  const isOpen = useDrapeRoomOperationalStore((state) => state.isOpen);
  const selectedId = useDrapeRoomOperationalStore(
    (state) => state.selectedSaree?.productId,
  );

  if (!enabled && !onOpen) return null;

  return (
    <button
      type="button"
      aria-label={`Open Drape Room for ${product.productName}`}
      aria-haspopup="dialog"
      aria-expanded={isOpen && selectedId === product.productId}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (onOpen) onOpen(product);
        else open(product, event.currentTarget);
      }}
      className={cn(
        "group/drape inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-0 overflow-hidden rounded-full border border-ftt-navy/20 bg-ftt-ivory px-3 text-ftt-navy shadow-[0_8px_20px_rgba(20,29,70,0.16)] transition-[background-color,border-color,color,gap] motion-reduce:transition-none hover:gap-2 hover:border-ftt-navy hover:bg-ftt-navy hover:text-ftt-ivory focus-visible:gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      <span className="max-w-0 whitespace-nowrap text-xs font-semibold opacity-0 transition-[max-width,opacity] motion-reduce:transition-none group-hover/drape:max-w-24 group-hover/drape:opacity-100 group-focus-visible/drape:max-w-24 group-focus-visible/drape:opacity-100">
        Drape Room
      </span>
    </button>
  );
}
