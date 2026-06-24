"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRY_OPTIONS, getCountryByCode } from "@/lib/checkout/locations";
import { cn } from "@/lib/utils";

type CountryComboboxProps = {
  value: CountryCode;
  onChange: (code: CountryCode) => void;
  /** "address" shows the country name; "phone" shows the dial code. */
  variant?: "address" | "phone";
  disabled?: boolean;
  buttonClassName?: string;
};

/** Searchable country dropdown (flag · name · dial code) reused for phone + address. */
export function CountryCombobox({
  value,
  onChange,
  variant = "address",
  disabled,
  buttonClassName,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = getCountryByCode(value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        country.dialCode.includes(q) ||
        country.code.toLowerCase().includes(q),
    );
  }, [query]);

  const handleSelect = (code: CountryCode) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-12 items-center gap-2 rounded-xl border border-ftt-border bg-ftt-ivory px-3 text-sm text-ftt-navy outline-none transition focus:border-ftt-gold focus:ring-2 focus:ring-ftt-gold/20 disabled:opacity-60",
            buttonClassName,
          )}
        >
          <span className="text-base leading-none">{selected?.flag}</span>
          {variant === "phone" ? (
            <span className="font-medium">{selected?.dialCode}</span>
          ) : (
            <span className="flex-1 truncate text-left">
              {selected?.name ?? "Select country"}
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-ftt-burgundy/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-ftt-border bg-ftt-card p-0"
      >
        <div className="border-b border-ftt-border p-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search country"
            className="h-9 w-full rounded-lg border border-ftt-border bg-ftt-ivory px-3 text-sm text-ftt-navy outline-none placeholder:text-ftt-burgundy/40 focus:border-ftt-gold"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ftt-burgundy/50">
              No countries found
            </li>
          ) : (
            filtered.map((country) => {
              const active = country.code === value;
              return (
                <li key={country.code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(country.code)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-ftt-gold/12 text-ftt-navy"
                        : "text-ftt-navy/90 hover:bg-ftt-gold/8",
                    )}
                  >
                    <span className="text-base leading-none">{country.flag}</span>
                    <span className="flex-1 truncate">{country.name}</span>
                    <span className="text-xs text-ftt-burgundy/50">
                      {country.dialCode}
                    </span>
                    {active ? <Check className="size-4 text-ftt-gold" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
