/**
 * Pure helpers for PDP title and description meta generation.
 * Extracted so they can be tested in isolation without any Next.js context.
 */

/**
 * Build the <title> for a product detail page.
 *
 * Format: `{name} – Pre-Loved {fabric} Saree`
 *
 * Redundancy guard: when the product name already ends with "{fabric} saree"
 * (case-insensitive) the suffix is omitted to avoid repetition.
 *
 * The brand segment (" | From The Trunk") is appended by the layout template
 * and must NOT be added here.
 */
export function buildPdpTitle(name: string, fabric: string): string {
  // Normalize fabric: strip any trailing " saree" (case-insensitive) to avoid
  // double-saree output when the fabric value already contains the word "saree"
  // (e.g. "Heirloom saree" → "Heirloom").
  const fabricDisplay = fabric.replace(/\s+saree\s*$/i, "").trim() || fabric;

  const suffix = `${fabricDisplay} Saree`;
  const endsWithSuffix = new RegExp(`${escapeRegex(suffix)}\\s*$`, "i");

  if (endsWithSuffix.test(name)) {
    return name;
  }

  return `${name} – Pre-Loved ${suffix}`;
}

/** Target length for the PDP meta description (kept ≤ this where possible). */
const PDP_DESCRIPTION_MAX = 155;

/** Minimum room the story sentence needs before it is worth including. */
const PDP_STORY_MIN_CHARS = 24;

/**
 * Build the meta description for a product detail page.
 *
 * Format:
 *   `Own '{name}', a one-of-a-kind pre-loved {fabric} saree authenticated by
 *    From The Trunk. {one-line story}. Shipped with provenance.`
 *
 * The description is ALWAYS unique per product (the name is embedded). The
 * one-line story is sourced from `storyNarrative` (or `storyTitle` as a
 * fallback) and is truncated at a word boundary so the whole description stays
 * around {@link PDP_DESCRIPTION_MAX} characters. When there is no story — or no
 * meaningful room for one — the story sentence is omitted, leaving a valid,
 * provenance-forward description.
 */
export function buildPdpDescription(
  name: string,
  fabric: string,
  storyNarrative?: null | string,
  storyTitle?: null | string,
): string {
  // Normalize fabric the same way the title does, so we never emit "silk saree
  // saree" when the fabric value already contains "saree".
  const fabricDisplay = fabric.replace(/\s+saree\s*$/i, "").trim() || fabric;

  const lead = `Own '${name}', a one-of-a-kind pre-loved ${fabricDisplay} saree authenticated by From The Trunk.`;
  const tail = "Shipped with provenance.";

  const story =
    (storyNarrative && storyNarrative.trim()) ||
    (storyTitle && storyTitle.trim()) ||
    "";

  if (!story) {
    return `${lead} ${tail}`;
  }

  // Drop trailing sentence punctuation so we control the ". " join ourselves.
  const storyClause = story.replace(/[.!?\s]+$/, "").trim();

  // Budget for the story clause within `${lead} ${clause}. ${tail}`:
  // lead + " " + clause + ". " + tail.
  const budget = PDP_DESCRIPTION_MAX - lead.length - tail.length - 3;

  if (budget < PDP_STORY_MIN_CHARS) {
    return `${lead} ${tail}`;
  }

  const fittedClause =
    storyClause.length > budget
      ? truncateAtWordBoundary(storyClause, budget)
      : storyClause;

  if (fittedClause.length === 0) {
    return `${lead} ${tail}`;
  }

  return `${lead} ${fittedClause}. ${tail}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  // Find the last space at or before maxLen
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace === -1) {
    // No space found — hard-cut at maxLen rather than returning the whole string
    return slice;
  }

  return slice.slice(0, lastSpace);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
