import { Checkbox } from "@/components/ui/checkbox";
import type { AddressFieldErrors, AddressForm } from "@/lib/checkout/address-form";
import { STEP_COPY } from "@/lib/checkout/steps";

import { CheckoutAddressForm } from "./checkout-address-form";

type BillingStepProps = {
  sameAsShipping: boolean;
  onSameAsShippingChange: (value: boolean) => void;
  billingAddress: AddressForm;
  onBillingChange: (next: AddressForm) => void;
  billingErrors?: AddressFieldErrors;
  saveBillingAddress: boolean;
  onSaveBillingChange: (value: boolean) => void;
  disabled?: boolean;
};

/** Billing step: a "same as shipping" toggle, with an optional billing form. */
export function BillingStep({
  sameAsShipping,
  onSameAsShippingChange,
  billingAddress,
  onBillingChange,
  billingErrors,
  saveBillingAddress,
  onSaveBillingChange,
  disabled,
}: BillingStepProps) {
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-4 rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-7">
        <Checkbox
          checked={sameAsShipping}
          onCheckedChange={(value) => onSameAsShippingChange(value === true)}
          disabled={disabled}
          className="mt-1 border-ftt-navy data-[state=checked]:border-ftt-navy data-[state=checked]:bg-ftt-navy"
        />
        <span>
          <span className="block font-serif text-2xl text-ftt-navy">
            Billing address is the same as shipping
          </span>
          <span className="mt-1 block text-sm leading-6 text-ftt-burgundy/65">
            Use this for faster checkout. Uncheck to add a separate billing
            address for your payment records.
          </span>
        </span>
      </label>

      {!sameAsShipping ? (
        <>
          <CheckoutAddressForm
            eyebrow={STEP_COPY.billing.eyebrow}
            heading="Billing address"
            description="This address will be used for invoice and payment records."
            value={billingAddress}
            onChange={onBillingChange}
            errors={billingErrors}
            disabled={disabled}
          />
          <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-ftt-border bg-ftt-card p-4 text-sm text-ftt-burgundy/70">
            <Checkbox
              checked={saveBillingAddress}
              onCheckedChange={(value) => onSaveBillingChange(value === true)}
              disabled={disabled}
              className="border-ftt-navy data-[state=checked]:border-ftt-navy data-[state=checked]:bg-ftt-navy"
            />
            Save this billing address to my trunk
          </label>
        </>
      ) : null}
    </div>
  );
}
