const DEFAULT_CANONICAL_ORIGIN = "https://www.fromthetrunk.shop";

let warnedInvalidProductionOrigin = false;

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isUnsafeCanonicalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();

    return (
      url.protocol !== "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app")
    );
  } catch {
    return true;
  }
}

function warnInvalidProductionOrigin(origin: string | null): void {
  if (warnedInvalidProductionOrigin) return;
  warnedInvalidProductionOrigin = true;
  console.warn(
    `[seo] Invalid production canonical origin "${origin ?? "missing"}"; using ${DEFAULT_CANONICAL_ORIGIN}.`,
  );
}

export function getCanonicalOrigin(): string {
  const configured = normalizeOrigin(
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SERVER_URL,
  );

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      warnInvalidProductionOrigin(configured);
    }
    return DEFAULT_CANONICAL_ORIGIN;
  }

  if (
    process.env.NODE_ENV === "production" &&
    isUnsafeCanonicalOrigin(configured)
  ) {
    warnInvalidProductionOrigin(configured);
    return DEFAULT_CANONICAL_ORIGIN;
  }

  return configured;
}

export function canonicalPath(pathname: string): string {
  const withoutHash = pathname.split("#", 1)[0] ?? "/";
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "/";
  const path = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return path === "" ? "/" : path;
}

export function absoluteUrl(pathnameOrUrl: string): string {
  try {
    const url = new URL(pathnameOrUrl);
    return url.toString();
  } catch {
    return new URL(canonicalPath(pathnameOrUrl), getCanonicalOrigin()).toString();
  }
}

/**
 * The ONLY query parameters allowed to survive into a canonical URL.
 *
 * Deliberately minimal. Pagination is the one query state that addresses
 * genuinely distinct content, so it is the only key that may appear in a
 * canonical. Filters, sorts, attribution (`utm_*`, `gclid`, `fbclid`), Next.js
 * internals (`_rsc`), and anything unrecognised are dropped here so canonical
 * URLs can never proliferate into per-filter duplicates.
 */
const CANONICAL_QUERY_PARAMS = new Set(["page"]);

/**
 * Second gate on canonical query strings.
 *
 * Callers MUST pass a location whose query has already been through the
 * relevant route canonicalisation (for the collection this is
 * `getCanonicalCollectionLocation`). This function re-checks that result
 * against a hard allowlist so a future change upstream cannot quietly widen
 * what reaches a canonical tag.
 */
function canonicalQueryString(search: string): string {
  const allowed = new URLSearchParams();

  for (const [name, value] of new URLSearchParams(search)) {
    if (!CANONICAL_QUERY_PARAMS.has(name)) continue;
    // `page` is the only allowed key and must be a plain positive integer.
    if (!/^\d+$/.test(value)) continue;
    // Page 1 is the bare path; emitting it would create a second URL for it.
    if (Number(value) <= 1) continue;
    // A repeated key has no unambiguous canonical meaning — keep the first.
    if (allowed.has(name)) continue;
    allowed.set(name, value);
  }

  return allowed.toString();
}

/**
 * Like `canonicalPath`, but preserves an allowlisted canonical query string.
 * Fragments are always stripped.
 */
export function canonicalPathWithQuery(pathname: string): string {
  const withoutHash = pathname.split("#", 1)[0] ?? "/";
  const separatorIndex = withoutHash.indexOf("?");
  const rawPath =
    separatorIndex === -1 ? withoutHash : withoutHash.slice(0, separatorIndex);
  const rawSearch =
    separatorIndex === -1 ? "" : withoutHash.slice(separatorIndex + 1);

  const path = canonicalPath(rawPath);
  const query = canonicalQueryString(rawSearch);

  return query ? `${path}?${query}` : path;
}

/**
 * Absolute canonical URL that keeps an allowlisted query string.
 *
 * Use ONLY for routes that have already canonicalised their own query state.
 * Every other caller should keep using `absoluteUrl`, which strips queries.
 */
export function absoluteCanonicalUrl(pathnameOrUrl: string): string {
  try {
    const url = new URL(pathnameOrUrl);
    return url.toString();
  } catch {
    return new URL(
      canonicalPathWithQuery(pathnameOrUrl),
      getCanonicalOrigin(),
    ).toString();
  }
}
