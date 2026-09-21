"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Info } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCartLineVerdicts } from "@/components/cart/cart-item";
import { Checkbox } from "@/components/ui/checkbox";
import { trackOncePerSession } from "@/lib/analytics/client";
import { trackStartFlow } from "@/lib/analytics/track";
import {
  GST_RATE,
  type ShippingMethod,
} from "@/lib/config/order-pricing";
import { computeCheckoutEstimate } from "@/lib/checkout/estimate";
import {
  type AddressFieldErrors,
  type AddressForm,
  emptyAddress,
  fullName,
  hasErrors,
  savedAddressToForm,
  toOrderAddress,
  toSavedAddressPayload,
  validateAddressForm,
} from "@/lib/checkout/address-form";
import { announceCartChangedAcrossTabs } from "@/lib/commerce/cart-tab-bus";
import { useServerCart } from "@/lib/commerce/use-server-cart";
import {
  readViewerProductState,
  type ViewerProductState,
} from "@/lib/commerce/viewer-state";
import {
  announceViewerState,
  commerceViewerKey,
  readViewerStateSequence,
} from "@/lib/commerce/viewer-state-bus";
import {
  getOneOfOneConflictCopy,
  type OneOfOneConflictCopy,
} from "@/lib/checkout/one-of-one-conflict-copy";
import { type CheckoutStep, STEP_COPY } from "@/lib/checkout/steps";
import { clearCheckoutAttempt } from "@/lib/checkout/checkout-attempt";
import { useCheckoutPayment } from "@/lib/checkout/use-checkout-payment";
import { getCartTotals } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import type { Address, Product } from "@/types/domain";

import { BillingStep } from "./billing-step";
import { CheckoutAuthGate } from "./checkout-auth-gate";
import { CheckoutAddressForm } from "./checkout-address-form";
import { CheckoutProgress } from "./checkout-progress";
import { CheckoutStepActions } from "./checkout-step-actions";
import { EmptyCart } from "./empty-cart";
import { GiftOptions } from "./gift-options";
import { OrderSummary } from "./order-summary";
import { PackagingStep } from "./packaging-step";
import { ReviewStep } from "./review-step";
import { SavedAddressPicker } from "./saved-address-picker";

export const fetchAddresses = async (): Promise<Address[]> => {
  const response = await fetch("/api/v2/addresses");
  // A failed load stays a failure. Read as an empty book, it let the next
  // saved checkout address replace the customer's own default.
  if (!response.ok) {
    throw new Error(`Unable to load saved addresses (${response.status}).`);
  }
  return (await response.json()) as Address[];
};

/**
 * A checkout address becomes the default only in a book known to have none.
 * An unfinished or failed load proves nothing about the customer's default.
 */
export const shouldDefaultCheckoutAddress = (addressBook: {
  data?: Address[];
  isSuccess: boolean;
}): boolean =>
  addressBook.isSuccess &&
  !(addressBook.data ?? []).some((address) => address.isDefault);

/**
 * A create-order conflict removes the line only when its copy says the piece
 * is gone. A payment already in progress keeps its line and its hold, so the
 * bag is re-read instead and the line redraws as "In bag" with no remove.
 */
export async function applyCheckoutConflict(
  conflict: { copy: OneOfOneConflictCopy; productId?: string },
  actions: {
    refresh: () => Promise<void>;
    removeFromBag: (productId: string) => Promise<unknown>;
    showConflict: (copy: OneOfOneConflictCopy) => void;
  },
): Promise<void> {
  actions.showConflict(conflict.copy);
  if (conflict.copy.removeProduct && conflict.productId) {
    await actions.removeFromBag(conflict.productId);
    return;
  }
  await actions.refresh();
}

const saveCheckbox =
  "border-ftt-navy data-[state=checked]:border-ftt-navy data-[state=checked]:bg-ftt-navy";

const normalizeAddressPart = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const ADDRESS_ERROR_FIELD_ORDER: Array<keyof AddressForm> = [
  "fullName",
  "email",
  "phone",
  "line1",
  "apartment",
  "floorNumber",
  "building",
  "area",
  "landmark",
  "city",
  "state",
  "postalCode",
  "country",
];

// Identity of an address for de-duplication: same street line, city, and PIN.
const addressDedupeKey = (parts: {
  line1?: string | null;
  city?: string | null;
  postalCode?: string | null;
}) =>
  [parts.line1, parts.city, parts.postalCode]
    .map(normalizeAddressPart)
    .join("|");

type CheckoutPageClientProps = {
  embedded?: boolean;
  featuredPicks: Product[];
};

/** A session change remounts every customer-entered field and one-time seed. */
export function CheckoutPageClient(props: CheckoutPageClientProps) {
  const { data: session, status } = useSession();
  const viewerKey =
    status === "authenticated" && session?.user?.id
      ? session.user.id
      : status;

  return <CheckoutPageClientForViewer key={viewerKey} {...props} />;
}

function CheckoutPageClientForViewer({
  embedded = false,
  featuredPicks,
}: CheckoutPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  // The key the live stock snapshot files verdicts under, so what the
  // preflight learns lands where every card, the drawer and the PDP read.
  const viewerKey = commerceViewerKey(sessionStatus, session?.user?.id ?? null);

  const {
    isReleasing,
    presentedItems: items,
    presentationHasHydrated: hasHydrated,
    refresh: refreshServerCart,
    refreshAfterBagChange,
    removeFromBag,
    userId: serverCartUserId,
  } = useServerCart();
  const { subtotal } = getCartTotals(items);
  const hasItems = hasHydrated && items.length > 0;
  // The summary's lines report the verdicts they draw; payment obeys the same.
  const { reportVerdict: reportLineVerdict, verdictFor: lineVerdictFor } =
    useCartLineVerdicts();
  const hasSoldCartItem = items.some(
    (item) => lineVerdictFor(item) === "sold",
  );
  const hasUncheckedCartItem = items.some(
    (item) => lineVerdictFor(item) === "checking",
  );

  const payment = useCheckoutPayment();
  const { isSubmitting, error } = payment;

  const startFlowFiredRef = useRef(false);

  useEffect(() => {
    if (!hasItems) return;

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const productIds = items.map((item) => item.id).sort();

    trackOncePerSession(
      `checkout_started:${productIds.join(",")}:${itemCount}`,
      "checkout_started",
      {
        itemCount,
        productIds,
        source: "checkout_page",
        subtotalPaise: Math.round(subtotal * 100),
      },
    );

    // Browser-owned GTM funnel event (begin checkout), fired once per mount.
    // Server MP still owns the authoritative purchase conversion, so no
    // duplication here.
    if (!startFlowFiredRef.current) {
      startFlowFiredRef.current = true;
      trackStartFlow("checkout", {
        item_count: itemCount,
        value: Math.round(subtotal * 100) / 100,
        currency: "INR",
      });
    }
  }, [hasItems, items, subtotal]);

  const [currentStep, setCurrentStep] = useState<CheckoutStep>("shipping");
  const [shippingAddress, setShippingAddress] = useState<AddressForm>(() =>
    emptyAddress(session?.user?.email ?? ""),
  );
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState<AddressForm>(() =>
    emptyAddress(session?.user?.email ?? ""),
  );
  const [saveShippingAddress, setSaveShippingAddress] = useState(true);
  const [saveBillingAddress, setSaveBillingAddress] = useState(false);
  const [saveLabelKind, setSaveLabelKind] = useState<
    "Home" | "Office" | "Other"
  >("Home");
  const [customSaveLabel, setCustomSaveLabel] = useState("");
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("standard");
  const [shippingErrors, setShippingErrors] = useState<AddressFieldErrors>({});
  const [billingErrors, setBillingErrors] = useState<AddressFieldErrors>({});
  // Gifting paused for launch — flip to true to bring the gift step back.
  const ENABLE_GIFTING: boolean = false;
  const [isGift, setIsGift] = useState(false);
  const [includeGiftMessage, setIncludeGiftMessage] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftFrom, setGiftFrom] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [checkoutConflict, setCheckoutConflict] =
    useState<OneOfOneConflictCopy | null>(null);
  const [checkoutViewerStatus, setCheckoutViewerStatus] = useState<
    "blocked" | "checking" | "trusted"
  >("checking");

  const showCheckoutConflict = useCallback((copy: OneOfOneConflictCopy) => {
    setCheckoutConflict(copy);
    toast.error(copy.title);
  }, []);

  const recheckCheckoutAvailability = useCallback(async () => {
    if (!hasItems) {
      setCheckoutViewerStatus("trusted");
      return true;
    }
    const productIds = [...new Set(items.map((item) => item.id))];
    // Noted as the request leaves. A removal announced while it travels is
    // newer than anything this answer can say about that saree.
    const sentAtSequence = readViewerStateSequence();
    const response = await fetch("/api/v2/products/viewer-state", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productIds }),
    }).catch(() => null);

    // A failed preflight is not availability. Keep payment disabled until an
    // authoritative response succeeds; the create-order guard remains the
    // final server-side enforcement as well.
    if (!response?.ok) {
      setCheckoutViewerStatus("checking");
      return false;
    }

    const payload = (await response.json().catch(() => null)) as {
      products?: Record<
        string,
        { reservedUntil?: unknown; state?: unknown } | null
      >;
    } | null;
    if (
      !payload?.products ||
      typeof payload.products !== "object" ||
      Array.isArray(payload.products)
    ) {
      setCheckoutViewerStatus("checking");
      return false;
    }

    /*
     * Every verdict this answer proves is told to every surface before any
     * line is judged, so the cards, the drawer and the product page share the
     * snapshot these summary lines draw instead of waiting for their own poll.
     * An entry that does not parse is not told: it must never replace a
     * verdict another surface already trusts. Each one carries when this
     * request left, so a removal the shopper made while it travelled keeps
     * its newer verdict instead of getting this answer's "In bag" back.
     */
    const verdicts = new Map<string, ViewerProductState>();
    for (const productId of productIds) {
      const verdict = payload.products[productId];
      const state = readViewerProductState(verdict?.state);
      if (!state) continue;
      verdicts.set(productId, state);
      announceViewerState({
        productId,
        reservedUntil:
          typeof verdict?.reservedUntil === "string"
            ? verdict.reservedUntil
            : null,
        sentAtSequence,
        state,
        viewerKey,
      });
    }

    for (const item of items) {
      const state = verdicts.get(item.id);
      if (!state) {
        setCheckoutViewerStatus("checking");
        return false;
      }
      if (state === "sold") {
        setCheckoutViewerStatus("blocked");
        showCheckoutConflict(getOneOfOneConflictCopy("PRODUCT_SOLD"));
        await refreshServerCart();
        return false;
      }
      if (state === "reserved_by_other") {
        setCheckoutViewerStatus("blocked");
        showCheckoutConflict(getOneOfOneConflictCopy("PRODUCT_RESERVED"));
        await refreshServerCart();
        return false;
      }
      // Made-to-order blouses legitimately stay available while in a bag. An
      // available line that carried a one-of-one expiry, however, has lapsed.
      if (state === "available" && item.reservedUntil) {
        setCheckoutViewerStatus("blocked");
        showCheckoutConflict(getOneOfOneConflictCopy("PRODUCT_UNAVAILABLE"));
        await refreshServerCart();
        return false;
      }
    }

    setCheckoutViewerStatus("trusted");
    return true;
  }, [hasItems, items, refreshServerCart, showCheckoutConflict, viewerKey]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) void recheckCheckoutAvailability();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [recheckCheckoutAvailability]);

  const addressesQuery = useQuery({
    queryKey: ["addresses", serverCartUserId ?? "anonymous"],
    queryFn: fetchAddresses,
    enabled: isAuthenticated,
  });
  const savedAddresses = addressesQuery.data;

  const authRefreshRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) {
      authRefreshRef.current = false;
      return;
    }
    if (authRefreshRef.current) return;

    authRefreshRef.current = true;
    void queryClient.invalidateQueries({
      queryKey: ["addresses", serverCartUserId ?? "anonymous"],
    });
    void addressesQuery.refetch();
  }, [addressesQuery, isAuthenticated, queryClient, serverCartUserId]);

  // Seed name + email from the account once the session loads (sessions resolve
  // after the first client render). Done during render with a guard — the
  // React-sanctioned alternative to a sync-in-effect — never clobbering input.
  const sessionEmail = session?.user?.email ?? "";
  const sessionName = session?.user?.name ?? "";
  const [profileSeeded, setProfileSeeded] = useState(false);
  if ((sessionEmail || sessionName) && !profileSeeded) {
    setProfileSeeded(true);
    const seed = (prev: AddressForm): AddressForm => ({
      ...prev,
      email: prev.email || sessionEmail,
      fullName: prev.fullName || sessionName,
    });
    setShippingAddress(seed);
    setBillingAddress(seed);
    setGiftFrom((prev) => prev || sessionName);
  }

  // Auto-fill the saved default address (name, phone, full address) once the
  // address book loads, so a returning customer never re-enters their details.
  const [addressSeeded, setAddressSeeded] = useState(false);
  if (savedAddresses && savedAddresses.length > 0 && !addressSeeded) {
    setAddressSeeded(true);
    const preferred =
      savedAddresses.find((address) => address.isDefault) ?? savedAddresses[0];
    setShippingAddress((prev) =>
      savedAddressToForm(preferred, prev.email || sessionEmail),
    );
  }

  // ── Discount (server-authoritative; client only displays the amount) ──────
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{
    code: string;
    amountPaise: number;
  } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  const handleValidateDiscount = async () => {
    const trimmedCode = discountCode.trim().toUpperCase();
    if (!trimmedCode) return;
    setDiscountError(null);
    setIsValidatingDiscount(true);
    try {
      const res = await fetch("/api/v2/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: trimmedCode,
          subtotalPaise: Math.round(subtotal * 100),
          itemProductIds: items.map((item) => item.id),
        }),
      });
      const data = (await res.json()) as {
        discountAmountPaise?: number;
        message?: string;
      };
      if (!res.ok) {
        setDiscountError(data.message ?? "Invalid discount code.");
        setDiscountApplied(null);
        return;
      }
      setDiscountApplied({
        code: trimmedCode,
        amountPaise: data.discountAmountPaise ?? 0,
      });
      toast.success(`Discount code ${trimmedCode} applied.`);
    } catch {
      setDiscountError("Unable to validate discount code. Please try again.");
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountApplied(null);
    setDiscountCode("");
    setDiscountError(null);
  };

  const discountAmountRupees = discountApplied
    ? discountApplied.amountPaise / 100
    : 0;
  const { effectiveSubtotal, shippingCost, taxAmount, total } =
    computeCheckoutEstimate({
      subtotal,
      shippingMethod,
      discountAmount: discountAmountRupees,
    });
  const taxRateLabel = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2,
        style: "percent",
      }).format(GST_RATE),
    [],
  );

  // Task 6: blouse-pairing availability note. CartItem doesn't carry the product
  // type, so we detect a blouse from the item name / slug / a selected size
  // (blouses are the only sized items). Drives the review-step wording.
  const cartHasBlouse = useMemo(
    () =>
      items.some(
        (item) =>
          /\bblouse\b/i.test(item.name) ||
          /blouse/i.test(item.slug ?? "") ||
          Boolean(item.selectedOptions?.size),
      ),
    [items],
  );

  const resolvedBilling = billingSameAsShipping ? shippingAddress : billingAddress;

  const handleAddressSelect = (addressId: string) => {
    const address = savedAddresses?.find((item) => item.id === addressId);
    if (!address) return;
    setShippingAddress(savedAddressToForm(address, shippingAddress.email));
    setShippingErrors({});
    toast.success("Address added from your saved trunk.");
  };

  /*
   * The toast waits for the answer.
   *
   * It used to fire the request and announce success in the same breath, so a
   * refusal — a payment already open on the piece, or a signed-out session with
   * no bag to delete from — still read "Removed from your trunk." while the
   * line sat there untouched in the summary.
   */
  const handleRemoveItem = async (id: string) => {
    setCheckoutConflict(null);
    const result = await removeFromBag(id);
    if (result.ok) {
      toast("Removed from your trunk.");
      return;
    }
    // The answer belongs to an account that has since signed out.
    if (result.code === "VIEWER_CHANGED") return;
    toast.error(
      result.viewerState === "payment_pending"
        ? "This piece has a payment in progress"
        : "Could not remove this piece",
      {
        description:
          result.viewerState === "payment_pending"
            ? "Finish or cancel that payment before removing it."
            : "It is still in your trunk. Check your connection and try again.",
      },
    );
  };

  // Addresses are saved to the account as soon as the customer advances past
  // each step (not at payment), so the address book fills even if checkout is
  // abandoned. The refs make each save idempotent across back-and-forth.
  const savedShippingRef = useRef(false);
  const savedBillingRef = useRef(false);
  // Synchronous double-submit guard. `isSubmitting` only flips inside
  // startPayment (after two awaited network phases in handlePay), so a rapid
  // double-click could otherwise issue two concurrent create-order POSTs.
  const submitLockRef = useRef(false);

  const scrollCheckoutToTop = useCallback(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.requestAnimationFrame(() => {
      window.scrollTo({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        top: 0,
      });
    });
  }, []);

  const goToStep = useCallback(
    (step: CheckoutStep) => {
      setCurrentStep(step);
      scrollCheckoutToTop();
    },
    [scrollCheckoutToTop],
  );

  const focusFirstAddressError = useCallback((errors: AddressFieldErrors) => {
    const firstField = ADDRESS_ERROR_FIELD_ORDER.find((field) => errors[field]);
    if (!firstField) return;

    window.setTimeout(() => {
      const field = document.querySelector<HTMLElement>(
        `[data-checkout-field="${firstField}"]`,
      );
      if (!field) return;

      field.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      window.setTimeout(() => field.focus({ preventScroll: true }), 120);
    }, 80);
  }, []);

  // True when an identical address is already in the customer's address book,
  // so we skip the save instead of creating a duplicate.
  const isAddressAlreadySaved = (form: AddressForm) => {
    const key = addressDedupeKey(form);
    return (savedAddresses ?? []).some(
      (address) => addressDedupeKey(address) === key,
    );
  };

  const saveShippingToAccount = async () => {
    if (!session?.user?.id || !saveShippingAddress || savedShippingRef.current) {
      return;
    }
    if (isAddressAlreadySaved(shippingAddress)) {
      savedShippingRef.current = true;
      return;
    }
    savedShippingRef.current = true;
    try {
      const res = await fetch("/api/v2/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toSavedAddressPayload(shippingAddress, {
            label:
              saveLabelKind === "Other"
                ? customSaveLabel.trim() || "Other"
                : saveLabelKind,
            isDefault: shouldDefaultCheckoutAddress(addressesQuery),
          }),
        ),
      });
      if (res.ok) toast.success("Address saved to your trunk.");
      else savedShippingRef.current = false; // allow a later retry
    } catch {
      savedShippingRef.current = false;
    }
  };

  const saveBillingToAccount = async () => {
    if (
      !session?.user?.id ||
      billingSameAsShipping ||
      !saveBillingAddress ||
      savedBillingRef.current
    ) {
      return;
    }
    if (isAddressAlreadySaved(billingAddress)) {
      savedBillingRef.current = true;
      return;
    }
    savedBillingRef.current = true;
    try {
      const res = await fetch("/api/v2/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toSavedAddressPayload(billingAddress, {
            label: "Billing",
            isDefault: false,
          }),
        ),
      });
      if (!res.ok) savedBillingRef.current = false;
    } catch {
      savedBillingRef.current = false;
    }
  };

  const goToBilling = () => {
    const errors = validateAddressForm(shippingAddress);
    setShippingErrors(errors);
    if (hasErrors(errors)) {
      focusFirstAddressError(errors);
      return;
    }
    void saveShippingToAccount();
    goToStep("billing");
  };

  const goToPackaging = () => {
    if (billingSameAsShipping) {
      goToStep("packaging");
      return;
    }
    const errors = validateAddressForm(billingAddress);
    setBillingErrors(errors);
    if (hasErrors(errors)) {
      focusFirstAddressError(errors);
      return;
    }
    void saveBillingToAccount();
    goToStep("packaging");
  };

  const handlePay = async () => {
    // Block re-entry for the whole handler (covers the pre-startPayment awaited
    // phases where isSubmitting has not yet flipped) — no duplicate create-order.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      setCheckoutConflict(null);
      if (!hasItems) return;
      if (!isAuthenticated) {
        toast.error("Sign in or create an account to continue checkout.");
        return;
      }
      if (!agreedToTerms) {
        toast.error(
          "Please confirm you have read and agree to the Terms & Policies.",
        );
        return;
      }

      const availabilityOk = await recheckCheckoutAvailability();
      if (!availabilityOk) return;

      const shipErrors = validateAddressForm(shippingAddress);
      if (hasErrors(shipErrors)) {
        setShippingErrors(shipErrors);
        goToStep("shipping");
        focusFirstAddressError(shipErrors);
        return;
      }
      if (!billingSameAsShipping) {
        const billErrors = validateAddressForm(billingAddress);
        if (hasErrors(billErrors)) {
          setBillingErrors(billErrors);
          goToStep("billing");
          focusFirstAddressError(billErrors);
          return;
        }
      }

      await Promise.allSettled([
        saveShippingToAccount(),
        saveBillingToAccount(),
      ]);

      await payment.startPayment({
        payload: {
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            ...(item.selectedOptions ? { selectedOptions: item.selectedOptions } : {}),
          })),
          shippingAddress: toOrderAddress(shippingAddress),
          shippingMethod,
          ...(discountApplied ? { discountCode: discountApplied.code } : {}),
          ...(isGift
            ? {
                isGift: true,
                ...(giftFrom.trim() ? { giftFrom: giftFrom.trim() } : {}),
                ...(includeGiftMessage && giftMessage.trim()
                  ? { giftMessage: giftMessage.trim() }
                  : {}),
              }
            : {}),
        },
        prefill: {
          name: fullName(shippingAddress),
          email: shippingAddress.email,
          contact: shippingAddress.phone,
        },
        description: `Order for ${items.length} piece${items.length > 1 ? "s" : ""}`,
        onAvailabilityError: ({ copy, productId }) =>
          applyCheckoutConflict(
            { copy, productId },
            {
              // A create-order refusal can settle lines on the server.
              refresh: refreshAfterBagChange,
              removeFromBag,
              showConflict: showCheckoutConflict,
            },
          ),
        onPaid: async (path) => {
          clearCheckoutAttempt();
          // The paid order removes only its own server cart rows. Pull that
          // canonical bag before leaving; clearing the whole browser mirror
          // would also hide unrelated items added in another tab.
          await refreshAfterBagChange();
          announceCartChangedAcrossTabs(serverCartUserId);
          toast.success("Order placed successfully!");
          router.push(path);
        },
      });
    } finally {
      // On the payment-link redirect path the page is already navigating away;
      // on the modal path isSubmitting keeps the button disabled. Releasing the
      // ref here re-enables retry after an error or a dismissed modal.
      submitLockRef.current = false;
    }
  };
  const payBlockedByConflict =
    (checkoutConflict?.blockPayment ?? false) ||
    checkoutViewerStatus !== "trusted" ||
    hasSoldCartItem ||
    hasUncheckedCartItem;

  const handleCheckoutAuthSuccess = async () => {
    goToStep("shipping");
    await queryClient.invalidateQueries({
      queryKey: ["addresses", serverCartUserId ?? "anonymous"],
    });
    await addressesQuery.refetch();
    router.refresh();
  };

  const content = (
    <>
      {!embedded ? (
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-ftt-burgundy transition hover:text-ftt-burgundy"
        >
          <ChevronLeft className="size-4" />
          Back to cart
        </Link>
      ) : null}

      {!hasHydrated ? (
        <div className="mt-8 rounded-3xl border border-ftt-border bg-ftt-card p-8 text-center text-sm text-ftt-burgundy/60 shadow-[var(--ftt-soft-shadow)]">
          Loading your bag…
        </div>
      ) : !hasItems ? (
        <div className="mt-8 space-y-6">
          <CheckoutConflictNotice conflict={checkoutConflict} />
          <EmptyCart featuredPicks={featuredPicks} />
        </div>
      ) : !isAuthenticated ? (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7 xl:col-span-8">
            <CheckoutAuthGate
              isCheckingSession={sessionStatus === "loading"}
              onSuccess={handleCheckoutAuthSuccess}
            />
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-24">
              <OrderSummary
                items={items}
                subtotal={subtotal}
                shippingMethod={shippingMethod}
                shippingCost={shippingCost}
                taxAmount={taxAmount}
                taxRateLabel={taxRateLabel}
                total={total}
                onRemoveItem={handleRemoveItem}
                isReleasing={isReleasing}
                onViewerState={reportLineVerdict}
                disabled={isSubmitting}
                error={error}
                conflict={checkoutConflict}
                discount={{
                  code: discountCode,
                  onCodeChange: setDiscountCode,
                  applied: discountApplied,
                  error: discountError,
                  isValidating: isValidatingDiscount,
                  onApply: () => void handleValidateDiscount(),
                  onRemove: handleRemoveDiscount,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
            <CheckoutProgress
              currentStep={currentStep}
              onStepChange={goToStep}
            />

            <div key={currentStep} className="ftt-step-enter space-y-4">
              {currentStep === "shipping" ? (
                <>
                  <SavedAddressPicker
                    addresses={savedAddresses ?? []}
                    onSelect={handleAddressSelect}
                  />
                  <CheckoutAddressForm
                    eyebrow={STEP_COPY.shipping.eyebrow}
                    heading={STEP_COPY.shipping.heading}
                    description={STEP_COPY.shipping.description}
                    value={shippingAddress}
                    onChange={setShippingAddress}
                    errors={shippingErrors}
                    disabled={isSubmitting}
                    withPlaceSearch
                  />
                  <div className="rounded-3xl border border-ftt-border bg-ftt-card p-4">
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-ftt-burgundy/70">
                      <Checkbox
                        checked={saveShippingAddress}
                        onCheckedChange={(value) =>
                          setSaveShippingAddress(value === true)
                        }
                        className={saveCheckbox}
                      />
                      Save this address to my trunk
                    </label>
                    {saveShippingAddress ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ftt-border/70 pt-3">
                        <span className="text-xs font-medium text-ftt-burgundy/55">
                          Save as
                        </span>
                        {(["Home", "Office", "Other"] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setSaveLabelKind(kind)}
                            className={cn(
                              "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                              saveLabelKind === kind
                                ? "border-ftt-navy bg-ftt-navy text-ftt-ivory"
                                : "border-ftt-border bg-ftt-ivory text-ftt-burgundy/70 hover:border-ftt-gold",
                            )}
                          >
                            {kind}
                          </button>
                        ))}
                        {saveLabelKind === "Other" ? (
                          <input
                            value={customSaveLabel}
                            onChange={(event) =>
                              setCustomSaveLabel(event.target.value)
                            }
                            placeholder="Name this address"
                            maxLength={40}
                            className="h-8 min-w-40 flex-1 rounded-full border border-ftt-border bg-ftt-ivory px-3.5 text-xs text-ftt-navy outline-none transition placeholder:text-ftt-burgundy/35 focus:border-ftt-gold focus:ring-2 focus:ring-ftt-gold/20"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <CheckoutStepActions
                    primaryLabel="Continue to billing"
                    onPrimary={goToBilling}
                  />
                </>
              ) : null}

              {currentStep === "billing" ? (
                <>
                  <BillingStep
                    sameAsShipping={billingSameAsShipping}
                    onSameAsShippingChange={setBillingSameAsShipping}
                    billingAddress={billingAddress}
                    onBillingChange={setBillingAddress}
                    billingErrors={billingErrors}
                    saveBillingAddress={saveBillingAddress}
                    onSaveBillingChange={setSaveBillingAddress}
                    disabled={isSubmitting}
                  />
                  <CheckoutStepActions
                    secondaryLabel="Back to shipping"
                    onSecondary={() => goToStep("shipping")}
                    primaryLabel="Choose packaging"
                    onPrimary={goToPackaging}
                  />
                </>
              ) : null}

              {currentStep === "packaging" ? (
                <>
                  <PackagingStep
                    shippingMethod={shippingMethod}
                    onChange={setShippingMethod}
                    effectiveSubtotal={effectiveSubtotal}
                  />
                  {/* Gift selection paused — kept intact; flip ENABLE_GIFTING to re-enable. */}
                  {ENABLE_GIFTING ? (
                    <GiftOptions
                      isGift={isGift}
                      onGiftChange={setIsGift}
                      includeMessage={includeGiftMessage}
                      onIncludeMessageChange={setIncludeGiftMessage}
                      giftMessage={giftMessage}
                      onGiftMessageChange={setGiftMessage}
                      senderName={giftFrom}
                      onSenderNameChange={setGiftFrom}
                      disabled={isSubmitting}
                    />
                  ) : null}
                  <CheckoutStepActions
                    secondaryLabel="Back to billing"
                    onSecondary={() => goToStep("billing")}
                    primaryLabel="Review order"
                    onPrimary={() => goToStep("review")}
                  />
                </>
              ) : null}

              {currentStep === "review" ? (
                <>
                  <ReviewStep
                    shippingAddress={shippingAddress}
                    billingAddress={resolvedBilling}
                    billingSameAsShipping={billingSameAsShipping}
                    shippingMethod={shippingMethod}
                    isGift={isGift}
                    giftMessage={
                      isGift && includeGiftMessage ? giftMessage.trim() : ""
                    }
                    giftFrom={isGift ? giftFrom.trim() : ""}
                  />

                  <div className="rounded-3xl border border-ftt-border bg-ftt-card p-5 text-sm shadow-[var(--ftt-soft-shadow)]">
                    <p className="font-serif text-base text-ftt-navy">
                      Returns & unique pieces
                    </p>
                    <p className="mt-2 leading-6 text-ftt-burgundy/70">
                      Returns are accepted only within{" "}
                      <span className="font-semibold text-ftt-navy">
                        7 days of delivery
                      </span>{" "}
                      and must be initiated by you. As every saree is pre-loved
                      and unique, please review our{" "}
                      <Link
                        href="/policies/return-refund-policy"
                        className="font-semibold text-ftt-burgundy underline underline-offset-2 hover:text-ftt-navy"
                      >
                        Return Policy
                      </Link>{" "}
                      and{" "}
                      <Link
                        href="/policies/terms-of-service"
                        className="font-semibold text-ftt-burgundy underline underline-offset-2 hover:text-ftt-navy"
                      >
                        Terms &amp; Conditions
                      </Link>{" "}
                      before placing your order.
                    </p>

                    <label className="mt-4 flex cursor-pointer items-start gap-3 text-ftt-burgundy/80">
                      <Checkbox
                        checked={agreedToTerms}
                        onCheckedChange={(value) =>
                          setAgreedToTerms(value === true)
                        }
                        className={cn(saveCheckbox, "mt-0.5")}
                        aria-label="Agree to Terms and Policies"
                      />
                      <span>
                        I have read and agree to the{" "}
                        <Link
                          href="/policies/terms-of-service"
                          className="font-semibold text-ftt-burgundy underline underline-offset-2 hover:text-ftt-navy"
                        >
                          Terms &amp; Conditions
                        </Link>{" "}
                        and{" "}
                        <Link
                          href="/policies"
                          className="font-semibold text-ftt-burgundy underline underline-offset-2 hover:text-ftt-navy"
                        >
                          Policies
                        </Link>{" "}
                        of From the Trunk.
                      </span>
                    </label>
                  </div>

                  {/* Task 6: blouse pairing availability note at the end of checkout. */}
                  <div className="rounded-3xl border border-ftt-gold/40 bg-ftt-burgundy p-4 text-sm shadow-[var(--ftt-soft-shadow)]">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-ivory">
                      <Info className="size-3.5" /> Blouse availability
                    </p>
                    <p className="mt-2 leading-6 text-ftt-ivory/85">
                      {cartHasBlouse
                        ? "Your order includes a blouse. Blouse pairing is subject to availability. Our team will confirm the available blouse options before dispatch."
                        : "Blouse pairing is subject to availability. Our team will confirm the available blouse options before dispatch."}
                    </p>
                  </div>

                  <CheckoutStepActions
                    secondaryLabel="Back to packaging"
                    onSecondary={() => goToStep("packaging")}
                    primaryLabel={
                      isSubmitting
                        ? "Processing…"
                        : checkoutViewerStatus === "checking" ||
                            hasUncheckedCartItem
                          ? "Checking availability…"
                          : "Proceed to payment"
                    }
                    onPrimary={handlePay}
                    disabledPrimary={!hasItems || isSubmitting || !agreedToTerms || payBlockedByConflict}
                    primaryLoading={isSubmitting}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-24">
              <OrderSummary
                items={items}
                subtotal={subtotal}
                shippingMethod={shippingMethod}
                shippingCost={shippingCost}
                taxAmount={taxAmount}
                taxRateLabel={taxRateLabel}
                total={total}
                onRemoveItem={handleRemoveItem}
                isReleasing={isReleasing}
                onViewerState={reportLineVerdict}
                disabled={isSubmitting}
                error={error}
                conflict={checkoutConflict}
                discount={{
                  code: discountCode,
                  onCodeChange: setDiscountCode,
                  applied: discountApplied,
                  error: discountError,
                  isValidating: isValidatingDiscount,
                  onApply: () => void handleValidateDiscount(),
                  onRemove: handleRemoveDiscount,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <main className="mx-auto w-full max-w-7xl grow px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
      {content}
    </main>
  );
}

function CheckoutConflictNotice({
  conflict,
}: {
  conflict: OneOfOneConflictCopy | null;
}) {
  if (!conflict) return null;

  return (
    <div
      aria-live="polite"
      className="mx-auto max-w-2xl rounded-2xl border border-ftt-burgundy/20 bg-ftt-card p-5 text-sm text-ftt-burgundy shadow-[var(--ftt-soft-shadow)]"
    >
      <p className="font-serif text-lg text-ftt-navy">{conflict.title}</p>
      <p className="mt-2 leading-6 text-ftt-burgundy/75">
        {conflict.message}
      </p>
      {conflict.ctaHref ? (
        <Link
          href={conflict.ctaHref}
          className="mt-3 inline-flex rounded-full border border-ftt-burgundy/30 bg-ftt-ivory px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ftt-burgundy transition hover:bg-ftt-burgundy hover:text-ftt-ivory"
        >
          {conflict.ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
