"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SuggestInputProps<T> = {
  value: string;
  /** Free-text typing — the field is always editable, even with no match. */
  onChange: (value: string) => void;
  options: T[];
  filter: (item: T, query: string) => boolean;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string;
  /** Called when a suggestion is chosen (so callers can fill related fields). */
  onSelect: (item: T) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  fieldName?: string;
  inputClassName?: string;
  maxResults?: number;
};

/**
 * A free-text input with a filtered suggestion dropdown. Backed by a static
 * list (cities, states, countries). Selecting a suggestion fills the field via
 * `onSelect`; typing anything is always allowed.
 */
export function SuggestInput<T>({
  value,
  onChange,
  options,
  filter,
  getLabel,
  getSublabel,
  onSelect,
  id,
  placeholder,
  disabled,
  fieldName,
  inputClassName,
  maxResults = 8,
}: SuggestInputProps<T>) {
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const query = value.trim();
    if (!query) return [] as T[];
    return options.filter((item) => filter(item, query)).slice(0, maxResults);
  }, [options, value, filter, maxResults]);

  // Hide the dropdown when the only match already equals the value (i.e. chosen).
  const showList =
    open &&
    matches.length > 0 &&
    !(matches.length === 1 && getLabel(matches[0]) === value.trim());

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        data-checkout-field={fieldName}
        className={cn(inputClassName)}
      />
      {showList ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg">
          {matches.map((item, index) => (
            <li key={`${getLabel(item)}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent/10"
              >
                <span>{getLabel(item)}</span>
                {getSublabel ? (
                  <span className="text-xs text-muted-foreground">
                    {getSublabel(item)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
