"use client";

import { useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";

import { trackEvent } from "@/lib/analytics/track";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { cn } from "@/lib/utils";
import type { DrapeLaunchTeaserProps } from "./drape-launch-teaser";
import { useDrapeLaunchTrigger } from "./use-drape-launch-trigger";

/**
 * The teaser owns ~2 MB of animated AVIF, so its chunk is never part of the
 * product page's initial load — it is requested only when the teaser opens.
 */
const LazyDrapeLaunchTeaser = dynamic<DrapeLaunchTeaserProps>(
  () => import("./drape-launch-teaser").then((module) => module.DrapeLaunchTeaser),
  { ssr: false, loading: () => null },
);

export interface DrapeLaunchProductEntryProps {
  product: DrapeSaree;
  /** Distinct gallery indices viewed so far, from the gallery's own callback. */
  viewedGalleryCount: number;
  className?: string;
}

/**
 * Product-page Drape Room launch entry: owns the auto-open triggers, the
 * persistent button, and the hand-off into the real Drape Room.
 *
 * Rendered only on eligible saree PDPs. The Drape Room itself is a global
 * store-driven modal, so the CTA calls the existing `open(product)` action
 * rather than routing anywhere — the saree arrives already selected.
 */
export function DrapeLaunchProductEntry({
  product,
  viewedGalleryCount,
  className,
}: DrapeLaunchProductEntryProps) {
  const drapeUiAvailable = useDrapeRoomOperationalStore(
    (state) => state.drapeUiAvailable,
  );
  const openDrapeRoom = useDrapeRoomOperationalStore((state) => state.open);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onAutoOpen = useCallback(
    (trigger: "gallery" | "scroll" | "timer") => {
      trackEvent("drape_teaser_auto_open", {
        trigger,
        product_slug: product.productSlug,
      });
    },
    [product.productSlug],
  );

  const { isOpen, showPersistentButton, openManually, dismiss } =
    useDrapeLaunchTrigger({
      enabled: drapeUiAvailable && Boolean(product.productId),
      viewedGalleryCount,
      onAutoOpen,
    });

  const handleDismiss = useCallback(() => {
    trackEvent("drape_teaser_dismiss", { product_slug: product.productSlug });
    dismiss();
  }, [dismiss, product.productSlug]);

  const handlePrimary = useCallback(() => {
    trackEvent("drape_teaser_primary_click", {
      product_slug: product.productSlug,
    });
    dismiss();
    openDrapeRoom(product, buttonRef.current);
  }, [dismiss, openDrapeRoom, product]);

  const handlePersistentClick = useCallback(() => {
    trackEvent("drape_persistent_button_click", {
      product_slug: product.productSlug,
    });
    trackEvent("drape_teaser_manual_open", {
      product_slug: product.productSlug,
    });
    openManually();
  }, [openManually, product.productSlug]);

  if (!drapeUiAvailable) return null;

  return (
    <>
      {showPersistentButton ? (
        <button
          ref={buttonRef}
          type="button"
          data-ftt-drape-persistent
          onClick={handlePersistentClick}
          aria-haspopup="dialog"
          aria-label={`Open The Drape Room for ${product.productName}`}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ftt-navy/20 bg-ftt-card px-4 text-sm font-semibold text-ftt-navy transition hover:border-ftt-navy hover:bg-ftt-navy hover:text-ftt-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold focus-visible:ring-offset-2",
            className,
          )}
        >
          <Sparkles aria-hidden="true" className="size-4 shrink-0" />
          Drape Room
        </button>
      ) : null}

      {/* The chunk is requested at first open. Staying mounted afterwards lets
          the close animation finish and makes a manual reopen instant. */}
      {isOpen || showPersistentButton ? (
        <LazyDrapeLaunchTeaser
          open={isOpen}
          product={product}
          onDismiss={handleDismiss}
          onPrimary={handlePrimary}
        />
      ) : null}
    </>
  );
}
