"use client";

/**
 * The verdict a mutation just proved, delivered to every surface at once.
 *
 * The collection grid polls a batched endpoint every ten seconds. That is the
 * right cadence for other shoppers' claims and the wrong one for the shopper's
 * own click: a removal that had already been confirmed by the server still
 * left the card behind the drawer reading "In bag" until the next tick,
 * because the poll that would have corrected it was the very thing being
 * waited on.
 *
 * An event rather than a context, because the surfaces that need telling —
 * collection cards, a product page, the Drape Room — do not share a provider,
 * and the mutation that knows the answer runs in a hook with no path to them.
 */

import {
  readViewerProductState,
  type ViewerProductDisplayState,
} from "@/lib/commerce/viewer-state";

export const VIEWER_STATE_EVENT = "ftt:viewer-state";

export type ViewerStateAnnouncement = {
  productId: string;
  reservedUntil: null | string;
  /**
   * readViewerStateSequence() as the request behind this verdict left. A
   * stamped verdict yields to any announcement for the same saree made after
   * that point. The shopper's own mutation leaves it out: its answer is the
   * newest word on that saree the moment it lands.
   */
  sentAtSequence?: number;
  state: ViewerProductDisplayState;
  /** The authenticated account for which the server proved this verdict. */
  viewerKey: string;
};

/*
 * One forward-only counter for every viewer-state request and announcement on
 * the page. It lives here rather than in a provider because the requests that
 * read it — the grid's poll and the checkout's preflight — do not share one.
 */
let viewerStateSequence = 0;

/** Read immediately before a viewer-state request leaves. */
export const readViewerStateSequence = (): number => viewerStateSequence;

/** Moved by a provider as it applies an announcement; returns that stamp. */
export const advanceViewerStateSequence = (): number => {
  viewerStateSequence += 1;
  return viewerStateSequence;
};

export const commerceViewerKey = (
  status: string,
  userId: null | string,
): string =>
  status === "authenticated" && userId ? `user:${userId}` : status;

export function announceViewerState(
  announcement: ViewerStateAnnouncement,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ViewerStateAnnouncement>(VIEWER_STATE_EVENT, {
      detail: announcement,
    }),
  );
}

export function subscribeToViewerState(
  listener: (announcement: ViewerStateAnnouncement) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handle = (event: Event) => {
    const detail = (event as CustomEvent<Partial<ViewerStateAnnouncement>>)
      .detail;
    if (
      !detail ||
      typeof detail.productId !== "string" ||
      typeof detail.viewerKey !== "string"
    ) {
      return;
    }
    // Anyone can dispatch a window event. Only a parsed server verdict, or the
    // explicit non-buyable placeholder, may reach a card.
    const state =
      detail.state === "checking"
        ? "checking"
        : readViewerProductState(detail.state);
    if (!state) return;

    listener({
      productId: detail.productId,
      reservedUntil:
        typeof detail.reservedUntil === "string" ? detail.reservedUntil : null,
      // A stamp that is not a number proves no freshness, so the verdict is
      // taken as an unstamped one.
      ...(typeof detail.sentAtSequence === "number" &&
      Number.isFinite(detail.sentAtSequence)
        ? { sentAtSequence: detail.sentAtSequence }
        : {}),
      state,
      viewerKey: detail.viewerKey,
    });
  };

  window.addEventListener(VIEWER_STATE_EVENT, handle);
  return () => window.removeEventListener(VIEWER_STATE_EVENT, handle);
}
