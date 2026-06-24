export type GeoSuggestion = {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
};

type PhotonFeatureLike = {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

const readText = (
  source: Record<string, unknown>,
  key: string,
): string => {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
};

const readIdPart = (
  source: Record<string, unknown>,
  key: string,
): string => {
  const value = source[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

export function normalizePhotonFeature(
  feature: unknown,
): GeoSuggestion | null {
  const candidate = feature as PhotonFeatureLike;
  const properties = candidate?.properties;
  const coordinates = candidate?.geometry?.coordinates;

  if (!properties || !Array.isArray(coordinates)) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const name = readText(properties, "name");
  const street = readText(properties, "street");
  const houseNumber = readText(properties, "housenumber");
  const city =
    readText(properties, "city") ||
    readText(properties, "district") ||
    readText(properties, "county") ||
    readText(properties, "town");
  const state = readText(properties, "state");
  const postalCode = readText(properties, "postcode");
  const country = readText(properties, "country") || "India";
  const countryCode = readText(properties, "countrycode") || "IN";

  const line1 = [houseNumber, street || name].filter(Boolean).join(" ").trim();
  const label = [line1 || name, city, state, postalCode, country]
    .filter(Boolean)
    .join(", ");

  if (!label) return null;

  return {
    id: `${readIdPart(properties, "osm_type") || "osm"}-${
      readIdPart(properties, "osm_id") || label
    }`,
    label,
    line1: line1 || name,
    city,
    state,
    postalCode,
    country,
    countryCode,
    lat,
    lon,
  };
}
