import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import {
  normalizePhotonFeature,
  type GeoSuggestion,
} from "@/lib/geo/photon";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { timed } from "@/lib/perf/timed";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  "Content-Type": "application/json",
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...CACHE_HEADERS,
      ...init?.headers,
    },
  });

const parseCoordinate = (
  value: string | null,
  min: number,
  max: number,
): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

export const registerGeoRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/search", async (c) => {
    const query = c.req.query("q")?.trim();

    if (!query || query.length < 3) {
      return json({ suggestions: [] });
    }

    // Per-IP cap on the upstream (photon) proxy. Generous + memory-backed (no
    // requireDurable) so address autocomplete during checkout never hard-fails
    // on a limiter hiccup; debounced typeahead stays well under this.
    const rateLimited = await rateLimitResponse(c.req.raw, "geo:search", {
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycode", "IN");

    try {
      const response = await timed("geo.search.photonFetch", () =>
        fetch(url, {
          headers: {
            Accept: "application/json",
          },
          next: { revalidate: 60 * 60 * 24 },
          signal: AbortSignal.timeout(3500),
        }),
      );

      if (!response.ok) {
        return json({ suggestions: [] });
      }

      const data = await timed("geo.search.parseJson", () =>
        response.json() as Promise<{ features?: unknown }>,
      );
      const rawFeatures: unknown[] = Array.isArray(data.features)
        ? data.features
        : [];
      const suggestions: GeoSuggestion[] = rawFeatures
        .map(normalizePhotonFeature)
        .filter((suggestion): suggestion is GeoSuggestion =>
          Boolean(suggestion),
        );

      return json({ suggestions });
    } catch {
      return json({ suggestions: [] });
    }
  });

  app.get("/reverse", async (c) => {
    const lat = parseCoordinate(c.req.query("lat") ?? null, -90, 90);
    const lon = parseCoordinate(c.req.query("lon") ?? null, -180, 180);

    if (lat === null || lon === null) {
      return json({ suggestion: null });
    }

    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lang", "en");

    try {
      const response = await timed("geo.reverse.photonFetch", () =>
        fetch(url, {
          headers: {
            Accept: "application/json",
          },
          next: { revalidate: 60 * 60 * 24 },
          signal: AbortSignal.timeout(3500),
        }),
      );

      if (!response.ok) {
        return json({ suggestion: null });
      }

      const data = await timed("geo.reverse.parseJson", () =>
        response.json() as Promise<{ features?: unknown }>,
      );
      const rawFeatures: unknown[] = Array.isArray(data.features)
        ? data.features
        : [];
      const suggestion =
        rawFeatures
          .map(normalizePhotonFeature)
          .filter(
            (candidate): candidate is GeoSuggestion => Boolean(candidate),
          )[0] ?? null;

      return json({ suggestion });
    } catch {
      return json({ suggestion: null });
    }
  });
};
