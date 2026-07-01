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

const COLOR_SWATCHES: Record<string, string> = {
  aqua: "#3bb6b0",
  beige: "#d8c1a1",
  black: "#111111",
  blue: "#2f5fb0",
  "bottle-green": "#0b3d2e",
  bronze: "#8c6a3f",
  brown: "#7b4b2a",
  burgundy: "#601d1c",
  charcoal: "#343434",
  copper: "#b87333",
  coral: "#f17463",
  cream: "#f4e6cf",
  emerald: "#166534",
  fuchsia: "#c2418f",
  gold: "#b39152",
  green: "#2f6f4e",
  "dark-green": "#14532d",
  "light-green": "#86b97a",
  grey: "#8f8a83",
  indigo: "#3a3f88",
  ivory: "#fdf7f1",
  "ivory-white": "#fdf7f1",
  lavender: "#b9a7d6",
  lilac: "#c8a2d6",
  lime: "#9bbf3a",
  magenta: "#b5258f",
  marigold: "#e0a11b",
  maroon: "#5c1a1a",
  mauve: "#a87b8f",
  mint: "#9fd9b8",
  midnight: "#141d46",
  mustard: "#d4a017",
  navy: "#141d46",
  "off-white": "#f7f3ec",
  olive: "#6b6b2f",
  orange: "#d97706",
  peach: "#f2b79b",
  pink: "#d86a8f",
  "powder-blue": "#a9c7dc",
  purple: "#6d3a8c",
  "rani-pink": "#c2185b",
  red: "#b91c1c",
  rose: "#d48a95",
  "rose-gold": "#caa07d",
  "royal-blue": "#1d4ed8",
  rust: "#9c4221",
  "sage-green": "#9caf88",
  silver: "#c7c7cc",
  "sky-blue": "#7fb3e0",
  tan: "#c2a06a",
  teal: "#1f7a78",
  turquoise: "#2bb6ac",
  violet: "#7a4fb0",
  white: "#f7f3ec",
  wine: "#722f37",
  yellow: "#f2c94c",
};

// Family-fallback keys, longest first, so "dark-green" matches "green" (not a
// shorter accidental substring) and "royal-blue" matches "blue".
const COLOR_FAMILY_KEYS = Object.keys(COLOR_SWATCHES).sort(
  (a, b) => b.length - a.length,
);

export const colorSwatch = (slug: string): string => {
  const normalized = normalizeColorSlug(slug);
  if (COLOR_SWATCHES[normalized]) return COLOR_SWATCHES[normalized];

  // Free-text colours ("Dark Green", "Coral Sunrise") won't match a key
  // exactly — fall back to the most specific colour word found inside the slug.
  for (const key of COLOR_FAMILY_KEYS) {
    if (normalized.includes(key)) return COLOR_SWATCHES[key];
  }

  return "#e7ddd4";
};
