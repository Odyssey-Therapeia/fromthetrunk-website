"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Home, MapPin, Pencil, Plus, Trash2 } from "lucide-react";

import { SuggestInput } from "@/components/address/suggest-input";
import { AddressAutocomplete } from "@/components/checkout/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { AddressForm } from "@/lib/checkout/address-form";
import { INDIA_CITIES } from "@/lib/checkout/india-cities";
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_COUNTRY_NAME,
  DEFAULT_STATE,
  INDIA_STATES,
} from "@/lib/checkout/locations";
import { cn } from "@/lib/utils";
import type { Address } from "@/types/domain";

const fetchAddresses = async () => {
  const response = await fetch("/api/v2/addresses");
  if (!response.ok) {
    throw new Error("Unable to load addresses.");
  }
  return (await response.json()) as Address[];
};

type AddressBookForm = {
  label: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const emptyForm: AddressBookForm = {
  label: "",
  name: "",
  line1: "",
  line2: "",
  city: "",
  state: DEFAULT_STATE,
  postalCode: "",
  country: DEFAULT_COUNTRY_NAME,
  phone: "",
  isDefault: false,
};

const toAddressForm = (address: Address) => ({
  label: address.label ?? "",
  name: address.name ?? "",
  line1: address.line1 ?? "",
  line2: address.line2 ?? "",
  city: address.city ?? "",
  state: address.state ?? "",
  postalCode: address.postalCode ?? "",
  country: address.country ?? "",
  phone: address.phone ?? "",
  isDefault: Boolean(address.isDefault),
});

const toAutocompleteAddress = (
  form: AddressBookForm,
  email: string,
): AddressForm => ({
  fullName: form.name,
  email,
  phone: form.phone,
  phoneCountry: DEFAULT_COUNTRY_CODE,
  line1: form.line1,
  line2: "",
  apartment: "",
  floorNumber: "",
  building: "",
  area: "",
  landmark: form.line2,
  city: form.city,
  state: form.state || DEFAULT_STATE,
  postalCode: form.postalCode,
  country: form.country || DEFAULT_COUNTRY_NAME,
});

const mergeAutocompleteAddress = (
  form: AddressBookForm,
  next: AddressForm,
): AddressBookForm => ({
  ...form,
  line1: next.line1,
  line2: next.landmark || next.area || next.line2,
  city: next.city,
  state: next.state,
  postalCode: next.postalCode,
  country: next.country,
});

export default function AddressesPage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["addresses"],
    queryFn: fetchAddresses,
    enabled: Boolean(session?.user?.id),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const response = await fetch("/api/v2/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to save address.");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<typeof form>;
    }) => {
      const response = await fetch(`/api/v2/addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to update address.");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v2/addresses/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Unable to delete address.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  if (status === "loading") {
    return <AddressState message="Loading your saved addresses..." />;
  }

  if (!session?.user?.id) {
    return (
      <AddressState message="Please sign in to manage your addresses.">
        <Button asChild className="mt-4 rounded-full bg-ftt-navy text-ftt-ivory">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </AddressState>
    );
  }

  const addresses = data ?? [];
  const activeMutation = createMutation.isPending || updateMutation.isPending;
  const accountEmail = session.user.email ?? "";
  const autocompleteAddress = toAutocompleteAddress(form, accountEmail);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
            Addresses
          </p>
          <h2 className="mt-2 font-serif text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.94] text-ftt-navy">
            Where should the trunk arrive?
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ftt-burgundy/60">
            Save delivery locations for faster checkout and smoother packing
            confirmation.
          </p>
        </div>

        <Badge className="w-fit rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-ftt-gold">
          Secure delivery details
        </Badge>
      </div>

      {isLoading ? (
        <AddressState message="Loading addresses..." />
      ) : isError ? (
        <AddressState message="Unable to load addresses right now." />
      ) : addresses.length === 0 ? (
        <AddressState message="No addresses saved yet. Add your first delivery location below." />
      ) : (
        <div className="grid max-w-full gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              isDeleting={deleteMutation.isPending}
              isUpdating={updateMutation.isPending}
              onEdit={() => {
                setEditingId(address.id);
                setForm(toAddressForm(address));
              }}
              onSetDefault={() =>
                updateMutation.mutate({
                  id: address.id,
                  payload: { isDefault: true },
                })
              }
              onRemove={() => deleteMutation.mutate(address.id)}
            />
          ))}
        </div>
      )}

      <form
        className="ftt-account-glow-card min-w-0 rounded-[1.75rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (editingId) {
            updateMutation.mutate({ id: editingId, payload: form });
          } else {
            createMutation.mutate(form);
          }
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-ftt-gold">
              {editingId ? "Update location" : "New location"}
            </p>
            <h3 className="mt-2 font-serif text-3xl leading-none text-ftt-navy">
              {editingId ? "Edit saved address" : "Add an address"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ftt-burgundy/58">
              Keep the delivery name, phone, and address exactly as the courier
              should see them.
            </p>
          </div>

          <div className="grid size-11 place-items-center rounded-full bg-ftt-navy text-ftt-gold">
            {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          </div>
        </div>

        <div className="mt-6 grid max-w-full gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField label="Label" htmlFor="label">
            <Input
              id="label"
              value={form.label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="Home, Studio, etc."
              className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
            />
          </FormField>

          <FormField label="Recipient name" htmlFor="name">
            <Input
              id="name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Full name"
              className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
            />
          </FormField>
        </div>

        <div className="mt-4 grid max-w-full gap-4 lg:grid-cols-[0.72fr_1.28fr] [&>*]:min-w-0">
          <FormField label="Phone" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
            />
          </FormField>

          <FormField
            label="Apartment / flat, floor number, building"
            htmlFor="line1"
          >
            <Input
              id="line1"
              value={form.line1}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, line1: event.target.value }))
              }
              autoComplete="address-line1"
              className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
            />
          </FormField>
        </div>

        <AddressAutocomplete
          className="mt-4"
          label="Area / Landmark"
          value={autocompleteAddress}
          onChange={(next) =>
            setForm((prev) => mergeAutocompleteAddress(prev, next))
          }
          field="landmark"
          fieldName="line2"
          mapPlacement="side"
          placeholder="Search area, landmark, or neighbourhood"
        />

        <div className="mt-4 grid max-w-full gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <FormField label="City" htmlFor="city">
            <SuggestInput
              id="city"
              value={form.city}
              onChange={(city) => setForm((prev) => ({ ...prev, city }))}
              options={INDIA_CITIES}
              filter={(item, query) =>
                item.name.toLowerCase().includes(query.toLowerCase())
              }
              getLabel={(item) => item.name}
              getSublabel={(item) => item.state}
              onSelect={(item) =>
                setForm((prev) => ({
                  ...prev,
                  city: item.name,
                  state: item.state,
                  country: prev.country || "India",
                }))
              }
              placeholder="Start typing your city"
            />
          </FormField>

          <FormField label="State" htmlFor="state">
            <SuggestInput
              id="state"
              value={form.state}
              onChange={(state) => setForm((prev) => ({ ...prev, state }))}
              options={INDIA_STATES}
              filter={(item, query) =>
                item.toLowerCase().includes(query.toLowerCase())
              }
              getLabel={(item) => item}
              onSelect={(item) => setForm((prev) => ({ ...prev, state: item }))}
              placeholder="Start typing your state"
            />
          </FormField>

          <FormField label="Postal code" htmlFor="postal">
            <Input
              id="postal"
              value={form.postalCode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, postalCode: event.target.value }))
              }
              className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
            />
          </FormField>
        </div>

        <div className="mt-4 grid max-w-full gap-4 md:grid-cols-1 [&>*]:min-w-0">
          <FormField label="Country" htmlFor="country">
            <SuggestInput
              id="country"
              value={form.country}
              onChange={(country) => setForm((prev) => ({ ...prev, country }))}
              options={COUNTRY_OPTIONS}
              filter={(item, query) =>
                item.name.toLowerCase().includes(query.toLowerCase())
              }
              getLabel={(item) => item.name}
              getSublabel={(item) => item.flag}
              onSelect={(item) =>
                setForm((prev) => ({ ...prev, country: item.name }))
              }
              placeholder="Start typing your country"
            />
          </FormField>
        </div>

        <Separator className="my-6 bg-ftt-border" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="isDefault"
            className="flex cursor-pointer items-center gap-3 rounded-full border border-ftt-border bg-ftt-ivory px-4 py-3 text-sm font-medium text-ftt-burgundy/70"
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border transition",
                form.isDefault
                  ? "border-ftt-navy bg-ftt-navy text-ftt-gold"
                  : "border-ftt-border text-transparent",
              )}
            >
              <Check className="size-3" />
            </span>
            <input
              id="isDefault"
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  isDefault: event.target.checked,
                }))
              }
              className="sr-only"
            />
            Set as default address
          </label>

          <div className="flex flex-wrap gap-3">
            {editingId ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-ftt-border bg-ftt-ivory text-ftt-burgundy hover:bg-ftt-gold/10"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              className="rounded-full bg-ftt-navy px-7 text-ftt-ivory hover:bg-ftt-midnight"
              disabled={activeMutation}
            >
              {activeMutation
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Add address"}
            </Button>
          </div>
        </div>

        {createMutation.isError || updateMutation.isError ? (
          <p className="mt-4 text-sm text-ftt-burgundy">
            Unable to save this address. Please check the details and try again.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function AddressCard({
  address,
  isDeleting,
  isUpdating,
  onEdit,
  onSetDefault,
  onRemove,
}: {
  address: Address;
  isDeleting: boolean;
  isUpdating: boolean;
  onEdit: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const isDefault = Boolean(address.isDefault);
  const lineClass = isDefault ? "text-ftt-ivory/76" : "text-ftt-burgundy/58";

  return (
    <div
      className={cn(
        "ftt-account-glow-card rounded-[1.5rem] border p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] transition",
        isDefault
          ? "border-ftt-gold/45 bg-ftt-navy text-ftt-ivory"
          : "border-ftt-border bg-ftt-card text-ftt-navy",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full",
              isDefault
                ? "bg-ftt-gold/14 text-ftt-gold"
                : "bg-ftt-gold/10 text-ftt-gold",
            )}
          >
            <Home className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="break-words font-serif text-2xl leading-none">
              {address.label || "Address"}
            </p>
            <p className={cn("mt-1 break-words text-xs uppercase tracking-[0.18em]", lineClass)}>
              {address.name || "Recipient"}
            </p>
          </div>
        </div>

        {isDefault ? (
          <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/12 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-ftt-gold">
            Default
          </Badge>
        ) : null}
      </div>

      <div className={cn("mt-5 space-y-1 break-words text-sm leading-6", lineClass)}>
        <p>{address.line1}</p>
        {address.line2 ? <p>{address.line2}</p> : null}
        <p>
          {address.city}, {address.state} {address.postalCode}
        </p>
        <p>{address.country}</p>
        {address.phone ? <p>{address.phone}</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "rounded-full",
            isDefault
              ? "border-ftt-ivory/25 bg-transparent text-ftt-ivory hover:bg-ftt-ivory/10 hover:text-ftt-ivory"
              : "border-ftt-border bg-ftt-ivory text-ftt-burgundy hover:bg-ftt-gold/10",
          )}
          onClick={onEdit}
        >
          <Pencil className="mr-2 size-3.5" />
          Edit
        </Button>

        {!isDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-ftt-border bg-ftt-ivory text-ftt-navy hover:bg-ftt-gold/10"
            onClick={onSetDefault}
            disabled={isUpdating}
          >
            <MapPin className="mr-2 size-3.5" />
            Set default
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-full",
            isDefault
              ? "text-ftt-ivory/78 hover:bg-ftt-ivory/10 hover:text-ftt-ivory"
              : "text-ftt-burgundy hover:bg-ftt-burgundy/10 hover:text-ftt-burgundy",
          )}
          onClick={onRemove}
          disabled={isDeleting}
        >
          <Trash2 className="mr-2 size-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function AddressState({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ftt-border bg-ftt-card p-6 text-sm leading-6 text-ftt-burgundy/60 shadow-sm">
      {message}
      {children}
    </div>
  );
}
