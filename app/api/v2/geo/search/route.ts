import { NextRequest } from "next/server";

import {
  normalizePhotonFeature,
  type GeoSuggestion,
} from "@/lib/geo/photon";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query || query.length < 3) {
    return Response.json({ suggestions: [] });
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycode", "IN");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) {
      return Response.json({ suggestions: [] });
    }

    const data = (await response.json()) as { features?: unknown };
    const rawFeatures: unknown[] = Array.isArray(data.features)
      ? data.features
      : [];
    const suggestions: GeoSuggestion[] = rawFeatures
      .map(normalizePhotonFeature)
      .filter((suggestion): suggestion is GeoSuggestion => Boolean(suggestion));

    return Response.json({ suggestions }, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
