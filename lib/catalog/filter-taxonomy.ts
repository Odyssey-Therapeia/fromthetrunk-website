export type CatalogAvailability = "available" | "reserved" | "sold";

export const normalizeFacetSlug = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const toFacetValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => toFacetValues(entry))
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[|,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const toFacetSlugs = (value: unknown): string[] =>
  Array.from(new Set(toFacetValues(value).map(normalizeFacetSlug).filter(Boolean)));

const LABEL_OVERRIDES: Record<string, string> = {
  "banarasi-silk": "Banarasi Silk",
  "cotton-silk": "Cotton Silk",
  georgette: "Georgette",
  "handloom-cotton-silk": "Handloom Cotton Silk",
  "ivory-white": "Ivory / White",
  kanjeevaram: "Kanjeevaram",
  "kanjeevaram-mix": "Kanjeevaram Mix",
  "kanjeevaram-silk": "Kanjeevaram Silk",
  "kota-cotton": "Kota Cotton",
  "linen-cotton": "Linen Cotton",
  "low-to-high": "Price-(Low to High)",
  "high-to-low": "Price-(High to Low)",
  "multicolor": "Multicolour",
  "multicolour": "Multicolour",
  "powder-blue": "Powder Blue",
  "rani-pink": "Rani Pink",
  "royal-blue": "Royal Blue",
  "sage-green": "Sage Green",
  "tissue-silk": "Tissue Silk",
};

export const CANONICAL_FABRIC_FILTERS = [
  "silk",
  "cotton",
  "cotton-silk",
  "handloom-cotton-silk",
  "banarasi-silk",
  "kanjeevaram",
  "kanjeevaram-silk",
  "kanjeevaram-mix",
  "tissue-silk",
  "kota-cotton",
  "chiffon",
  "georgette",
  "organza",
  "linen-cotton",
] as const;

export const displayFacetLabel = (value: string): string => {
  const slug = normalizeFacetSlug(value);
  if (LABEL_OVERRIDES[slug]) return LABEL_OVERRIDES[slug];
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const normalizeColorSlug = (value: unknown): string => {
  const slug = normalizeFacetSlug(value);
  if (!slug) return "";
  if (slug === "white") return "ivory-white";
  if (slug === "ivory") return "ivory-white";
  if (slug === "multicolor") return "multicolour";
  return slug;
};

export const colorSwatch = (slug: string): string => {
  const normalized = normalizeColorSlug(slug);
  const swatches: Record<string, string> = {
    beige: "#d8c1a1",
    black: "#111111",
    brown: "#7b4b2a",
    burgundy: "#601d1c",
    charcoal: "#343434",
    cream: "#f4e6cf",
    emerald: "#166534",
    gold: "#b39152",
    green: "#2f6f4e",
    grey: "#8f8a83",
    ivory: "#fdf7f1",
    "ivory-white": "#fdf7f1",
    marigold: "#e0a11b",
    midnight: "#141d46",
    navy: "#141d46",
    orange: "#d97706",
    pink: "#d86a8f",
    "powder-blue": "#a9c7dc",
    purple: "#6d3a8c",
    "rani-pink": "#c2185b",
    red: "#b91c1c",
    rose: "#d48a95",
    "royal-blue": "#1d4ed8",
    "sage-green": "#9caf88",
    yellow: "#f2c94c",
  };

  return swatches[normalized] ?? "#e7ddd4";
};
