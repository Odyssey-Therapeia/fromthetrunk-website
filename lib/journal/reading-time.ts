import { JOURNAL_WORDS_PER_MINUTE } from "@/lib/journal/constants";
import { countWords } from "@/lib/journal/text";

/** Whole minutes at 200 words a minute, rounded up, never less than one. */
export function readingMinutesForWordCount(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / JOURNAL_WORDS_PER_MINUTE));
}

export function readingMinutes(text: string): number {
  return readingMinutesForWordCount(countWords(text));
}

export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}
