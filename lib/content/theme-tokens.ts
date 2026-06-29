/**
 * P3-07: Theme token helpers.
 *
 * Pure functions - no DB, no React. Used by:
 *   - ThemeStyler RSC (app/(site)/layout.tsx injection)
 *   - admin theme editor live-preview
 *   - tests (mutation-proofs)
 *
 * Token keys MUST start with "--" to be valid CSS custom properties.
 * Any key not starting with "--" is silently ignored, making the data
 * store safely accumulate non-CSS metadata if needed in the future.
 *
 * NOTE: Font-pair switching is deferred. The only loaded fonts are
 * Cormorant Garamond (--font-serif) and Inter (--font-sans), loaded in
 * app/(site)/layout.tsx via next/font/google. Adding a new font pair
 * requires updating that layout and is a separate packet-level decision
 * per docs/design-system.md Rule 3.
 */

/** Sentinel prefix for valid CSS custom property names. */
export const THEME_CSS_VAR_PREFIX = "--" as const;

const FTT_IVORY_BACKGROUND = "#FDF7F1";
const UNSAFE_BACKGROUND_REFERENCE = { r: 217, g: 133, b: 48 };
const UNSAFE_BACKGROUND_DISTANCE_THRESHOLD = 36;

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function parseHexColor(value: string): RgbColor | null {
  const trimmed = value.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return null;

  const hex = match[1];
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function sanitizeThemeToken(key: string, value: unknown): unknown {
  if (key !== "--background" || typeof value !== "string") {
    return value;
  }

  const color = parseHexColor(value);
  if (!color) return value;

  const isUnsafeOrangeBackground =
    colorDistance(color, UNSAFE_BACKGROUND_REFERENCE) <=
    UNSAFE_BACKGROUND_DISTANCE_THRESHOLD;

  return isUnsafeOrangeBackground ? FTT_IVORY_BACKGROUND : value;
}

/**
 * Converts a theme token map to a CSS custom-property declarations string.
 *
 * Only keys starting with "--" are emitted.
 * Returns "" when tokens is empty - the site renders byte-identical to today.
 *
 * Example: formatThemeCssVariables({ "--primary": "warm-burgundy" })
 * emits "--primary: warm-burgundy;" as a CSS declaration.
 */
export function formatThemeCssVariables(
  tokens: Record<string, unknown>
): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith(THEME_CSS_VAR_PREFIX)) continue;
    if (value === null || value === undefined) continue;
    lines.push(`${key}: ${String(sanitizeThemeToken(key, value))};`);
  }
  return lines.join("\n");
}

/**
 * Wraps the token declarations in a :root { ... } block suitable for injection
 * via a <style> tag in the root layout.
 *
 * Returns "" when tokens is empty so the DOM is not mutated at all -
 * the site falls back to the globals.css defaults unchanged.
 */
export function buildInlineStyle(tokens: Record<string, unknown>): string {
  const declarations = formatThemeCssVariables(tokens);
  if (!declarations) return "";
  return `:root {\n${declarations}\n}`;
}

/**
 * The editable semantic color token names.
 *
 * We expose only the 7 core semantic tokens (not chart or sidebar palette)
 * so the admin form stays manageable. The Tailwind @theme inline mapping in
 * globals.css propagates these to --color-* automatically.
 */
export const EDITABLE_COLOR_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
] as const;

export type EditableColorToken = (typeof EDITABLE_COLOR_TOKENS)[number];
