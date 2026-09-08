"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";

import { trackEvent } from "@/lib/analytics/track";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";
import type { DrapeLaunchTeaserProps } from "./drape-launch-teaser";
import { useDrapeLaunchTrigger } from "./use-drape-launch-trigger";

const LazyDrapeLaunchTeaser = dynamic<DrapeLaunchTeaserProps>(
  () => import("./drape-launch-teaser").then((module) => module.DrapeLaunchTeaser),
  { ssr: false, loading: () => null },
);

/**
 * Catalogue teaser.
 *
 * No saree has been chosen here, so this runs the product-less variant of the
 * card and its CTA simply moves the shopper to the grid, where every eligible
 * card carries its own Drape Room trigger. Dwell is the only trigger: scroll
 * and gallery belong to the product page.
 *
 * It shares one session key with the product-page teaser, so a visitor is
 * shown the campaign at most once per browser tab across both surfaces.
 */
export function DrapeLaunchCollectionEntry() {
  const drapeUiAvailable = useDrapeRoomOperationalStore(
    (state) => state.drapeUiAvailable,
  );

  const onAutoOpen = useCallback(() => {
    trackEvent("drape_teaser_auto_open", {
      trigger: "timer",
      surface: "collection",
    });
  }, []);

  const { isOpen, dismiss } = useDrapeLaunchTrigger({
    enabled: drapeUiAvailable,
    dwellMs: drapeLaunchConfig.trigger.collectionDwellMs,
    onAutoOpen,
  });

  const handleDismiss = useCallback(() => {
    trackEvent("drape_teaser_dismiss", { surface: "collection" });
    dismiss();
  }, [dismiss]);

  const handlePrimary = useCallback(() => {
    trackEvent("drape_teaser_primary_click", { surface: "collection" });
    dismiss();
    // Same-document jump to the grid; no route change, no history entry lost.
    document
      .querySelector(drapeLaunchConfig.collectionGridHref)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [dismiss]);

  if (!drapeUiAvailable || !isOpen) return null;

  return (
    <LazyDrapeLaunchTeaser
      open={isOpen}
      onDismiss={handleDismiss}
      onPrimary={handlePrimary}
    />
  );
}
