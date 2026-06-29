import { Gift } from "lucide-react";

import {
  type AddressForm,
  composeAddressLine2,
  fullName,
} from "@/lib/checkout/address-form";
import { STEP_COPY } from "@/lib/checkout/steps";
import type { ShippingMethod } from "@/lib/config/order-pricing";

type ReviewStepProps = {
  shippingAddress: AddressForm;
  billingAddress: AddressForm;
  billingSameAsShipping: boolean;
  shippingMethod: ShippingMethod;
  isGift?: boolean;
  giftMessage?: string;
  giftFrom?: string;
};

/** Final review: shipping + billing summary cards, packaging, and gift note. */
export function ReviewStep({
  shippingAddress,
  billingAddress,
  billingSameAsShipping,
  shippingMethod,
  isGift,
  giftMessage,
  giftFrom,
}: ReviewStepProps) {
  return (
    <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
        {STEP_COPY.review.eyebrow}
      </p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ftt-navy sm:text-3xl">
        {STEP_COPY.review.heading}
      </h2>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ReviewAddress title="Shipping to" address={shippingAddress} />
        <ReviewAddress
          title="Billing"
          address={billingAddress}
          note={billingSameAsShipping ? "Same as shipping address" : undefined}
        />
      </div>

      <div className="mt-4 rounded-3xl border border-ftt-gold/25 bg-ftt-gold/8 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-gold">
          Packaging
        </p>
        <p className="mt-1 font-serif text-2xl text-ftt-navy">
          {shippingMethod === "express"
            ? "Premium Trunk Packaging"
            : "Normal Care Packaging"}
        </p>
      </div>

      {isGift ? (
        <div className="mt-4 rounded-3xl border border-ftt-gold/25 bg-ftt-gold/8 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-gold">
            <Gift className="size-3.5" /> Gift
          </p>
          <p className="mt-1 font-serif text-2xl text-ftt-navy">
            This is a gift
          </p>
          {giftFrom ? (
            <p className="mt-1 text-sm text-ftt-burgundy/65">From {giftFrom}</p>
          ) : null}
          {giftMessage ? (
            <p className="mt-2 whitespace-pre-line rounded-2xl border border-ftt-border bg-ftt-ivory p-3 text-sm italic leading-6 text-ftt-burgundy/75">
              &ldquo;{giftMessage}&rdquo;
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ReviewAddress({
  title,
  address,
  note,
}: {
  title: string;
  address: AddressForm;
  note?: string;
}) {
  const line2 = composeAddressLine2(address);

  return (
    <div className="rounded-3xl border border-ftt-border bg-ftt-ivory p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-gold">
        {title}
      </p>
      {note ? (
        <p className="mt-2 text-sm text-ftt-burgundy/60">{note}</p>
      ) : null}
      <p className="mt-2 font-medium text-ftt-navy">{fullName(address)}</p>
      <p className="mt-1 text-sm leading-6 text-ftt-burgundy/65">
        {address.line1}
        {line2 ? `, ${line2}` : ""}
        <br />
        {address.city}, {address.state} {address.postalCode}
        <br />
        {address.country}
      </p>
      {address.phone ? (
        <p className="mt-2 text-sm text-ftt-burgundy/65">{address.phone}</p>
      ) : null}
    </div>
  );
}
