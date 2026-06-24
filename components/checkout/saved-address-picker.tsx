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

/** Gold-tinted panel that lets a returning customer pull from their trunk. */
export function SavedAddressPicker({
  addresses,
  onSelect,
}: SavedAddressPickerProps) {
  if (addresses.length === 0) return null;

  return (
    <div className="rounded-3xl border border-ftt-gold/25 bg-ftt-gold/8 p-4">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        Use a saved address
      </Label>
      <Select onValueChange={onSelect}>
        <SelectTrigger className="mt-2 border-ftt-border bg-ftt-ivory text-ftt-navy">
          <SelectValue placeholder="Choose from your address book" />
        </SelectTrigger>
        <SelectContent>
          {addresses.map((address) => (
            <SelectItem key={address.id} value={address.id}>
              {address.label || address.name || address.line1 || "Saved address"}
              {address.city ? `, ${address.city}` : ""}
              {address.isDefault ? " · Default" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
