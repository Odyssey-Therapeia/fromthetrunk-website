export const DRAPE_ROOM_AI_DISCLAIMER =
  "This is an AI-generated visual preview. The actual saree’s colour, texture, pleats, border placement, pallu and fit may vary. Please use the original product photographs and description as the source of truth. Any blouse, jewellery or background shown may be AI-generated and is not included unless stated on the product page.";

export const DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE =
  "New AI generation is temporarily unavailable while the secure service configuration is completed. Your photo has not been sent.";

/**
 * Sets expectations about what the AI actually reproduces. Shown at the upload
 * step and again on the finished preview.
 */
export const DRAPE_ROOM_PATTERN_NOTE =
  "The AI may redraw the saree’s pattern, motifs and border placement. Treat this as an overall idea of how the drape looks on you — not an exact reproduction of the design.";

/** Guidance shown next to every photo upload control. */
export const DRAPE_ROOM_PHOTO_TIP =
  "For the best result, upload a photo of yourself standing, or a clear photo of just your face.";

/**
 * Narration for the create button while a preview is generating. The steps
 * follow the Classic Nivi drape in order — pleats, pallu, fall — so the wait
 * reads as a saree being draped rather than a machine thinking.
 *
 * `upTo` is the fill percentage each line belongs to, so the words and the
 * burgundy fill are driven by one number instead of two competing timers. The
 * last line covers the hold at 92%, where the fill waits for the provider.
 */
export const DRAPE_ROOM_DRAPING_STEPS = [
  { upTo: 20, label: "Draping…" },
  { upTo: 45, label: "Making the pleats…" },
  { upTo: 70, label: "Setting the pallu…" },
  { upTo: 91, label: "Smoothing the fall…" },
  { upTo: 100, label: "Almost draped…" },
] as const;

/** Shown for the beat between a finished request and the preview appearing. */
export const DRAPE_ROOM_DRAPING_COMPLETE = "Your drape is ready";
