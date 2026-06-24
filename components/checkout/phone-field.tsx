"use client";

import {
  AsYouType,
  getCountryCallingCode,
  getExampleNumber,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";

import { cn } from "@/lib/utils";

import { CountryCombobox } from "./country-combobox";

/** Max national digits for a country, from its example number (India = 10). */
const nationalMaxLength = (country: CountryCode): number =>
  getExampleNumber(country, examples)?.nationalNumber.length ?? 15;

/** Strip the dial code from an E.164 value and format it nationally for display. */
const toNationalDisplay = (e164: string, country: CountryCode): string => {
  if (!e164) return "";
  const calling = getCountryCallingCode(country);
  let national = e164.startsWith("+") ? e164.slice(1) : e164;
  if (national.startsWith(calling)) national = national.slice(calling.length);
  return new AsYouType(country).input(national);
};

type PhoneFieldProps = {
  label: string;
  value: string;
  country: CountryCode;
  onValueChange: (e164: string) => void;
  onCountryChange: (country: CountryCode) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
};

/** International phone input: FTT country dropdown + nationally-formatted number. */
export function PhoneField({
  label,
  value,
  country,
  onValueChange,
  onCountryChange,
  error,
  disabled,
  className,
}: PhoneFieldProps) {
  const display = toNationalDisplay(value, country);

  const emitFromNational = (nationalInput: string, nextCountry: CountryCode) => {
    const digits = nationalInput
      .replace(/\D/g, "")
      .slice(0, nationalMaxLength(nextCountry));
    const e164 = digits
      ? `+${getCountryCallingCode(nextCountry)}${digits}`
      : "";
    onValueChange(e164);
  };

  const handleCountryChange = (next: CountryCode) => {
    onCountryChange(next);
    // Re-key the digits already entered to the newly selected country.
    emitFromNational(display, next);
  };

  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        {label}
      </span>
      <div className="flex gap-2">
        <CountryCombobox
          value={country}
          onChange={handleCountryChange}
          variant="phone"
          disabled={disabled}
          buttonClassName="w-32 shrink-0"
        />
        <input
          type="tel"
          inputMode="numeric"
          value={display}
          onChange={(event) => emitFromNational(event.target.value, country)}
          disabled={disabled}
          placeholder="98765 43210"
          autoComplete="tel-national"
          className={cn(
            "h-12 w-full rounded-xl border bg-ftt-ivory px-4 text-sm text-ftt-navy outline-none transition placeholder:text-ftt-burgundy/30 focus:ring-2 disabled:opacity-60",
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-ftt-border focus:border-ftt-gold focus:ring-ftt-gold/20",
          )}
        />
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
