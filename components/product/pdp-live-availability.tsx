"use client";

/**
 * The product page's stock badge and availability notice, from the live
 * verdict.
 *
 * Both were server-rendered from the product row alone. The shopper holding a
 * saree therefore read "reserved by another buyer" right beside their own
 * "In bag", and neither changed when the piece was released, claimed or sold
 * while the page stayed open. The markup and classes are the page's own; only
 * the source of the answer moved.
 */

import { Badge } from "@/components/ui/badge";
import type { ViewerProductDisplayState } from "@/lib/commerce/viewer-state";
import {
  useCollectionStock,
  type CollectionStockEntry,
} from "@/lib/realtime/use-collection-stock";

export type PdpStockStatus = "available" | "reserved" | "sold";

type PdpAvailabilityProps = {
  /** What the server rendered; also the answer until a verdict arrives. */
  initialStatus: PdpStockStatus;
  productId: string;
};

/**
 * The badge states a fact about the piece: it is held, whoever holds it. The
 * shopper's own hold therefore keeps the very "Reserved" badge the server
 * rendered, class for class.
 */
function toPdpBadgeStatus(
  viewer: CollectionStockEntry,
  initialStatus: PdpStockStatus,
): PdpStockStatus {
  switch (viewer.state) {
    case "sold":
      return "sold";
    // A made-to-order blouse in the bag carries no hold, so nothing about the
    // piece is reserved. Only a line the verdict holds until a time is.
    case "in_my_cart":
      return viewer.reservedUntil != null ? "reserved" : "available";
    case "payment_pending":
    case "reserved_by_other":
      return "reserved";
    case "available":
      return "available";
    // No trusted verdict yet: keep what the server rendered.
    default:
      return initialStatus;
  }
}

/**
 * The notice speaks to the shopper. Only someone else's hold may read
 * "reserved by another buyer"; the holder reads the available-style copy.
 */
function toPdpNoticeStatus(
  state: ViewerProductDisplayState,
  initialStatus: PdpStockStatus,
): PdpStockStatus {
  switch (state) {
    case "sold":
      return "sold";
    case "reserved_by_other":
      return "reserved";
    case "available":
    case "in_my_cart":
    case "payment_pending":
      return "available";
    // No trusted verdict yet: keep what the server rendered.
    default:
      return initialStatus;
  }
}

function usePdpViewerState({
  initialStatus,
  productId,
}: PdpAvailabilityProps): CollectionStockEntry {
  return useCollectionStock(productId, {
    reservedUntil: null,
    state:
      initialStatus === "sold"
        ? "sold"
        : initialStatus === "reserved"
          ? "reserved_by_other"
          : "available",
  });
}

export function PdpStockBadge(props: PdpAvailabilityProps) {
  const stockStatus = toPdpBadgeStatus(
    usePdpViewerState(props),
    props.initialStatus,
  );
  const label =
    stockStatus === "available"
      ? "In stock"
      : stockStatus === "reserved"
        ? "Reserved"
        : "Sold";

  return (
    <Badge
      className={
        stockStatus === "available"
          ? "rounded-full border border-[#141D46]/15 bg-[#141D46]/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#141D46] shadow-none"
          : "rounded-full border border-[#601D1C]/20 bg-[#601D1C]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#601D1C] shadow-none"
      }
    >
      {label}
    </Badge>
  );
}

export function PdpAvailabilityNotice({
  availableCopy,
  reservedCopy,
  soldCopy,
  ...props
}: PdpAvailabilityProps & {
  availableCopy: string;
  reservedCopy: string;
  soldCopy: string;
}) {
  const stockStatus = toPdpNoticeStatus(
    usePdpViewerState(props).state,
    props.initialStatus,
  );

  if (stockStatus === "available") {
    return <p className="text-xs leading-5 text-[#141D46]/58">{availableCopy}</p>;
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#601D1C]/16 bg-[#601D1C]/5 p-3">
      <p className="text-xs leading-5 text-[#601D1C]/75">
        {stockStatus === "sold" ? soldCopy : reservedCopy}
      </p>
    </div>
  );
}
