"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getAvailabilityErrorMessage } from "@/lib/cart/availability-errors";
import { showAddedToCartToast } from "@/lib/cart/reservation-toast";
import { trackWebsiteMetric } from "@/lib/analytics/client";
import { buildAddToCartEvent } from "@/lib/analytics/ga4-ecommerce";
import { resolvePrimaryCurrentProductImage } from "@/lib/media/product-image-resolver";
import { isBlouseProduct } from "@/lib/products/product-type";
import { useCartStore } from "@/lib/store/cart-store";
import { useCommerceAuth } from "@/components/commerce/commerce-auth-provider";
import { applyNotifyRefusal } from "@/components/product/restock-notify-button";
import { subscribeToAddToBagReplay } from "@/lib/commerce/add-to-bag-replay";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import { useCollectionStock } from "@/lib/realtime/use-collection-stock";
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
type ProductCardCommerceRowProps = {
  product: ProductCardCommerceProduct;
  className?: string;
  /** Brand-forward label. Use compactLabel for smaller cards if desired. */
  idleLabel?: string;
  /** Kept available because your collection card currently uses “+ Cart”. */
  compactLabel?: string;
};

export function ProductCardCommerceRow(
  props: ProductCardCommerceRowProps,
) {
  const serverCart = useServerCart();

  return (
    <ProductCardCommerceRowForViewer
      key={`${serverCart.userId ?? "anonymous"}:${props.product.id}`}
      {...props}
      serverCart={serverCart}
    />
  );
}

function ProductCardCommerceRowForViewer({
  product,
  className,
  idleLabel = "Add to bag",
  compactLabel = "+ Cart",
  serverCart,
}: ProductCardCommerceRowProps & {
  serverCart: ReturnType<typeof useServerCart>;
}) {
  const [state, setState] = useState<AddState>("idle");
  const [label, setLabel] = useState(compactLabel);
  const [isAwaitingAddConfirmation, setIsAwaitingAddConfirmation] =
    useState(false);
  const [notifyPending, setNotifyPending] = useState(false);
  const [notifyRegistered, setNotifyRegistered] = useState(false);
  const addItem = useCartStore((store) => store.addItem);
  const commerceAuth = useCommerceAuth();
  // The server owns the bag now; the local store is kept only for the
  // presentational bits that have not moved yet.
  const isReleasing = serverCart.isReleasing(String(product.id));
  const isBlouse = isBlouseProduct(product);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const runAddFlowRef = useRef<
    ((button: HTMLButtonElement, replay?: boolean) => Promise<void>) | null
  >(null);
  const addRequestInFlightRef = useRef(false);
  const notifyAttemptRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const scrambleResolveRef = useRef<null | (() => void)>(null);
  const resetTimerRef = useRef<number | null>(null);
  const labelRef = useRef(compactLabel);
  const setMotionLabel = (nextLabel: string) => {
    labelRef.current = nextLabel;
    setLabel(nextLabel);
  };

  useEffect(() => {
    const row = rowRef.current;
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      scrambleResolveRef.current?.();
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
      }
      clearCartBorder(
        row?.closest<HTMLElement>("[data-ftt-product-card]") ?? null,
        serverCart.userId,
      );
    };
  }, [serverCart.userId]);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  /*
   * ProductCard hands this row its own verdict as `stockStatus`, so the seed
   * reads that, the same source as the card's badges. `status` is the
   * publication state, and reading it first seeded a sold or held card as
   * available: an enabled "+ Cart" under the Sold out overlay.
   */
  const stockText = String(product.stockStatus ?? "")
    .trim()
    .toLowerCase();

  /*
   * The server-rendered status seeds the card; live stock corrects it.
   *
   * Without the live source a collection page never saw a reservation change,
   * so a saree another shopper had just claimed still read "Add to bag" until
   * the next full page load.
   */
  const staticStatus: "available" | "reserved" | "sold" =
    Boolean(product.isSold) ||
    stockText.includes("sold") ||
    product.availability === false ||
    product.availableForSale === false ||
    product.inventoryCount === 0
      ? "sold"
      : stockText.includes("reserved")
        ? "reserved"
        : "available";

  const viewer = useCollectionStock(String(product.id), {
    reservedUntil: null,
    /*
     * Seeded from what the server rendered, including "reserved". Seeding an
     * already-held saree as available made the card offer it — enabled, with
     * the full two-second add animation — until the batched verdict answered,
     * and permanently if that request failed.
     */
    state:
      staticStatus === "sold"
        ? "sold"
        : staticStatus === "reserved"
          ? "reserved_by_other"
          : "available",
  });
  // Final as the server gave it. A bag row proves a row exists, not the hold.
  const canonicalViewerState = viewer.state;

  /*
   * The server's verdict, with one client-only state layered on: a release in
   * flight. Offering the saree again mid-release is what let a shopper race
   * their own removal, and the server cannot see a request still travelling.
   */
  const viewerState = isReleasing ? "releasing" : canonicalViewerState;

  const isUnavailable =
    viewerState === "sold" ||
    viewerState === "reserved_by_other" ||
    viewerState === "checking";
  /*
   * One answer to "is this already theirs?", used by the label, the trash
   * control and the add guard alike. A saree mid-payment is still in the bag.
   */
  const canonicalIsInBag =
    canonicalViewerState === "in_my_cart" ||
    canonicalViewerState === "payment_pending";
  const isInBag = canonicalIsInBag;
  /*
   * `added` is only the successful animation's visual tail. If another cart
   * surface removes the row during that tail, the canonical verdict wins
   * immediately; the old timer may finish later but cannot keep ownership,
   * its label, or the add guard alive.
   *
   * A refusal's `error` tail ends the same way once the verdict stops offering
   * the piece. Left running, "Try again" sat on a held piece's Notify button,
   * and tapping it registered a restock email instead of retrying the add.
   */
  const errorTailOutlived =
    state === "error" && canonicalViewerState !== "available";
  const effectiveState: AddState = errorTailOutlived
    ? "idle"
    : state === "added" && !canonicalIsInBag ? "idle" : state;
  const isMotionActive =
    effectiveState === "scrambling" ||
    effectiveState === "sealing" ||
    effectiveState === "flying";
  const showSteadyInBag =
    isInBag && !isAwaitingAddConfirmation && !isMotionActive;
  /*
   * Only a row carrying a wider cluster — the bag's trash, Notify me, or a
   * transient label — gives ground on a narrow card. Every other state keeps
   * the row's original sizing; "Checking…" fits the same button as "+ Cart".
   *
   * Those rows give ground only on a card narrower than 12.5rem (rows under
   * about 184px, as on a two-column phone grid), where "New arrival" could not
   * wrap narrower than "ARRIVAL" and spilled under the button. A wider card
   * renders them exactly as before.
   */
  const compactRow =
    isInBag ||
    viewerState === "reserved_by_other" ||
    viewerState === "releasing";
  const motionButtonClass = `ftt-cart-motion-button inline-flex h-9 ${compactRow ? "min-w-22 @2xs:min-w-26" : "min-w-26 @max-[12.5rem]:min-w-22"} max-w-full items-center justify-center rounded-full px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] @sm:min-w-29 @sm:text-sm`;

  /** Clear the imperative animation border once the canonical state says out. */
  useEffect(() => {
    if (isInBag || effectiveState !== "idle") return;

    const card = rowRef.current?.closest<HTMLElement>("[data-ftt-product-card]");
    clearCartBorder(card ?? null);
  }, [effectiveState, isInBag]);

  /*
   * The refusal's own reset runs now rather than at the end of its hold, so
   * the tail cannot come back if the piece frees up again inside those two
   * seconds. It runs from a task, as the timer it replaces did.
   */
  useEffect(() => {
    if (!errorTailOutlived) return;
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current);
    }
    const idleText = compactLabel || idleLabel;
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      labelRef.current = idleText;
      setLabel(idleText);
      setState("idle");
    }, 0);
  }, [compactLabel, errorTailOutlived, idleLabel]);

  const analyticsStockStatus =
    viewerState === "sold"
      ? "sold"
      : viewerState === "available"
        ? "available"
        : "reserved";

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
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        scrambleResolveRef.current = null;
        resolve();
      };
      scrambleResolveRef.current = finish;

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
          finish();
        }
      };

      rafRef.current = window.requestAnimationFrame(frame);
    });

  const runAddToCartFlow = async (
    button: HTMLButtonElement,
    replay = false,
  ) => {
    // Re-adding while a release is still in flight is the race that surfaced
    // as "claimed by another shopper" on the shopper's own saree.
    if (
      (!replay && (isUnavailable || isInBag)) ||
      isReleasing ||
      effectiveState !== "idle" ||
      addRequestInFlightRef.current
    )
      return;

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);

    const sourceCard = getSourceProductCard(button);
    const reduceMotion = prefersReducedMotion();
    const idleText = compactLabel || idleLabel;
    const initiatingUserId = serverCart.userId;
    const stillOwnsPresentation = () =>
      initiatingUserId != null &&
      useCartStore.getState().presentationUserId === initiatingUserId;
    const abandonStalePresentation = () => {
      setIsAwaitingAddConfirmation(false);
      setState("idle");
      setMotionLabel(idleText);
      clearCartBorder(sourceCard, initiatingUserId);
    };
    addRequestInFlightRef.current = true;
    setIsAwaitingAddConfirmation(true);

    try {
      /*
       * The server claims the saree and writes the bag row in one statement.
       * Motion begins only after that authoritative confirmation: otherwise a
       * shopper watches the saree seal and fly before learning it was never
       * theirs. Direct and OTP replay both enter this exact command once.
       */
      const reserveResult = await serverCart.addToBag({
        productId: String(product.id),
      });
      if (reserveResult.code === "VIEWER_CHANGED" || !stillOwnsPresentation()) {
        abandonStalePresentation();
        return;
      }
      if (!reserveResult.ok) {
        const refusal = new Error(
          getAvailabilityErrorMessage(reserveResult.code),
        ) as Error & { code?: string };
        refusal.code = reserveResult.code;
        throw refusal;
      }

      setIsAwaitingAddConfirmation(false);
      setCartBorder(sourceCard, "running", initiatingUserId);
      setState("scrambling");
      await scrambleTo("Sealing", reduceMotion ? 1 : SCRAMBLE_MS);
      if (!stillOwnsPresentation()) {
        abandonStalePresentation();
        return;
      }

      setState("sealing");
      if (!reduceMotion) {
        await wait(SEAL_INTO_BAG_MS);
      }
      if (!stillOwnsPresentation()) {
        abandonStalePresentation();
        return;
      }

      setState("flying");
      setMotionLabel("To trunk");

      if (shouldFlyThumbnail()) {
        await animateProductThumbnailToCart(button, FLY_TO_CART_MS);
      } else {
        await wait(reduceMotion ? 0 : BADGE_SYNC_MS);
      }
      if (!stillOwnsPresentation()) {
        abandonStalePresentation();
        return;
      }

      /*
       * The bag itself lives on the server. This local line is kept only for
       * the drawer's presentation — name, price, image — and carries no
       * reservation proof, because ownership is no longer decided here.
       */
      addItem({
        id: product.id,
        name: product.name,
        price: product.pricePaise / 100,
        originalPricePaise: product.originalPricePaise ?? null,
        image: resolvePrimaryCurrentProductImage(product, "card").image?.url ?? "",
        slug: product.slug,
        detailsFabric: product.detailsFabric ?? null,
      });
      trackWebsiteMetric(
        "add_to_cart",
        {
          pricePaise: product.pricePaise,
          productId: product.id,
          slug: product.slug,
          source: "product_card",
          stockStatus: analyticsStockStatus,
        },
        buildAddToCartEvent(
          {
            category: isBlouse ? "Blouse" : "Saree",
            id: product.id,
            name: product.name,
            pricePaise: product.pricePaise,
            variant: product.detailsFabric,
          },
          {
            source: "product_card",
            stockStatus: analyticsStockStatus,
          },
        ),
      );

      // The bag's own add already told every card to re-ask; a second
      // cart-updated event here only bought the poller another request.
      const cartTarget = getCartTarget();
      if (cartTarget) pulseCartTarget(cartTarget);

      showAddedToCartToast({
        noun: isBlouse ? "blouse" : "saree",
        title: `${product.name} added to your bag`,
      });

      setState("added");
      setMotionLabel("In bag");
      setCartBorder(sourceCard, "added", initiatingUserId);

      resetTimerRef.current = window.setTimeout(() => {
        setState("idle");
        // The flash is done; data-ftt-in-bag keeps the border lit from here, so
        // the imperative attribute must not stay behind and outlive the item.
        clearCartBorder(sourceCard, initiatingUserId);
      }, ADDED_HOLD_MS);
    } catch (error) {
      if (!stillOwnsPresentation()) {
        abandonStalePresentation();
        return;
      }
      setIsAwaitingAddConfirmation(false);
      setCartBorder(sourceCard, "error", initiatingUserId);
      setState("error");
      setMotionLabel("Try again");

      // Vibrate the card so the rejection is felt, then explain it.
      if (!reduceMotion) shakeCard(sourceCard);

      const code = (error as Error & { code?: string })?.code;
      const reservedByAnother =
        code === "PRODUCT_RESERVED" || code === "RESERVATION_CONFLICT";
      if (reservedByAnother) {
        toast.error("Just reserved by another buyer", {
          description:
            "Someone has reserved this piece to buy. Feel free to explore our other one-of-a-kind sarees.",
        });
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "This piece is no longer available.",
        );
      }

      resetTimerRef.current = window.setTimeout(() => {
        setState("idle");
        setMotionLabel(idleText);
        clearCartBorder(sourceCard, initiatingUserId);
      }, ERROR_HOLD_MS);
    } finally {
      addRequestInFlightRef.current = false;
    }
  };

  useEffect(() => {
    runAddFlowRef.current = runAddToCartFlow;
  });

  useEffect(
    () =>
      subscribeToAddToBagReplay((intent) => {
        if (
          intent.productId !== String(product.id) ||
          intent.source !== "product-card" ||
          !addButtonRef.current ||
          !runAddFlowRef.current
        ) {
          return false;
        }

        return runAddFlowRef.current(addButtonRef.current, true);
      }),
    [product.id],
  );

  const handleAddToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      isUnavailable ||
      isInBag ||
      isReleasing ||
      effectiveState !== "idle"
    )
      return;

    if (commerceAuth && !serverCart.isAuthenticated) {
      commerceAuth.requireAuth({
        productId: String(product.id),
        source: "product-card",
        type: "add-to-cart",
      });
      return;
    }

    await runAddToCartFlow(event.currentTarget);
  };

  const handleRemoveFromCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceCard = getSourceProductCard(event.currentTarget);
    clearCartBorder(sourceCard, serverCart.userId);

    // Same answer as the label and the trash beside it. Reading inCart here
    // while they read isInBag left both controls visible but inert.
    if (canonicalViewerState !== "in_my_cart") return;

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);

    /*
     * In bag → Releasing… → Add to bag.
     *
     * The row survives a failure. Dropping it locally would strand a live hold
     * with nobody left able to release it, and the saree would sit unbuyable
     * for the rest of its window.
     */
    const result = await serverCart.removeFromBag(String(product.id));
    // Answered for an account that has since signed out: not this shopper's.
    if (result.code === "VIEWER_CHANGED") return;
    if (!result.ok) {
      const paymentInProgress =
        result.viewerState === "payment_pending" ||
        result.code === "PAYMENT_IN_PROGRESS" ||
        result.code === "PAYMENT_RESERVATION_CONFLICT";
      toast.error(
        paymentInProgress
          ? "This saree has a payment in progress"
          : "Could not release this saree",
        {
          description: paymentInProgress
            ? "Finish or cancel that payment before removing it."
            : "It is still in your bag. Check your connection and try again.",
        },
      );
      return;
    }
    const cartTarget = getCartTarget();
    if (cartTarget && !prefersReducedMotion()) pulseCartTarget(cartTarget);
    setState("idle");
    setMotionLabel(compactLabel || idleLabel);
  };

  const handleNotify = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (notifyPending || notifyRegistered) return;

    if (commerceAuth && !serverCart.isAuthenticated) {
      commerceAuth.requireAuth({
        productId: String(product.id),
        source: "product-card",
        type: "notify-me",
      });
      return;
    }

    const initiatingUserId = serverCart.userId;
    const attempt = ++notifyAttemptRef.current;
    setNotifyPending(true);
    try {
      const response = await fetch("/api/v2/wishlist/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: String(product.id) }),
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        viewerState?: unknown;
      } | null;

      if (
        attempt !== notifyAttemptRef.current ||
        initiatingUserId == null ||
        useCartStore.getState().presentationUserId !== initiatingUserId
      ) {
        return;
      }

      if (response.ok) {
        setNotifyRegistered(true);
        window.dispatchEvent(
          new CustomEvent("ftt:notify-registered", {
            detail: {
              productId: String(product.id),
              userId: initiatingUserId,
            },
          }),
        );
        toast.success("We'll email you if this piece becomes available.");
      } else if (
        applyNotifyRefusal({
          payload,
          productId: String(product.id),
          userId: initiatingUserId,
        })
      ) {
        // The card's verdict was stale; confirm the bag behind the correction.
        await serverCart.refresh();
      } else {
        toast.error("Unable to register. Please try again.");
      }
    } catch {
      if (
        attempt === notifyAttemptRef.current &&
        initiatingUserId != null &&
        useCartStore.getState().presentationUserId === initiatingUserId
      ) {
        toast.error("Unable to register. Please try again.");
      }
    } finally {
      if (attempt === notifyAttemptRef.current) setNotifyPending(false);
    }
  };

  useEffect(() => {
    const markRegistered = (event: Event) => {
      const detail = (
        event as CustomEvent<{ productId?: string; userId?: string }>
      ).detail;
      if (
        detail?.productId === String(product.id) &&
        detail.userId === serverCart.userId
      ) {
        setNotifyRegistered(true);
      }
    };
    window.addEventListener("ftt:notify-registered", markRegistered);
    return () => window.removeEventListener("ftt:notify-registered", markRegistered);
  }, [product.id, serverCart.userId]);

  /*
   * One verdict, one label. A held piece offers a wait rather than a sale;
   * a sold one offers nothing, because nothing can bring it back.
   */
  /*
   * The card offers three things and nothing else: add it, it's yours, or wait
   * for it. A saree the shopper is mid-payment on is still in their bag, so it
   * reads "In bag" — the checkout they already started is where a payment gets
   * finished, not a product card.
   *
   * "Sold" is the one label that is not an offer. It stays because dropping it
   * would leave a sold piece showing "+ Cart"; the image carries a Sold out
   * overlay alongside it.
   */
  const canAwaitThisPiece = viewerState === "reserved_by_other";
  /*
   * `label` is animation state and nothing else.
   *
   * It is written by the scramble as it runs and left wherever the last frame
   * put it — the add sequence ends on "In bag" and its reset timer only clears
   * `state`, never the text. So a card whose saree was removed somewhere else,
   * from the drawer or the cart page, fell through to that stale string: the
   * verdict said available, the colours flipped back to the navy of "+ Cart",
   * the trash beside it disappeared, and the button still read "In bag" while
   * being a working add button. At rest the idle text is the only honest
   * answer; `label` is meaningful only while a phase is actually playing.
   */
  const buttonLabel =
    viewerState === "releasing"
      ? "Releasing…"
      : isAwaitingAddConfirmation
        ? compactLabel || idleLabel
        : isMotionActive || effectiveState === "error"
          ? label
          : viewerState === "sold"
            ? "Sold"
            : viewerState === "checking"
              ? "Checking…"
            : canAwaitThisPiece
              ? "Notify me"
              : isInBag
                ? "In bag"
                : effectiveState === "idle"
                  ? compactLabel || idleLabel
                  : label;
  const dataPhase =
    viewerState === "releasing"
      ? "releasing"
      : isAwaitingAddConfirmation
        ? "idle"
        : isMotionActive || effectiveState === "error"
          ? effectiveState
          : isUnavailable
            ? "unavailable"
            : isInBag
              ? "added"
              : effectiveState;

  return (
    <div
      ref={rowRef}
      className={cn(
        "mt-3 flex min-h-12 min-w-0 items-center justify-between gap-2 border-t border-[#E7DDD4]/80 pt-3 @sm:min-h-13 @sm:gap-2.5",
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
        ) : compactRow ? (
          <span
            className={cn(
              /*
               * One line, clipped with an ellipsis when the card is too narrow
               * to hold it. Left to wrap beside the wider cluster, "New
               * arrival" took a second line, outgrew the row it sits in and
               * spilled past the card edge.
               */
              "inline-block max-w-full truncate rounded-full border border-[#B39152]/35 bg-[#B39152]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#601D1C] shadow-[0_8px_18px_rgba(179,145,82,0.14)]",
              "@2xs:px-3 @2xs:py-1.5 @2xs:text-[11px] @2xs:tracking-[0.16em] @sm:text-xs",
            )}
          >
            {/*
              A narrow card has no room left to read "New arrival" whole. The
              badge still shows — only the wording gives ground, so it never
              degrades to a stray letter and an ellipsis.
            */}
            <span className="@2xs:hidden">New</span>
            <span className="hidden @2xs:inline">New arrival</span>
          </span>
        ) : (
          <span className="inline-flex max-w-full items-center rounded-full border border-[#B39152]/35 bg-[#B39152]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#601D1C] shadow-[0_8px_18px_rgba(179,145,82,0.14)] @sm:text-xs @max-[12.5rem]:inline-block @max-[12.5rem]:truncate @max-[12.5rem]:px-2 @max-[12.5rem]:py-1 @max-[12.5rem]:text-[10px] @max-[12.5rem]:tracking-[0.1em]">
            {/*
              The original pill, class for class and word for word, on every
              card 12.5rem and wider. Narrower, it keeps to one line and reads
              "New"; it never disappears.
            */}
            <span className="@max-[12.5rem]:hidden">New arrival</span>
            <span className="hidden @max-[12.5rem]:inline">New</span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        {viewerState === "sold" ? (
          // Disabled and inert: no click handler and no replay target, because
          // a sold piece offers nothing to act on.
          <button
            type="button"
            disabled
            data-phase={dataPhase}
            aria-live="polite"
            className={cn(
              motionButtonClass,
              "cursor-not-allowed bg-[#601D1C] text-[#FDF7F1] opacity-90",
            )}
          >
            <span className="ftt-motion-bag" aria-hidden="true">
              <BagIcon />
            </span>
            <span className="ftt-motion-garment" aria-hidden="true">
              <MiniSareeIcon />
            </span>
            <span className="ftt-motion-label">Sold</span>
          </button>
        ) : canAwaitThisPiece ? (
          <button
            type="button"
            className="inline-flex h-9 min-w-22 @2xs:min-w-26 max-w-full items-center justify-center gap-1.5 rounded-full border border-[#601D1C]/30 bg-[#FDF7F1] px-4 text-[13px] font-medium text-[#601D1C] transition hover:border-[#601D1C] hover:bg-[#601D1C] hover:text-[#FDF7F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] disabled:cursor-wait disabled:opacity-60 @sm:min-w-29 @sm:text-sm"
            disabled={notifyPending || notifyRegistered}
            onClick={handleNotify}
          >
            {/*
              Its own words and nothing else. Falling through to the add
              button's label read "Try again" after a refused add, or "+ Cart"
              mid sign-in replay, and tapping either registered an email.
            */}
            {notifyRegistered
              ? "Notify registered"
              : notifyPending
                ? "Registering…"
                : "Notify me"}
          </button>
        ) : isBlouse && !isUnavailable && !isInBag && !isReleasing ? (
          <Link
            href={`/collection/${product.slug}`}
            className="inline-flex h-9 min-w-26 max-w-full items-center justify-center rounded-full bg-[#141D46] px-4 text-[13px] font-medium text-[#FDF7F1] shadow-[0_8px_20px_rgba(20,29,70,0.16)] transition hover:bg-[#0E0D0E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] @sm:min-w-29 @sm:text-sm"
            onClick={(event) => event.stopPropagation()}
          >
            Select size
          </Link>
        ) : (
          <button
            ref={addButtonRef}
            type="button"
            onClick={handleAddToCart}
            disabled={
              isUnavailable ||
              isInBag ||
              isReleasing ||
              isAwaitingAddConfirmation ||
              effectiveState !== "idle"
            }
            data-phase={dataPhase}
            aria-live="polite"
            className={cn(
              motionButtonClass,
              isUnavailable
                ? "cursor-not-allowed bg-[#601D1C] text-[#FDF7F1] opacity-90"
                : isInBag
                  ? "border border-[#B39152] bg-[#601D1C] text-[#FDF7F1] shadow-[0_8px_20px_rgba(96,29,28,0.16)]"
                  : effectiveState === "error"
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

        {/*
          Tied to the same verdict as the label. Reading a different source
          from the button is how "In bag" ended up sitting there with no way
          to take the piece back out.
        */}
        {showSteadyInBag && canonicalViewerState === "in_my_cart" ? (
          <button
            type="button"
            disabled={isReleasing}
            onClick={handleRemoveFromCart}
            aria-label={
              isReleasing
                ? `Releasing ${product.name}`
                : `Remove ${product.name} from bag`
            }
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#B39152]/70 bg-[#FDF7F1] text-[#601D1C] shadow-[0_6px_16px_rgba(96,29,28,0.10)] transition hover:border-[#601D1C]/55 hover:bg-[#601D1C]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] disabled:cursor-wait disabled:opacity-60"
          >
            {isReleasing ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
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

function setCartBorder(
  card: HTMLElement | null,
  phase: "added" | "error" | "running",
  userId: null | string,
) {
  if (!card) return;
  card.setAttribute("data-ftt-cart-border", phase);
  if (userId) card.setAttribute("data-ftt-cart-border-owner", userId);
}

/** An old account's animation may never erase a newer account's border. */
function clearCartBorder(card: HTMLElement | null, userId?: null | string) {
  if (!card) return;
  const owner = card.getAttribute("data-ftt-cart-border-owner");
  if (userId && owner && owner !== userId) return;
  card.removeAttribute("data-ftt-cart-border");
  card.removeAttribute("data-ftt-cart-border-owner");
}

/** A short horizontal shake to signal an add-to-cart rejection. */
function shakeCard(card: HTMLElement | null) {
  if (!card || typeof card.animate !== "function") return;
  card.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-8px)" },
      { transform: "translateX(7px)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 460, easing: "cubic-bezier(.36,.07,.19,.97)" },
  );
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
