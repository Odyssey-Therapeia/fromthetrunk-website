"use client";

/**
 * The single restock-notification control.
 *
 * Signed-out shoppers go through the shared commerce email + OTP dialog. The
 * verified account email is then used by the server; this component never
 * asks for, stores, or submits an address of its own.
 */

import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";
import { Button } from "@/components/ui/button";
import {
  readViewerProductState,
  type ViewerProductDisplayState,
} from "@/lib/commerce/viewer-state";
import {
  announceViewerState,
  commerceViewerKey,
} from "@/lib/commerce/viewer-state-bus";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";

interface RestockNotifyButtonProps {
  productId: string;
  productName: string;
  className?: string;
  /** Server-rendered seed, replaced by the shared viewer-state batch. */
  initialViewerState?: ViewerProductDisplayState;
  /** Called when the server reports the piece came back during the request. */
  onBecameAvailable?: () => void;
}

/** Keep the control readable independently of the active admin theme tokens. */
export const notifyButtonClass =
  "w-full rounded-full border border-[#601D1C]/30 bg-[#FDF7F1] text-[#601D1C] shadow-sm transition-colors hover:border-[#601D1C] hover:bg-[#601D1C] hover:text-[#FDF7F1] focus-visible:ring-[#B39152] disabled:opacity-100";

/** The same pinned palette, quietened once the email is registered. */
export const notifyRegisteredButtonClass =
  "border-[#601D1C]/20 bg-[#601D1C]/8 text-[#601D1C]/70 hover:bg-[#601D1C]/8 hover:text-[#601D1C]/70";

type NotifyRefusalCode =
  | "NOTIFY_NOT_ELIGIBLE"
  | "NOTIFY_OWN_HOLD"
  | "PRODUCT_AVAILABLE"
  | "PRODUCT_SOLD";

/*
 * Each refusal says what is true about the piece now. "Try again" asked the
 * shopper to repeat a request that could not succeed.
 */
const NOTIFY_REFUSAL_COPY: Record<
  NotifyRefusalCode,
  { description?: string; title: string; tone: "message" | "success" }
> = {
  NOTIFY_NOT_ELIGIBLE: {
    description: "It is offered only while another shopper holds the piece.",
    title: "Notify me is not open for this piece",
    tone: "message",
  },
  NOTIFY_OWN_HOLD: {
    description: "It is held for you, so there is nothing to wait for.",
    title: "This piece is already in your bag",
    tone: "message",
  },
  PRODUCT_AVAILABLE: {
    description: "It is back in the collection — you can add it to your bag.",
    title: "This piece is available now",
    tone: "success",
  },
  PRODUCT_SOLD: {
    title: "This piece has found its next wardrobe.",
    tone: "message",
  },
};

const isNotifyRefusalCode = (code: unknown): code is NotifyRefusalCode =>
  typeof code === "string" &&
  Object.prototype.hasOwnProperty.call(NOTIFY_REFUSAL_COPY, code);

/**
 * Handle a refused Notify me registration.
 *
 * The refusal carries the server's verdict, so every surface drawing this
 * piece is corrected at once rather than at the next poll. Returns false for
 * anything that is not a known refusal, which callers still report as a
 * failure worth retrying.
 */
export function applyNotifyRefusal({
  payload,
  productId,
  userId,
}: {
  payload: { code?: string; viewerState?: unknown } | null;
  productId: string;
  userId: string;
}): boolean {
  const code = payload?.code;
  if (!isNotifyRefusalCode(code)) return false;

  const state = readViewerProductState(payload?.viewerState);
  if (state) {
    announceViewerState({
      productId,
      reservedUntil: null,
      state,
      viewerKey: commerceViewerKey("authenticated", userId),
    });
  }

  const copy = NOTIFY_REFUSAL_COPY[code];
  toast[copy.tone](
    copy.title,
    copy.description ? { description: copy.description } : undefined,
  );
  return true;
}

export function RestockNotifyButton(props: RestockNotifyButtonProps) {
  const sessionState = useSession();

  return (
    <RestockNotifyButtonForViewer
      key={`${sessionState.data?.user?.id ?? "anonymous"}:${props.productId}`}
      {...props}
      sessionState={sessionState}
    />
  );
}

function RestockNotifyButtonForViewer({
  productId,
  productName,
  className,
  initialViewerState = "checking",
  onBecameAvailable,
  sessionState,
}: RestockNotifyButtonProps & {
  sessionState: ReturnType<typeof useSession>;
}) {
  const { data: session, status } = sessionState;
  const commerceAuth = useCommerceAuth();
  const attemptRef = useRef(0);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const viewer = useCollectionStock(productId, {
    reservedUntil: null,
    state: initialViewerState,
  });

  const register = async () => {
    const initiatingUserId = session?.user?.id;
    const attempt = ++attemptRef.current;
    setPending(true);
    try {
      const response = await fetch("/api/v2/wishlist/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The verified email and user id come from the server session.
        body: JSON.stringify({ productId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        viewerState?: unknown;
      } | null;

      if (
        attempt !== attemptRef.current ||
        initiatingUserId == null ||
        useCartStore.getState().presentationUserId !== initiatingUserId
      ) {
        return;
      }

      if (response.ok) {
        setSubmitted(true);
        toast.success("We'll email you if this piece becomes available.");
        return;
      }

      // The hold can lapse, sell or turn out to be this shopper's own between
      // rendering and the click.
      if (
        applyNotifyRefusal({ payload, productId, userId: initiatingUserId })
      ) {
        if (payload?.code === "PRODUCT_AVAILABLE") onBecameAvailable?.();
        return;
      }

      toast.error("Unable to register. Please try again.");
    } catch {
      if (
        attempt === attemptRef.current &&
        initiatingUserId != null &&
        useCartStore.getState().presentationUserId === initiatingUserId
      ) {
        toast.error("Unable to register. Please try again.");
      }
    } finally {
      if (attempt === attemptRef.current) setPending(false);
    }
  };

  const handleClick = () => {
    if (pending || submitted || status === "loading") return;

    if (!session?.user?.id) {
      if (!commerceAuth) {
        toast.error("Please sign in to request an availability email.");
        return;
      }
      commerceAuth.requireAuth({
        productId,
        source: "product",
        type: "notify-me",
      });
      return;
    }

    void register();
  };

  // Notify me answers another shopper's hold and nothing else: never a sold
  // piece, the shopper's own bag, or a verdict that has not arrived.
  if (viewer.state !== "reserved_by_other") return null;

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        notifyButtonClass,
        submitted && notifyRegisteredButtonClass,
        className,
      )}
      disabled={pending || submitted || status === "loading"}
      onClick={handleClick}
      aria-label={
        submitted
          ? `Availability email registered for ${productName}`
          : `Notify me when ${productName} becomes available`
      }
    >
      <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
      {submitted ? "Notify registered" : pending ? "Registering…" : "Notify me"}
    </Button>
  );
}
