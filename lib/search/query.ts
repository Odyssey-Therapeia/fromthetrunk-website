export const MAX_PUBLIC_SEARCH_QUERY_LENGTH = 80;

/** Keeps public search cache keys and database work bounded and deterministic. */
export const normalizePublicSearchQuery = (value: string | undefined): string =>
  (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PUBLIC_SEARCH_QUERY_LENGTH);
