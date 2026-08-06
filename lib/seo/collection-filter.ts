import {
  normalizeColorSlug,
  normalizeFacetSlug,
} from "@/lib/catalog/filter-taxonomy";

export type CollectionQueryRecord = Record<
  string,
  string | string[] | undefined
>;

const MULTI_VALUE_PARAMS = [
  "type",
  "fabric",
  "color",
  "occasion",
  "work",
  "pattern",
  "sleeve",
  "tags",
] as const;

const PRODUCT_SORTS = new Set([
  "price-high-to-low",
  "price-low-to-high",
]);
const ITEMS_PER_PAGE = new Set([25, 50]);
const MAX_COLLECTION_PAGE = 10;
const MAX_VALUES_PER_PARAM = 50;
const MAX_VALUE_LENGTH = 100;
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "ttclid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);
const INTERNAL_NAVIGATION_PARAMS = new Set(["_rsc"]);
const ALLOWED_PARAMS = new Set([
  ...MULTI_VALUE_PARAMS,
  "availability",
  "collection",
  "colour",
  "page",
  "perPage",
  "priceMax",
  "priceMin",
  "sort",
]);

const isTrackingParam = (name: string) =>
  TRACKING_PARAMS.has(name.toLowerCase());

const isInternalNavigationParam = (name: string) =>
  INTERNAL_NAVIGATION_PARAMS.has(name.toLowerCase());

const withoutIgnoredParams = (
  input: URLSearchParams,
  options: { keepInternal?: boolean } = {},
): URLSearchParams => {
  const output = new URLSearchParams();
  for (const [name, value] of input) {
    if (isTrackingParam(name)) continue;
    if (!options.keepInternal && isInternalNavigationParam(name)) continue;
    output.append(name, value);
  }
  return output;
};

export const hasCollectionTrackingParams = (input: URLSearchParams): boolean =>
  Array.from(input.keys()).some(isTrackingParam);

/**
 * Removes attribution-only parameters before collection validation/canonical
 * routing. `_rsc` is also removed from the comparison copy, but remains on an
 * already-canonical internal Next.js navigation request so the framework can
 * negotiate the RSC response normally.
 */
export const collectionRoutingSearchParams = (
  input: URLSearchParams,
): URLSearchParams => withoutIgnoredParams(input);

const addRecordValue = (
  params: URLSearchParams,
  name: string,
  value: string | string[] | undefined,
) => {
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (typeof entry === "string") params.append(name, entry);
  }
};

export function collectionQueryRecordToSearchParams(
  record: CollectionQueryRecord | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(record ?? {})) {
    addRecordValue(params, name, value);
  }
  return params;
}

const normalizedValues = (
  params: URLSearchParams,
  name: (typeof MULTI_VALUE_PARAMS)[number],
): string[] => {
  const rawValues =
    name === "color"
      ? [...params.getAll("color"), ...params.getAll("colour")]
      : params.getAll(name);
  const normalize = name === "color" ? normalizeColorSlug : normalizeFacetSlug;

  return Array.from(new Set(rawValues.map(normalize).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
};

const firstNonEmpty = (params: URLSearchParams, name: string): string | null =>
  params.getAll(name).find((value) => value.trim().length > 0) ?? null;

const normalizedNonNegativeInteger = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/**
 * Produces the one stable query representation used for shareable collection
 * filter state. Unknown keys, empty values, aliases, duplicates, invalid
 * numeric ranges, and excessive repeated values are removed here rather than
 * becoming new cache or crawler states.
 */
export function canonicalizeCollectionSearchParams(
  input: URLSearchParams,
): URLSearchParams {
  input = withoutIgnoredParams(input);
  const output = new URLSearchParams();
  const collection = normalizeFacetSlug(firstNonEmpty(input, "collection"));
  if (collection) output.set("collection", collection);

  const sort = firstNonEmpty(input, "sort")?.trim() ?? "";
  if (PRODUCT_SORTS.has(sort)) output.set("sort", sort);

  const page = normalizedNonNegativeInteger(firstNonEmpty(input, "page"));
  if (page && page > 1) {
    output.set("page", String(Math.min(page, MAX_COLLECTION_PAGE)));
  }

  for (const name of MULTI_VALUE_PARAMS) {
    for (const value of normalizedValues(input, name)) {
      output.append(name, value);
    }
  }

  const priceMin = normalizedNonNegativeInteger(
    firstNonEmpty(input, "priceMin"),
  );
  const priceMax = normalizedNonNegativeInteger(
    firstNonEmpty(input, "priceMax"),
  );
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    // An inverted range has no unambiguous intent, so reject both bounds.
  } else {
    if (priceMin !== null) output.set("priceMin", String(priceMin));
    if (priceMax !== null) output.set("priceMax", String(priceMax));
  }

  const availability = firstNonEmpty(input, "availability")
    ?.trim()
    .toLowerCase();
  if (availability === "available" || availability === "true") {
    output.set("availability", "available");
  }

  const perPage = normalizedNonNegativeInteger(
    firstNonEmpty(input, "perPage"),
  );
  if (perPage !== null && ITEMS_PER_PAGE.has(perPage)) {
    output.set("perPage", String(perPage));
  }

  return output;
}

const hasConflictingSingleValues = (
  input: URLSearchParams,
  name: string,
  normalize: (value: string) => string = (value) => value.trim().toLowerCase(),
): boolean => {
  const values = input
    .getAll(name)
    .filter((value) => value.trim())
    .map(normalize)
    .filter(Boolean);
  return new Set(values).size > 1;
};

export function isValidCollectionSearchParams(
  input: URLSearchParams,
): boolean {
  input = withoutIgnoredParams(input);
  for (const [name, value] of input) {
    if (!ALLOWED_PARAMS.has(name) || value.length > MAX_VALUE_LENGTH) {
      return false;
    }
  }

  if (
    hasConflictingSingleValues(input, "collection", normalizeFacetSlug) ||
    hasConflictingSingleValues(input, "sort") ||
    hasConflictingSingleValues(input, "page") ||
    hasConflictingSingleValues(input, "priceMin") ||
    hasConflictingSingleValues(input, "priceMax") ||
    hasConflictingSingleValues(input, "availability") ||
    hasConflictingSingleValues(input, "perPage")
  ) {
    return false;
  }

  for (const name of MULTI_VALUE_PARAMS) {
    const raw =
      name === "color"
        ? [...input.getAll("color"), ...input.getAll("colour")]
        : input.getAll(name);
    if (raw.length > MAX_VALUES_PER_PARAM) return false;
    const normalize = name === "color" ? normalizeColorSlug : normalizeFacetSlug;
    if (raw.some((value) => value.trim() && !normalize(value))) return false;
  }

  const collection = firstNonEmpty(input, "collection");
  if (collection && !normalizeFacetSlug(collection)) return false;

  const sort = firstNonEmpty(input, "sort")?.trim() ?? "";
  if (sort && sort !== "latest" && !PRODUCT_SORTS.has(sort)) return false;

  const pageRaw = firstNonEmpty(input, "page");
  const page = normalizedNonNegativeInteger(pageRaw);
  if (pageRaw && (page === null || page < 1 || page > MAX_COLLECTION_PAGE)) {
    return false;
  }

  const perPageRaw = firstNonEmpty(input, "perPage");
  const perPage = normalizedNonNegativeInteger(perPageRaw);
  if (
    perPageRaw &&
    (perPage === null || (perPage !== 10 && !ITEMS_PER_PAGE.has(perPage)))
  ) {
    return false;
  }

  const availability = firstNonEmpty(input, "availability")
    ?.trim()
    .toLowerCase();
  if (
    availability &&
    !["available", "true", "false"].includes(availability)
  ) {
    return false;
  }

  const priceMinRaw = firstNonEmpty(input, "priceMin");
  const priceMaxRaw = firstNonEmpty(input, "priceMax");
  const priceMin = normalizedNonNegativeInteger(priceMinRaw);
  const priceMax = normalizedNonNegativeInteger(priceMaxRaw);
  if (
    (priceMinRaw && priceMin === null) ||
    (priceMaxRaw && priceMax === null) ||
    (priceMin !== null && priceMax !== null && priceMin > priceMax)
  ) {
    return false;
  }

  return true;
}

export function getCanonicalCollectionLocation(
  record: CollectionQueryRecord | undefined,
): { href: string; isCanonical: boolean; isValid: boolean } {
  const received = collectionQueryRecordToSearchParams(record);
  const routing = collectionRoutingSearchParams(received);
  const canonical = canonicalizeCollectionSearchParams(routing);
  const query = canonical.toString();
  const isValid = isValidCollectionSearchParams(routing);

  return {
    href: `/collection${query ? `?${query}` : ""}`,
    isCanonical: isValid && routing.toString() === query,
    isValid,
  };
}

export function isCollectionPaginationOnly(
  params: CollectionQueryRecord | undefined,
): boolean {
  const received = collectionQueryRecordToSearchParams(params);
  const routing = collectionRoutingSearchParams(received);
  if (!isValidCollectionSearchParams(routing)) return false;
  const canonical = canonicalizeCollectionSearchParams(routing);
  return canonical.size === 1 && canonical.has("page");
}

export function hasCollectionFilterParams(
  params: CollectionQueryRecord | undefined,
): boolean {
  const received = collectionQueryRecordToSearchParams(params);
  return collectionRoutingSearchParams(received).size > 0;
}
