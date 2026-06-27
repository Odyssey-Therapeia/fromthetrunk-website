import { NextRequest } from "next/server";

import {
  normalizePhotonFeature,
  type GeoSuggestion,
} from "@/lib/geo/photon";
import { timed } from "@/lib/perf/timed";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

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

export async function GET(request: NextRequest) {
  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
  const lon = parseCoordinate(
    request.nextUrl.searchParams.get("lon"),
    -180,
    180,
  );

  if (lat === null || lon === null) {
    return Response.json({ suggestion: null });
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
      })
    );

    if (!response.ok) {
      return Response.json({ suggestion: null });
    }

    const data = await timed("geo.reverse.parseJson", () =>
      response.json() as Promise<{ features?: unknown }>
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

    return Response.json({ suggestion }, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ suggestion: null });
  }
}
