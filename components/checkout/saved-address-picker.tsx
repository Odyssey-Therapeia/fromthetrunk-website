"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Address } from "@/types/domain";

type SavedAddressPickerProps = {
  addresses: Address[];
  onSelect: (addressId: string) => void;
};

const addressTitle = (address: Address) =>
  address.label || address.name || address.line1 || "Saved address";

const addressLine = (address: Address) =>
  [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

/** Gold-tinted panel that lets a returning customer pull from their trunk. */
export function SavedAddressPicker({
  addresses,
  onSelect,
}: SavedAddressPickerProps) {
  const [selectedId, setSelectedId] = useState("");

  if (addresses.length === 0) return null;

  const selected = addresses.find((address) => address.id === selectedId);

  return (
    <div className="rounded-3xl border border-ftt-gold/25 bg-ftt-gold/8 p-4">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        Use a saved address
      </Label>
      <Select
        value={selectedId}
        onValueChange={(id) => {
          setSelectedId(id);
          onSelect(id);
        }}
      >
        <SelectTrigger className="mt-2 h-auto min-h-12 border-ftt-border bg-ftt-ivory py-2 text-left text-ftt-navy [&>span]:line-clamp-none">
          {selected ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-semibold text-ftt-navy">
                {addressTitle(selected)}
              </span>
              <span className="truncate text-xs font-normal text-ftt-burgundy/60">
                {addressLine(selected)}
              </span>
            </span>
          ) : (
            <SelectValue placeholder="Choose from your address book" />
          )}
        </SelectTrigger>
        <SelectContent>
          {addresses.map((address) => (
            <SelectItem key={address.id} value={address.id} className="py-2">
              <span className="flex flex-col gap-0.5 text-left">
                <span className="font-semibold text-ftt-navy">
                  {addressTitle(address)}
                  {address.isDefault ? (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ftt-gold">
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-normal text-ftt-burgundy/60">
                  {addressLine(address)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
