/**
 * Country + state reference data for the checkout address forms.
 *
 * Countries are derived from libphonenumber-js (so dial codes always match the
 * phone field), named via the built-in `Intl.DisplayNames`, and flagged with
 * emoji computed from the ISO code — no bundled country dataset, no assets.
 * The store is India-first, so we ship a full Indian state/UT list and default
 * to India / Karnataka; other countries fall back to a free-text state.
 */

import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

export type CountryOption = {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

export const DEFAULT_COUNTRY_CODE: CountryCode = "IN";
export const DEFAULT_COUNTRY_NAME = "India";
export const DEFAULT_STATE = "Karnataka";

/** ISO 3166-1 alpha-2 → 🇮🇳 regional-indicator emoji. */
const toFlagEmoji = (code: string): string =>
  code
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0)),
    );

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const countryName = (code: CountryCode): string => {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};

/** All callable countries, sorted by display name. Built once at module load. */
export const COUNTRY_OPTIONS: CountryOption[] = getCountries()
  .map((code) => ({
    code,
    name: countryName(code),
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: toFlagEmoji(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_BY_CODE = new Map(
  COUNTRY_OPTIONS.map((option) => [option.code, option]),
);
const COUNTRY_BY_NAME = new Map(
  COUNTRY_OPTIONS.map((option) => [option.name.toLowerCase(), option]),
);

export const getCountryByCode = (code: CountryCode): CountryOption | undefined =>
  COUNTRY_BY_CODE.get(code);

export const getCountryByName = (name: string): CountryOption | undefined =>
  COUNTRY_BY_NAME.get(name.trim().toLowerCase());

/** Indian states and union territories — used when the country is India. */
export const INDIA_STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union territories
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

export const isIndia = (countryName: string): boolean =>
  countryName.trim().toLowerCase() === DEFAULT_COUNTRY_NAME.toLowerCase();
