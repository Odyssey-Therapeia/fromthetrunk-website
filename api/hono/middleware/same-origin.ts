import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

import type { HonoBindings } from "@/api/hono/types";
import { roundDuration } from "@/lib/perf/server-timing";

const MUTATION_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);
const SAME_SITE_FETCH_VALUES = new Set(["none", "same-origin", "same-site"]);

const toOrigin = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const configuredOrigins = (requestUrl: string): Set<string> => {
  const origins = new Set<string>();
  const requestOrigin = toOrigin(requestUrl);
  if (requestOrigin) origins.add(requestOrigin);

  for (const value of [
    process.env.NEXT_PUBLIC_SERVER_URL,
    process.env.NEXTAUTH_URL,
  ]) {
    const origin = toOrigin(value);
    if (origin) origins.add(origin);
  }

  return origins;
};

/**
 * Canonical CSRF same-origin check: the browser Origin's host must equal the
 * request Host header. This holds for any legitimate same-origin request —
 * localhost, a LAN IP (mobile testing), or production behind a proxy — while a
 * genuine cross-site request (Origin host ≠ our Host) is still rejected. The
 * Host header reflects the host the browser actually connected to, so it is the
 * reliable comparison point (c.req.url can be an internal/proxied origin).
 */
const originHostMatchesHost = (
  origin: string,
  hostHeader: string | null | undefined,
): boolean => {
  if (!hostHeader) return false;
  try {
    return new URL(origin).host === hostHeader;
  } catch {
    return false;
  }
};

const isAllowedBrowserOrigin = (
  origin: string | null,
  requestUrl: string,
  hostHeader: string | null | undefined,
) => {
  if (!origin) return true;
  if (configuredOrigins(requestUrl).has(origin)) return true;
  return originHostMatchesHost(origin, hostHeader);
};

export const sameOriginCors = cors({
  allowHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
  allowMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
  credentials: true,
  exposeHeaders: [
    "Retry-After",
    "Server-Timing",
    "X-FTT-Product-Cache",
    "X-FTT-Related-Cache",
    "X-RateLimit-Remaining",
    "X-Request-Id",
  ],
  maxAge: 600,
  origin: (origin, c) =>
    isAllowedBrowserOrigin(origin || null, c.req.url, c.req.header("host"))
      ? origin
      : null,
});

export const sameOriginMutationGuard: MiddlewareHandler<HonoBindings> = async (
  c,
  next,
) => {
  const timings = c.get("perfTimings");
  const startedAt = performance.now();
  const pushTiming = () => {
    timings?.push({
      durationMs: roundDuration(performance.now() - startedAt),
      name: "same-origin-middleware",
    });
  };

  if (!MUTATION_METHODS.has(c.req.method.toUpperCase())) {
    pushTiming();
    await next();
    return;
  }

  const origin = c.req.header("origin") ?? null;
  if (!isAllowedBrowserOrigin(origin, c.req.url, c.req.header("host"))) {
    return c.json(
      {
        code: "FORBIDDEN_ORIGIN",
        message: "Cross-origin mutation requests are not allowed.",
      },
      403,
    );
  }

  const fetchSite = c.req.header("sec-fetch-site")?.toLowerCase();
  if (fetchSite && !SAME_SITE_FETCH_VALUES.has(fetchSite)) {
    return c.json(
      {
        code: "FORBIDDEN_ORIGIN",
        message: "Cross-site mutation requests are not allowed.",
      },
      403,
    );
  }

  pushTiming();
  await next();
};
