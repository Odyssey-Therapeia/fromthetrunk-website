const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `2026-09-28` -> `28 Sep 2026`.
 *
 * Reads the calendar date straight from the ISO string, so the label is the
 * same on the server, in every browser locale and in every time zone. (Intl
 * renders September as "Sept" in en-GB and en-IN, which the design avoids.)
 */
export function formatJournalDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthLabel = MONTHS[Number(month) - 1];
  if (!monthLabel) return iso;
  return `${Number(day)} ${monthLabel} ${year}`;
}

/**
 * `2026-09-28` -> `2026-09-28T00:00:00+05:30` for structured data and Open
 * Graph, which read a bare date as UTC midnight. Values that already carry a
 * time are returned unchanged.
 */
export function journalDateTime(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00+05:30` : iso;
}
