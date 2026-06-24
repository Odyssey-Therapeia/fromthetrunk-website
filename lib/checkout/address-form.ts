/**
 * Shared checkout address model.
 *
 * The checkout collects a richer address shape than the API stores. These
 * helpers convert between the UI form, the create-order shipping payload
 * (matches `shippingAddressSchema`), and the save-to-account payload
 * (matches `addressCreateSchema`). Keeping the conversions here means the
 * step components never hand-build payloads and never drift from the schemas.
 */

import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";

import type { Address } from "@/types/domain";

import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_COUNTRY_NAME,
  DEFAULT_STATE,
  isIndia,
} from "./locations";

export type AddressForm = {
  fullName: string;
  email: string;
  /** E.164 string, e.g. "+917742521023". */
  phone: string;
  /** ISO country for the phone field's dial code + validation. */
  phoneCountry: CountryCode;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type AddressFieldErrors = Partial<Record<keyof AddressForm, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyAddress = (email = ""): AddressForm => ({
  fullName: "",
  email,
  phone: "",
  phoneCountry: DEFAULT_COUNTRY_CODE,
  line1: "",
  line2: "",
  city: "",
  state: DEFAULT_STATE,
  postalCode: "",
  country: DEFAULT_COUNTRY_NAME,
});

/** Validate a single address form. Returns a per-field error map (empty = valid). */
export const validateAddressForm = (address: AddressForm): AddressFieldErrors => {
  const errors: AddressFieldErrors = {};

  if (!address.fullName.trim()) errors.fullName = "Full name is required";
  if (!address.email.trim()) errors.email = "Email is required";
  else if (!EMAIL_PATTERN.test(address.email.trim()))
    errors.email = "Enter a valid email address";

  if (!address.phone.trim()) errors.phone = "Phone number is required";
  else if (!isValidPhoneNumber(address.phone))
    errors.phone = "Enter a valid phone number";

  if (!address.line1.trim()) errors.line1 = "Address is required";
  if (!address.city.trim()) errors.city = "City is required";
  if (!address.state.trim()) errors.state = "State is required";
  if (!address.country.trim()) errors.country = "Country is required";

  const postal = address.postalCode.trim();
  if (!postal) errors.postalCode = "Postal code is required";
  else if (isIndia(address.country) && !/^\d{6}$/.test(postal))
    errors.postalCode = "Enter a valid 6-digit PIN code";

  return errors;
};

export const hasErrors = (errors: AddressFieldErrors): boolean =>
  Object.keys(errors).length > 0;

/** Pre-fill the form from a saved address-book entry. */
export const savedAddressToForm = (
  address: Address,
  email: string,
): AddressForm => ({
  fullName: address.name ?? "",
  email,
  phone: address.phone ?? "",
  phoneCountry: DEFAULT_COUNTRY_CODE,
  line1: address.line1 ?? "",
  line2: address.line2 ?? "",
  city: address.city ?? "",
  state: address.state ?? DEFAULT_STATE,
  postalCode: address.postalCode ?? "",
  country: address.country ?? DEFAULT_COUNTRY_NAME,
});

export const fullName = (address: AddressForm): string => address.fullName.trim();

/** Build the create-order `shippingAddress` payload (matches shippingAddressSchema). */
export const toOrderAddress = (address: AddressForm) => ({
  name: fullName(address),
  line1: address.line1.trim(),
  line2: address.line2.trim() || undefined,
  city: address.city.trim(),
  state: address.state.trim() || undefined,
  postalCode: address.postalCode.trim(),
  country: address.country.trim(),
  phone: address.phone.trim() || undefined,
  email: address.email.trim(),
});

/** Build the POST /api/v2/addresses payload (matches addressCreateSchema). */
export const toSavedAddressPayload = (
  address: AddressForm,
  options: { label: string; isDefault: boolean },
) => ({
  label: options.label,
  name: fullName(address),
  line1: address.line1.trim(),
  line2: address.line2.trim(),
  city: address.city.trim(),
  state: address.state.trim(),
  postalCode: address.postalCode.trim(),
  country: address.country.trim(),
  phone: address.phone.trim(),
  isDefault: options.isDefault,
});
