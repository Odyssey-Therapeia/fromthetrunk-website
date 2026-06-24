import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

import type { HonoBindings } from "@/api/hono/types";

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

const isAllowedBrowserOrigin = (origin: string | null, requestUrl: string) => {
  if (!origin) return true;
  return configuredOrigins(requestUrl).has(origin);
};

export const sameOriginCors = cors({
  allowHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
  allowMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
  credentials: true,
  exposeHeaders: [
    "Retry-After",
    "Server-Timing",
    "X-RateLimit-Remaining",
    "X-Request-Id",
  ],
  maxAge: 600,
  origin: (origin, c) =>
    isAllowedBrowserOrigin(origin || null, c.req.url) ? origin : null,
});

export const sameOriginMutationGuard: MiddlewareHandler<HonoBindings> = async (
  c,
  next,
) => {
  if (!MUTATION_METHODS.has(c.req.method.toUpperCase())) {
    await next();
    return;
  }

  const origin = c.req.header("origin") ?? null;
  if (!isAllowedBrowserOrigin(origin, c.req.url)) {
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

  await next();
};
