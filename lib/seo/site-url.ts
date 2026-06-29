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
