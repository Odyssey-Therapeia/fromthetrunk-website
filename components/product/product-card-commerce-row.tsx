"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import { trackWebsiteMetric } from "@/lib/analytics/client";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { isBlouseProduct } from "@/lib/products/product-type";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/domain";

type ProductCardCommerceProduct = Product & {
  availability?: boolean | null;
  availableForSale?: boolean | null;
  isSold?: boolean | null;
  inventoryCount?: number | null;
  rating?: number | null;
  ratingAverage?: number | null;
  reviewCount?: number | null;
  ratingCount?: number | null;
  ratingsCount?: number | null;
};

type AddState =
  | "idle"
  | "scrambling"
  | "sealing"
  | "flying"
  | "added"
  | "error";

const SCRAMBLE_GLYPHS = "FTTTRUNKSAREEWEAVEKANCHIHERITAGE0123456789";
const SCRAMBLE_MS = 780;
const SEAL_INTO_BAG_MS = 1250;
const FLY_TO_CART_MS = 1450;
const BADGE_SYNC_MS = 720;
const ADDED_HOLD_MS = 1900;
const ERROR_HOLD_MS = 2100;
const subscribeToMountedState = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export function ProductCardCommerceRow({
  product,
  className,
  cartEndpoint = "/api/v2/cart/reserve",
  idleLabel = "Add to bag",
  compactLabel = "+ Cart",
}: {
  product: ProductCardCommerceProduct;
  className?: string;
  /** Set this when a server reservation endpoint should run before local cart commit. */
  cartEndpoint?: string | null;
  /** Brand-forward label. Use compactLabel for smaller cards if desired. */
  idleLabel?: string;
  /** Kept available because your collection card currently uses “+ Cart”. */
  compactLabel?: string;
}) {
  const hasMounted = useSyncExternalStore(
    subscribeToMountedState,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const [state, setState] = useState<AddState>("idle");
  const [label, setLabel] = useState(compactLabel);
  const addItem = useCartStore((store) => store.addItem);
  const removeItem = useCartStore((store) => store.removeItem);
  const hasHydrated = useCartStore((store) => store.hasHydrated);
  const hasCartItem = useCartStore((store) => store.hasItem(product.id));
  const inCart = hasMounted && hasHydrated && hasCartItem;
  const isBlouse = isBlouseProduct(product);
  const rafRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const labelRef = useRef(compactLabel);
  const setMotionLabel = (nextLabel: string) => {
    labelRef.current = nextLabel;
    setLabel(nextLabel);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  const stockText = String(product.status ?? product.stockStatus ?? "")
    .trim()
    .toLowerCase();

  const isReserved = stockText.includes("reserved");
  const isUnavailable =
    Boolean(product.isSold) ||
    stockText.includes("sold") ||
    isReserved ||
    product.availability === false ||
    product.availableForSale === false ||
    product.inventoryCount === 0;
  const analyticsStockStatus = isReserved
    ? "reserved"
    : isUnavailable
      ? "sold"
      : "available";

  const rating = normalizeRating(
    product.ratingAverage ??
      product.rating ??
      metadataNumber(product.metadata, "ratingAverage") ??
      metadataNumber(product.metadata, "rating"),
  );
  const reviewCount = firstNumber(
    product.reviewCount,
    product.ratingCount,
    product.ratingsCount,
    metadataNumber(product.metadata, "reviewCount"),
    metadataNumber(product.metadata, "ratingCount"),
    metadataNumber(product.metadata, "ratingsCount"),
  );

  const scrambleTo = (nextLabel: string, duration = SCRAMBLE_MS) =>
    new Promise<void>((resolve) => {
      if (prefersReducedMotion()) {
        setMotionLabel(nextLabel);
        resolve();
        return;
      }

      const from = labelRef.current;
      const length = Math.max(from.length, nextLabel.length);
      const start = performance.now();

      const frame = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const reveal = Math.floor(easeOutCubic(progress) * length);

        let next = "";
        for (let index = 0; index < length; index += 1) {
          if (index <= reveal) {
            next += nextLabel[index] ?? "";
          } else if (index < from.length || index < nextLabel.length) {
            next += SCRAMBLE_GLYPHS[
              Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
            ];
          }
        }

        setMotionLabel(next.trimEnd());

        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(frame);
        } else {
          setMotionLabel(nextLabel);
          resolve();
        }
      };

      rafRef.current = window.requestAnimationFrame(frame);
    });

  const handleAddToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isUnavailable || inCart || state !== "idle") return;

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);

    const button = event.currentTarget;
    const sourceCard = getSourceProductCard(button);
    sourceCard?.setAttribute("data-ftt-cart-border", "running");
    const reduceMotion = prefersReducedMotion();
    const idleText = compactLabel || idleLabel;
    const reservePromise = reserveProductIfNeeded(product.id, cartEndpoint)
      .then((reservation) => ({
        error: null as Error | null,
        reservation,
      }))
      .catch((error: Error) => ({ error, reservation: null }));

    try {
      setState("scrambling");
      await scrambleTo("Sealing", reduceMotion ? 1 : SCRAMBLE_MS);

      setState("sealing");
      if (!reduceMotion) {
        await wait(SEAL_INTO_BAG_MS);
      }

      const reserveResult = await reservePromise;
      if (reserveResult.error) throw reserveResult.error;

      setState("flying");
      setMotionLabel("To trunk");

      if (shouldFlyThumbnail()) {
        await animateProductThumbnailToCart(button, FLY_TO_CART_MS);
      } else {
        await wait(reduceMotion ? 0 : BADGE_SYNC_MS);
      }

      addItem({
        id: product.id,
        name: product.name,
        price: product.pricePaise / 100,
        image: resolveMediaURL(product.images?.[0]) ?? "",
        slug: product.slug,
        detailsFabric: product.detailsFabric ?? null,
        reservationToken: reserveResult.reservation?.reservationToken ?? null,
        reservedUntil: reserveResult.reservation?.reservedUntil ?? null,
      });
      trackWebsiteMetric("add_to_cart", {
        pricePaise: product.pricePaise,
        productId: product.id,
        slug: product.slug,
        source: "product_card",
        stockStatus: analyticsStockStatus,
      });

      dispatchCartUpdated(product.id, 1);
      const cartTarget = getCartTarget();
      if (cartTarget) pulseCartTarget(cartTarget);

      setState("added");
      setMotionLabel("In bag");
      sourceCard?.setAttribute("data-ftt-cart-border", "added");

      resetTimerRef.current = window.setTimeout(() => {
        setState("idle");
      }, ADDED_HOLD_MS);
    } catch (error) {
      sourceCard?.setAttribute("data-ftt-cart-border", "error");
      setState("error");
      setMotionLabel("Try again");
      toast.error(
        error instanceof Error
          ? error.message
          : "This piece is no longer available.",
      );

      resetTimerRef.current = window.setTimeout(() => {
        setState("idle");
        setMotionLabel(idleText);
        sourceCard?.removeAttribute("data-ftt-cart-border");
      }, ERROR_HOLD_MS);
    }
  };

  const handleRemoveFromCart = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceCard = getSourceProductCard(event.currentTarget);
    sourceCard?.removeAttribute("data-ftt-cart-border");

    if (!inCart) return;

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);

    removeItem(product.id);
    dispatchCartUpdated(product.id, -1);
    const cartTarget = getCartTarget();
    if (cartTarget && !prefersReducedMotion()) pulseCartTarget(cartTarget);

    setState("idle");
    setMotionLabel(compactLabel || idleLabel);
  };

  const buttonLabel = isUnavailable
    ? isReserved
      ? "Reserved"
      : "Sold"
    : inCart || state === "added"
      ? "In bag"
      : label;
  const dataPhase = isUnavailable
    ? "unavailable"
    : inCart || state === "added"
      ? "added"
      : state;

  return (
    <div
      className={cn(
        "mt-3 flex min-h-12 min-w-0 items-center justify-between gap-2 border-t border-[#E7DDD4]/80 pt-3 @sm:min-h-[3.25rem] @sm:gap-2.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1 text-xs font-medium text-[#141D46]">
        {rating !== null ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[#B39152]" aria-hidden="true">
              ★
            </span>
            <span className="text-[#141D46]">{rating.toFixed(1)}</span>
            {typeof reviewCount === "number" && reviewCount > 0 ? (
              <span className="hidden truncate text-[#6B625B] @sm:inline">
                · {reviewCount.toLocaleString("en-IN")}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="inline-flex max-w-full items-center rounded-full border border-[#B39152]/35 bg-[#B39152]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#601D1C] shadow-[0_8px_18px_rgba(179,145,82,0.14)] @sm:text-xs">
            New arrival
          </span>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        {isBlouse && !isUnavailable && !inCart ? (
          <Link
            href={`/collection/${product.slug}`}
            className="inline-flex h-9 min-w-[104px] max-w-full items-center justify-center rounded-full bg-[#141D46] px-4 text-[13px] font-medium text-[#FDF7F1] shadow-[0_8px_20px_rgba(20,29,70,0.16)] transition hover:bg-[#0E0D0E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] @sm:min-w-[116px] @sm:text-sm"
            onClick={(event) => event.stopPropagation()}
          >
            Select size
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isUnavailable || inCart || state !== "idle"}
            data-phase={dataPhase}
            aria-live="polite"
            className={cn(
              "ftt-cart-motion-button inline-flex h-9 min-w-[104px] max-w-full items-center justify-center rounded-full px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] @sm:min-w-[116px] @sm:text-sm",
              isUnavailable
                ? "cursor-not-allowed bg-[#601D1C] text-[#FDF7F1] opacity-90"
                : inCart || state === "added"
                  ? "border border-[#B39152] bg-[#601D1C] text-[#FDF7F1] shadow-[0_8px_20px_rgba(96,29,28,0.16)]"
                  : state === "error"
                    ? "bg-[#601D1C] text-[#FDF7F1]"
                    : "bg-[#141D46] text-[#FDF7F1] shadow-[0_8px_20px_rgba(20,29,70,0.16)] hover:bg-[#0E0D0E]",
            )}
          >
            <span className="ftt-motion-bag" aria-hidden="true">
              <BagIcon />
            </span>
            <span className="ftt-motion-garment" aria-hidden="true">
              <MiniSareeIcon />
            </span>
            <span className="ftt-motion-label">{buttonLabel}</span>
          </button>
        )}

        {inCart ? (
          <button
            type="button"
            onClick={handleRemoveFromCart}
            aria-label={`Remove ${product.name} from bag`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#B39152]/70 bg-[#FDF7F1] text-[#601D1C] shadow-[0_6px_16px_rgba(96,29,28,0.10)] transition hover:border-[#601D1C]/55 hover:bg-[#601D1C]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function normalizeRating(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;

  return Math.max(0, Math.min(5, value));
}

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function metadataNumber(
  metadata: Product["metadata"],
  key: string,
): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSourceProductCard(source: HTMLElement): HTMLElement | null {
  return source.closest<HTMLElement>("[data-ftt-product-card]");
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldFlyThumbnail(): boolean {
  if (typeof window === "undefined") return false;
  if (prefersReducedMotion()) return false;
  return !window.matchMedia("(max-width: 640px)").matches;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

async function reserveProductIfNeeded(
  productId: Product["id"],
  cartEndpoint: string | null,
) {
  if (!cartEndpoint) return null;

  const response = await fetch(cartEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId: String(productId),
      quantity: 1,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new Error(
      getAvailabilityErrorMessage(payload?.code, payload?.message),
    );
  }

  return (await response.json()) as {
    reservationToken?: string;
    reservedUntil?: string;
  };
}

function dispatchCartUpdated(productId: Product["id"], quantity: number) {
  window.dispatchEvent(
    new CustomEvent("ftt:cart-updated", {
      detail: {
        productId: String(productId),
        quantity,
      },
    }),
  );
}

async function animateProductThumbnailToCart(
  source: HTMLElement,
  duration = FLY_TO_CART_MS,
): Promise<boolean> {
  const cartTarget = getCartTarget();
  if (!cartTarget) return false;

  const sourceCard = source.closest(
    "[data-ftt-product-card], [data-product-card], article, li",
  );
  const image = sourceCard?.querySelector("img") as HTMLImageElement | null;

  const startRect = image?.getBoundingClientRect() ?? source.getBoundingClientRect();
  const endRect = cartTarget.getBoundingClientRect();

  const startCenterX = startRect.left + startRect.width / 2;
  const startCenterY = startRect.top + startRect.height / 2;
  const endCenterX = endRect.left + endRect.width / 2;
  const endCenterY = endRect.top + endRect.height / 2;
  const dx = endCenterX - startCenterX;
  const dy = endCenterY - startCenterY;

  const ghost = document.createElement("div");
  ghost.className = "ftt-cart-fly-ghost";
  ghost.setAttribute("aria-hidden", "true");

  const ghostSize = Math.max(64, Math.min(124, startRect.width * 0.42));
  ghost.style.left = `${startCenterX - ghostSize / 2}px`;
  ghost.style.top = `${startCenterY - ghostSize / 2}px`;
  ghost.style.width = `${ghostSize}px`;
  ghost.style.height = `${ghostSize}px`;

  if (image?.currentSrc || image?.src) {
    ghost.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
  } else {
    ghost.innerHTML = `<div class="ftt-cart-fly-fallback">FTT</div>`;
  }

  document.body.appendChild(ghost);

  const lift = Math.max(100, Math.min(220, Math.abs(dx) * 0.14));
  const animation = ghost.animate(
    [
      {
        transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)",
        opacity: 1,
        filter: "blur(0px)",
        offset: 0,
      },
      {
        transform: "translate3d(0, -14px, 0) scale(1.035) rotate(-1deg)",
        opacity: 1,
        filter: "blur(0px)",
        offset: 0.16,
      },
      {
        transform: `translate3d(${dx * 0.22}px, ${dy * 0.16 - lift * 0.7}px, 0) scale(0.96) rotate(-3deg)`,
        opacity: 1,
        filter: "blur(0px)",
        offset: 0.38,
      },
      {
        transform: `translate3d(${dx * 0.56}px, ${dy * 0.46 - lift}px, 0) scale(0.76) rotate(-5deg)`,
        opacity: 0.98,
        filter: "blur(0px)",
        offset: 0.68,
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.16) rotate(7deg)`,
        opacity: 0.12,
        filter: "blur(1px)",
        offset: 1,
      },
    ],
    {
      duration,
      easing: "cubic-bezier(.2,.74,.18,1)",
      fill: "forwards",
    },
  );

  try {
    await animation.finished;
    return true;
  } catch {
    return false;
  } finally {
    ghost.remove();
  }
}

function getCartTarget(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("[data-ftt-cart-target]") ??
    document.querySelector<HTMLElement>("a[href='/cart']") ??
    document.querySelector<HTMLElement>("a[href='/bag']") ??
    document.querySelector<HTMLElement>("button[aria-label*='cart' i]") ??
    document.querySelector<HTMLElement>("button[aria-label*='bag' i]")
  );
}

function pulseCartTarget(cartTarget: HTMLElement) {
  cartTarget.animate(
    [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(1.12)", filter: "brightness(1.08)" },
      { transform: "scale(1)", filter: "brightness(1)" },
    ],
    {
      duration: 720,
      easing: "cubic-bezier(.2,.76,.18,1)",
    },
  );

  const badge = cartTarget.querySelector<HTMLElement>("[data-ftt-cart-count]");
  badge?.animate(
    [
      { transform: "translateY(0) scale(1)", opacity: 1 },
      { transform: "translateY(-5px) scale(1.18)", opacity: 1 },
      { transform: "translateY(0) scale(1)", opacity: 1 },
    ],
    {
      duration: 820,
      easing: "cubic-bezier(.2,.76,.18,1)",
    },
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M7.4 8.4h9.2l.7 10.1a1.8 1.8 0 0 1-1.8 1.9h-7a1.8 1.8 0 0 1-1.8-1.9l.7-10.1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 8.4V7a2.8 2.8 0 0 1 5.6 0v1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniSareeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M6.5 7.2c2.6-1.4 6.3-1.4 11 0v9.6c-4.7-1.4-8.4-1.4-11 0V7.2Z"
        fill="currentColor"
        opacity="0.28"
      />
      <path
        d="M6.5 7.2c2.6-1.4 6.3-1.4 11 0M6.5 7.2v9.6c2.6-1.4 6.3-1.4 11 0V7.2M9 6.4v10.1M12 6.2v10.1M15 6.5v10.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
