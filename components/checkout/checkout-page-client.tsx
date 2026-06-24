"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
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
import { type CheckoutStep, STEP_COPY } from "@/lib/checkout/steps";
import { useCheckoutPayment } from "@/lib/checkout/use-checkout-payment";
import { getCartTotals, useCartStore } from "@/lib/store/cart-store";
import type { Address, Product } from "@/types/domain";

import { BillingStep } from "./billing-step";
import { CheckoutAddressForm } from "./checkout-address-form";
import { CheckoutProgress } from "./checkout-progress";
import { CheckoutStepActions } from "./checkout-step-actions";
import { EmptyCart } from "./empty-cart";
import { GiftOptions } from "./gift-options";
import { OrderSummary } from "./order-summary";
import { PackagingStep } from "./packaging-step";
import { ReviewStep } from "./review-step";
import { SavedAddressPicker } from "./saved-address-picker";

const fetchAddresses = async (): Promise<Address[]> => {
  const response = await fetch("/api/v2/addresses");
  if (!response.ok) return [];
  return (await response.json()) as Address[];
};

const saveCheckbox =
  "border-ftt-navy data-[state=checked]:border-ftt-navy data-[state=checked]:bg-ftt-navy";

export function CheckoutPageClient({
  featuredPicks,
}: {
  featuredPicks: Product[];
}) {
  const router = useRouter();
  const { data: session } = useSession();

  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const { subtotal } = getCartTotals(items);
  const hasItems = hasHydrated && items.length > 0;

  const payment = useCheckoutPayment();
  const { isSubmitting, error } = payment;

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
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("standard");
  const [shippingErrors, setShippingErrors] = useState<AddressFieldErrors>({});
  const [billingErrors, setBillingErrors] = useState<AddressFieldErrors>({});
  const [isGift, setIsGift] = useState(false);
  const [includeGiftMessage, setIncludeGiftMessage] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftFrom, setGiftFrom] = useState("");

  const { data: savedAddresses } = useQuery({
    queryKey: ["checkout-addresses"],
    queryFn: fetchAddresses,
    enabled: Boolean(session?.user?.id),
  });

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

  const resolvedBilling = billingSameAsShipping ? shippingAddress : billingAddress;

  const handleAddressSelect = (addressId: string) => {
    const address = savedAddresses?.find((item) => item.id === addressId);
    if (!address) return;
    setShippingAddress(savedAddressToForm(address, shippingAddress.email));
    setShippingErrors({});
    toast.success("Address added from your saved trunk.");
  };

  const handleRemoveItem = (id: string) => {
    removeItem(id);
    toast("Removed from your trunk.");
  };

  // Addresses are saved to the account as soon as the customer advances past
  // each step (not at payment), so the address book fills even if checkout is
  // abandoned. The refs make each save idempotent across back-and-forth.
  const savedShippingRef = useRef(false);
  const savedBillingRef = useRef(false);

  const saveShippingToAccount = async () => {
    if (!session?.user?.id || !saveShippingAddress || savedShippingRef.current) {
      return;
    }
    savedShippingRef.current = true;
    try {
      const res = await fetch("/api/v2/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toSavedAddressPayload(shippingAddress, {
            label: "Delivery",
            isDefault: true,
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
    if (hasErrors(errors)) return;
    void saveShippingToAccount();
    setCurrentStep("billing");
  };

  const goToPackaging = () => {
    if (billingSameAsShipping) {
      setCurrentStep("packaging");
      return;
    }
    const errors = validateAddressForm(billingAddress);
    setBillingErrors(errors);
    if (hasErrors(errors)) return;
    void saveBillingToAccount();
    setCurrentStep("packaging");
  };

  const handlePay = async () => {
    if (!hasItems) return;

    const shipErrors = validateAddressForm(shippingAddress);
    if (hasErrors(shipErrors)) {
      setShippingErrors(shipErrors);
      setCurrentStep("shipping");
      return;
    }
    if (!billingSameAsShipping) {
      const billErrors = validateAddressForm(billingAddress);
      if (hasErrors(billErrors)) {
        setBillingErrors(billErrors);
        setCurrentStep("billing");
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
          ...(item.reservationToken ? { reservationToken: item.reservationToken } : {}),
        })),
        shippingAddress: toOrderAddress(shippingAddress),
        shippingMethod,
        ...(discountApplied ? { discountCode: discountApplied.code } : {}),
      },
      prefill: {
        name: fullName(shippingAddress),
        email: shippingAddress.email,
        contact: shippingAddress.phone,
      },
      description: `Order for ${items.length} piece${items.length > 1 ? "s" : ""}`,
      onPaid: (path) => {
        clearCart();
        toast.success("Order placed successfully!");
        router.push(path);
      },
    });
  };

  return (
    <main className="mx-auto w-full max-w-7xl grow px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
      <Link
        href="/cart"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65 transition hover:text-ftt-burgundy"
      >
        <ChevronLeft className="size-4" />
        Back to cart
      </Link>

      {!hasHydrated ? (
        <div className="mt-8 rounded-3xl border border-ftt-border bg-ftt-card p-8 text-center text-sm text-ftt-burgundy/60 shadow-[var(--ftt-soft-shadow)]">
          Loading your bag…
        </div>
      ) : !hasItems ? (
        <div className="mt-8">
          <EmptyCart featuredPicks={featuredPicks} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
            <CheckoutProgress
              currentStep={currentStep}
              onStepChange={setCurrentStep}
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
                  <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-ftt-border bg-ftt-card p-4 text-sm text-ftt-burgundy/70">
                    <Checkbox
                      checked={saveShippingAddress}
                      onCheckedChange={(value) =>
                        setSaveShippingAddress(value === true)
                      }
                      className={saveCheckbox}
                    />
                    Save this address to my trunk
                  </label>
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
                    onSecondary={() => setCurrentStep("shipping")}
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
                  <CheckoutStepActions
                    secondaryLabel="Back to billing"
                    onSecondary={() => setCurrentStep("billing")}
                    primaryLabel="Review order"
                    onPrimary={() => setCurrentStep("review")}
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
                  <CheckoutStepActions
                    secondaryLabel="Back to packaging"
                    onSecondary={() => setCurrentStep("packaging")}
                    primaryLabel={isSubmitting ? "Processing…" : "Proceed to payment"}
                    onPrimary={handlePay}
                    disabledPrimary={!hasItems || isSubmitting}
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
                disabled={isSubmitting}
                error={error}
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
    </main>
  );
}
