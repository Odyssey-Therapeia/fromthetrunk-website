"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { DrapeCardCoachmark } from "@/components/drape-room/launch/drape-card-coachmark";
import { useDrapeCoachmark } from "@/components/drape-room/launch/drape-coachmark-context";
import { DrapeCoachmarkSpotlight } from "@/components/drape-room/launch/drape-coachmark-spotlight";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
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

  /*
   * The coach mark anchors to this button rather than hunting for it in the
   * DOM, so it can never point at a control that has moved or unmounted.
   */
  const coachmark = useDrapeCoachmark();
  /*
   * State rather than a ref: the spotlight has to re-measure when the node
   * arrives, and a ref mutation would not tell it to.
   */
  const [buttonNode, setButtonNode] = useState<HTMLButtonElement | null>(null);
  const productId = product.productId;
  const viewer = useCollectionStock(productId, {
    reservedUntil: null,
    state:
      product.stockStatus === "sold"
        ? "sold"
        : product.stockStatus === "reserved"
          ? "reserved_by_other"
          : "available",
  });
  // Sold removes the trigger (below); a verdict still loading only pauses it.
  // Trying on a saree another shopper holds was always allowed.
  const availabilityDisabled = viewer.state === "checking";
  const isCoachMarked = coachmark?.claimedProductId === productId;

  const register = coachmark?.register;
  const unregister = coachmark?.unregister;
  useEffect(() => {
    if (!register || !unregister) return;
    register(productId, buttonNode);
    return () => unregister(productId);
  }, [buttonNode, productId, register, unregister]);

  const openDrapeRoom = useCallback(() => {
    if (!buttonNode || disabled || availabilityDisabled) return;
    if (onOpen) onOpen(product);
    else open(product, buttonNode);
  }, [availabilityDisabled, buttonNode, disabled, onOpen, open, product]);

  /* Stable, so the spotlight's scroll listener is not rebuilt every frame. */
  const completeCoachmark = useCallback(() => coachmark?.complete(), [coachmark]);

  if ((!enabled && !onOpen) || viewer.state === "sold") return null;

  const trigger = (
    <button
      ref={setButtonNode}
      type="button"
      aria-label={`Open Drape Room for ${product.productName}`}
      aria-haspopup="dialog"
      aria-expanded={isOpen && selectedId === product.productId}
      disabled={disabled || availabilityDisabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // Tapping the real control is the lesson learned; it must not also
        // swallow the tap the shopper meant.
        if (isCoachMarked) coachmark?.complete();
        openDrapeRoom();
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

  if (!isCoachMarked) return trigger;

  return (
    <>
      <DrapeCoachmarkSpotlight
        target={buttonNode}
        onTargetLost={completeCoachmark}
      />
      <Popover open>
        <PopoverAnchor asChild>{trigger}</PopoverAnchor>
        <DrapeCardCoachmark
          onDismiss={completeCoachmark}
          onTryThis={() => {
            coachmark?.complete();
            openDrapeRoom();
          }}
        />
      </Popover>
    </>
  );
}
