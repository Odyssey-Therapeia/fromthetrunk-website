"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import type { AddressForm } from "@/lib/checkout/address-form";
import type { GeoSuggestion } from "@/lib/geo/photon";
import { cn } from "@/lib/utils";

import type { MapPosition } from "./location-map";

// Map is client-only (Leaflet needs `window`); a skeleton holds its space.
const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-2xl border border-ftt-border bg-ftt-ivory" />
  ),
});

/** Merge a normalized geo result into the address form, keeping existing values as fallback. */
const applySuggestion = (
  value: AddressForm,
  suggestion: GeoSuggestion,
): AddressForm => {
  return {
    ...value,
    line1: suggestion.line1 || value.line1,
    city: suggestion.city || value.city,
    state: suggestion.state || value.state,
    postalCode: suggestion.postalCode || value.postalCode,
    country: suggestion.country || value.country,
  };
};

type AddressAutocompleteProps = {
  label: string;
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Address line 1 with local place-search proxy + a Leaflet map pin. Typed text
 * is always kept and saveable even when search or reverse geocoding fails.
 */
export function AddressAutocomplete({
  label,
  value,
  onChange,
  error,
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<MapPosition | null>(null);
  const skipFetch = useRef(false);

  // Debounced server-side geo search. The UI only consumes our stable shape,
  // never raw Photon payloads.
  useEffect(() => {
    const query = value.line1.trim();
    const timer = setTimeout(async () => {
      if (skipFetch.current) {
        skipFetch.current = false;
        return;
      }
      if (query.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        const res = await fetch(`/api/v2/geo/search?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const data = res.ok ? await res.json() : null;
        const nextSuggestions: GeoSuggestion[] = Array.isArray(
          data?.suggestions,
        )
          ? data.suggestions
          : [];
        setSuggestions(nextSuggestions);
        setOpen(nextSuggestions.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value.line1]);

  const handleSelect = (suggestion: GeoSuggestion) => {
    skipFetch.current = true;
    setPosition({ lat: suggestion.lat, lng: suggestion.lon });
    setOpen(false);
    setSuggestions([]);
    onChange(applySuggestion(value, suggestion));
  };

  const handlePinChange = async (lat: number, lng: number) => {
    setPosition({ lat, lng });
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
      });
      const res = await fetch(`/api/v2/geo/reverse?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      const suggestion: GeoSuggestion | null = data?.suggestion ?? null;
      if (suggestion) {
        skipFetch.current = true;
        onChange(applySuggestion(value, suggestion));
      }
    } catch {
      // Reverse geocoding is best-effort; the pin still moved.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        {label}
      </span>
      <div className="relative z-30">
        <input
          value={value.line1}
          onChange={(event) => {
            skipFetch.current = false;
            onChange({ ...value, line1: event.target.value });
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          disabled={disabled}
          placeholder="Search your address, or just type it in"
          autoComplete="off"
          className={cn(
            "h-12 w-full rounded-xl border bg-ftt-ivory px-4 pr-10 text-sm text-ftt-navy outline-none transition placeholder:text-ftt-burgundy/30 focus:ring-2 disabled:opacity-60",
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-ftt-border focus:border-ftt-gold focus:ring-ftt-gold/20",
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ftt-burgundy/40">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MapPin className="size-4" />
          )}
        </span>
        {open && suggestions.length > 0 ? (
          <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-ftt-border bg-ftt-card shadow-[var(--ftt-soft-shadow)]">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(suggestion)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-ftt-navy transition hover:bg-ftt-gold/8"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ftt-gold" />
                  <span>{suggestion.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-[11px] text-ftt-burgundy/50">
        Search to drop a pin, or just type your address — it saves either way.
      </p>
      <LocationMap position={position} onPositionChange={handlePinChange} />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
