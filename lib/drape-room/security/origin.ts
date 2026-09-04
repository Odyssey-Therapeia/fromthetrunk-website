export type AllowedOriginResult =
  | { ok: true; origins: ReadonlySet<string> }
  | { ok: false; reason: string };

export function parseTryonAllowedOrigins(
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): AllowedOriginResult {
  if (!value?.trim()) {
    return { ok: false, reason: "FTT_TRYON_ALLOWED_ORIGINS is required." };
  }
  const origins = new Set<string>();
  for (const candidate of value.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      const local =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]";
      if (
        parsed.origin !== trimmed ||
        parsed.username ||
        parsed.password ||
        (nodeEnv === "production" && parsed.protocol !== "https:") ||
        (nodeEnv === "production" && local) ||
        (parsed.protocol !== "https:" && !(nodeEnv !== "production" && local))
      ) {
        return { ok: false, reason: `Invalid try-on origin: ${trimmed}` };
      }
      origins.add(parsed.origin);
    } catch {
      return { ok: false, reason: `Invalid try-on origin: ${trimmed}` };
    }
  }
  return origins.size > 0
    ? { ok: true, origins }
    : { ok: false, reason: "No valid try-on origins were configured." };
}

/** Paid browser requests require an exact configured Origin. Missing fails. */
export function isStrictTryonOrigin(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || !allowedOrigins.has(origin)) return false;
  try {
    if (new URL(origin).origin !== origin) return false;
  } catch {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  return true;
}

