"use client";

import type { CountryCode } from "libphonenumber-js";

import { CheckoutField } from "@/components/checkout/checkout-field";
import { CountryCombobox } from "@/components/checkout/country-combobox";
import { PhoneField } from "@/components/checkout/phone-field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddressFieldErrors, AddressForm } from "@/lib/checkout/address-form";
import {
  DEFAULT_COUNTRY_CODE,
  getCountryByCode,
  getCountryByName,
  INDIA_STATES,
  isIndia,
} from "@/lib/checkout/locations";
import { cn } from "@/lib/utils";

const ADDRESS_LABELS = ["Home", "Work", "Studio", "Family", "Other"];

type SignupAddressStepProps = {
  value: AddressForm;
  label: string;
  errors: AddressFieldErrors;
  disabled?: boolean;
  onChange: (value: AddressForm) => void;
  onLabelChange: (label: string) => void;
};

export function SignupAddressStep({
  value,
  label,
  errors,
  disabled,
  onChange,
  onLabelChange,
}: SignupAddressStepProps) {
  const update = (key: keyof AddressForm) => (next: string) =>
    onChange({ ...value, [key]: next });
  const countryCode = getCountryByName(value.country)?.code ?? DEFAULT_COUNTRY_CODE;
  const india = isIndia(value.country);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-gold">
          Delivery address
        </p>
        <h2 className="mt-2 font-serif text-2xl leading-tight text-ftt-navy">
          Add your first delivery address.
        </h2>
        <p className="mt-2 text-sm leading-6 text-ftt-burgundy/62">
          Add your first delivery address so checkout feels effortless.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
          Address label
        </span>
        <RadioGroup
          value={label}
          onValueChange={onLabelChange}
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
          aria-label="Address label"
          disabled={disabled}
        >
          {ADDRESS_LABELS.map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition",
                label === option
                  ? "border-ftt-gold bg-ftt-navy text-ftt-ivory"
                  : "border-ftt-border bg-ftt-ivory text-ftt-burgundy/70 hover:border-ftt-gold/50 hover:bg-ftt-gold/10",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroupItem
                value={option}
                className="border-current text-current"
                aria-label={option}
              />
              {option}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CheckoutField
          label="Recipient name"
          value={value.fullName}
          onChange={update("fullName")}
          error={errors.fullName}
          disabled={disabled}
          autoComplete="name"
          className="md:col-span-2"
        />

        <PhoneField
          label="Phone"
          value={value.phone}
          country={value.phoneCountry}
          onValueChange={(phone) => onChange({ ...value, phone })}
          onCountryChange={(phoneCountry: CountryCode) =>
            onChange({ ...value, phoneCountry })
          }
          error={errors.phone}
          disabled={disabled}
          className="md:col-span-2"
        />

        <CheckoutField
          label="Address line 1"
          value={value.line1}
          onChange={update("line1")}
          error={errors.line1}
          disabled={disabled}
          autoComplete="address-line1"
          className="md:col-span-2"
        />

        <CheckoutField
          label="Address line 2"
          value={value.line2}
          onChange={update("line2")}
          disabled={disabled}
          autoComplete="address-line2"
          className="md:col-span-2"
        />

        <CheckoutField
          label="City"
          value={value.city}
          onChange={update("city")}
          error={errors.city}
          disabled={disabled}
          autoComplete="address-level2"
        />

        {india ? (
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
              State
            </span>
            <Select
              value={INDIA_STATES.includes(value.state) ? value.state : ""}
              onValueChange={(state) => onChange({ ...value, state })}
              disabled={disabled}
            >
              <SelectTrigger className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {INDIA_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {errors.state ? (
              <span className="text-xs text-destructive">{errors.state}</span>
            ) : null}
          </label>
        ) : (
          <CheckoutField
            label="State"
            value={value.state}
            onChange={update("state")}
            error={errors.state}
            disabled={disabled}
            autoComplete="address-level1"
          />
        )}

        <CheckoutField
          label={india ? "Postal code" : "Postal code"}
          value={value.postalCode}
          onChange={update("postalCode")}
          error={errors.postalCode}
          disabled={disabled}
          autoComplete="postal-code"
        />

        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
            Country
          </span>
          <CountryCombobox
            value={countryCode}
            onChange={(code) =>
              onChange({
                ...value,
                country: getCountryByCode(code)?.name ?? value.country,
              })
            }
            disabled={disabled}
          />
          {errors.country ? (
            <span className="text-xs text-destructive">{errors.country}</span>
          ) : null}
        </label>
      </div>
    </div>
  );
}
