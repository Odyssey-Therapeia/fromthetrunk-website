import { SuggestInput } from "@/components/address/suggest-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddressFieldErrors, AddressForm } from "@/lib/checkout/address-form";
import { INDIA_CITIES } from "@/lib/checkout/india-cities";
import {
  DEFAULT_COUNTRY_CODE,
  getCountryByCode,
  getCountryByName,
  INDIA_STATES,
  isIndia,
} from "@/lib/checkout/locations";
import { cn } from "@/lib/utils";

import { AddressAutocomplete } from "./address-autocomplete";
import { CheckoutField } from "./checkout-field";
import { CountryCombobox } from "./country-combobox";
import { PhoneField } from "./phone-field";

type CheckoutAddressFormProps = {
  eyebrow: string;
  heading: string;
  description: string;
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  errors?: AddressFieldErrors;
  disabled?: boolean;
  /** Shipping uses Photon place search + map; billing uses a plain field. */
  withPlaceSearch?: boolean;
};

const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65";

const fttInputBase =
  "h-12 w-full rounded-xl border bg-ftt-ivory px-4 text-sm text-ftt-navy outline-none transition placeholder:text-ftt-burgundy/30 focus:ring-2 disabled:opacity-60";
const fttInputOk =
  "border-ftt-border focus:border-ftt-gold focus:ring-ftt-gold/20";
const fttInputError =
  "border-destructive focus:border-destructive focus:ring-destructive/20";

/** The shared shipping / billing address card. */
export function CheckoutAddressForm({
  eyebrow,
  heading,
  description,
  value,
  onChange,
  errors = {},
  disabled,
  withPlaceSearch,
}: CheckoutAddressFormProps) {
  const update = (key: keyof AddressForm) => (next: string) =>
    onChange({ ...value, [key]: next });

  const india = isIndia(value.country);
  const countryCode = getCountryByName(value.country)?.code ?? DEFAULT_COUNTRY_CODE;

  return (
    <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-7">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-2xl leading-tight text-ftt-navy sm:text-3xl">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ftt-burgundy/65">
          {description}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <CheckoutField
          className="md:col-span-2"
          label="Full name"
          value={value.fullName}
          onChange={update("fullName")}
          error={errors.fullName}
          disabled={disabled}
          autoComplete="name"
          fieldName="fullName"
        />
        <CheckoutField
          className="md:col-span-2"
          label="Email"
          type="email"
          value={value.email}
          onChange={update("email")}
          error={errors.email}
          disabled={disabled}
          autoComplete="email"
          fieldName="email"
        />
        <PhoneField
          className="md:col-span-2"
          label="Phone"
          value={value.phone}
          country={value.phoneCountry}
          onValueChange={(phone) => onChange({ ...value, phone })}
          onCountryChange={(phoneCountry) => onChange({ ...value, phoneCountry })}
          error={errors.phone}
          disabled={disabled}
          fieldName="phone"
        />

        <CheckoutField
          className="md:col-span-2"
          label="Apartment / flat, floor number, building"
          value={value.line1}
          onChange={update("line1")}
          error={errors.line1}
          disabled={disabled}
          autoComplete="address-line1"
          fieldName="line1"
        />

        {withPlaceSearch ? (
          <AddressAutocomplete
            className="md:col-span-2"
            label="Area / Landmark"
            value={value}
            onChange={onChange}
            disabled={disabled}
            field="landmark"
            fieldName="landmark"
            mapPlacement="side"
            placeholder="Search area, landmark, or neighbourhood"
          />
        ) : (
          <CheckoutField
            className="md:col-span-2"
            label="Area / Landmark"
            value={value.landmark}
            onChange={update("landmark")}
            disabled={disabled}
            autoComplete="address-line2"
            fieldName="landmark"
          />
        )}

        <div className="flex flex-col gap-2">
          <span className={labelClass}>City</span>
          <SuggestInput
            id="city"
            value={value.city}
            onChange={(city) => onChange({ ...value, city })}
            options={INDIA_CITIES}
            filter={(item, query) =>
              item.name.toLowerCase().includes(query.toLowerCase())
            }
            getLabel={(item) => item.name}
            getSublabel={(item) => item.state}
            onSelect={(item) =>
              onChange({
                ...value,
                city: item.name,
                state: item.state,
                country: "India",
              })
            }
            placeholder="Start typing your city"
            disabled={disabled}
            fieldName="city"
            inputClassName={cn(
              fttInputBase,
              errors.city ? fttInputError : fttInputOk,
            )}
          />
          {errors.city ? (
            <span className="text-xs text-destructive">{errors.city}</span>
          ) : null}
        </div>

        {india ? (
          <div className="flex flex-col gap-2">
            <span className={labelClass}>State</span>
            <Select
              value={INDIA_STATES.includes(value.state) ? value.state : ""}
              onValueChange={(state) => onChange({ ...value, state })}
              disabled={disabled}
            >
              <SelectTrigger
                aria-invalid={errors.state ? true : undefined}
                data-checkout-field="state"
                className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy"
              >
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIA_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.state ? (
              <span className="text-xs text-destructive">{errors.state}</span>
            ) : null}
          </div>
        ) : (
          <CheckoutField
            label="State / Province"
            value={value.state}
            onChange={update("state")}
            error={errors.state}
            disabled={disabled}
            autoComplete="address-level1"
            fieldName="state"
          />
        )}

        <CheckoutField
          label={india ? "PIN code" : "Postal code"}
          value={value.postalCode}
          onChange={update("postalCode")}
          error={errors.postalCode}
          disabled={disabled}
          autoComplete="postal-code"
          fieldName="postalCode"
        />

        <div className="flex flex-col gap-2">
          <span className={labelClass}>Country</span>
          <CountryCombobox
            value={countryCode}
            onChange={(code) =>
              onChange({
                ...value,
                country: getCountryByCode(code)?.name ?? value.country,
              })
            }
            disabled={disabled}
            error={Boolean(errors.country)}
            fieldName="country"
          />
          {errors.country ? (
            <span className="text-xs text-destructive">{errors.country}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
