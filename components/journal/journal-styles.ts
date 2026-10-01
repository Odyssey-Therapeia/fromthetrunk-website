/**
 * Shared Journal class lists. Tokens (`journal-*` colours and fonts) are only
 * defined inside the Journal layout's `.journal-theme` wrapper.
 */

/** Page gutters: 16/20/24/32/80px at 320/390/640/1024/1280. */
export const JOURNAL_GUTTERS = "px-4 min-[390px]:px-5 sm:px-6 lg:px-8 xl:px-20";

/** The 1200px content container, inside the gutters. */
export const JOURNAL_CONTAINER = "mx-auto w-full max-w-[1200px]";

/** Navy focus ring for controls on ivory (15.3:1). */
export const JOURNAL_FOCUS =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-journal-navy";

/** Ivory focus ring for controls on navy (15.3:1). */
export const JOURNAL_FOCUS_ON_NAVY =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-journal-ivory";

/** 12px uppercase label; nothing in the Journal is set smaller. */
export const JOURNAL_EYEBROW = "text-xs font-medium uppercase leading-4 tracking-[0.22em]";

/** 14/20 meta line. */
export const JOURNAL_META = "text-sm leading-5";

/** Pill control, at least 44px tall. */
export const JOURNAL_PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium leading-5 transition-colors";

/**
 * Focal point per cover. Covers are one 5:4 master cropped by CSS to a 3:2
 * hero and an 88:105 card, so the subject must sit in the central safe zone;
 * blog1a's subject sits right of centre.
 */
const COVER_POSITION: Record<string, string> = {
  "/blog1a.avif": "object-[68%_50%]",
};

export function journalCoverPosition(src: string): string {
  return COVER_POSITION[src] ?? "object-center";
}

/**
 * The hero shows only the right of its cover (the left fades out), so a cover
 * without a known focal point leans centre-right there.
 */
export function journalHeroCoverPosition(src: string): string {
  return COVER_POSITION[src] ?? "object-[60%_50%]";
}
