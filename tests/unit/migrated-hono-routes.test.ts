import { afterEach, describe, expect, it, vi } from "vitest";

const getLatestReelMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/social/latest-reel", () => ({
  getLatestReel: getLatestReelMock,
}));

import { registerGeoRoutes } from "@/api/hono/routes/geo";
import { registerSocialRoutes } from "@/api/hono/routes/social";
import { createRouteHarness } from "../helpers/route-harness";

describe("migrated Hono API routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getLatestReelMock.mockReset();
  });

  it("serves geo search through the Hono /geo route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        features: [
          {
            geometry: { coordinates: [77.5946, 12.9716] },
            properties: {
              city: "Bengaluru",
              country: "India",
              countrycode: "IN",
              name: "MG Road",
              osm_id: 123,
              osm_type: "way",
              state: "Karnataka",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const harness = createRouteHarness({ register: registerGeoRoutes });
    const response = await harness.request("/search?q=Bengaluru");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=86400");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "photon.komoot.io" }),
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
    expect(data.suggestions).toEqual([
      expect.objectContaining({
        city: "Bengaluru",
        countryCode: "IN",
        label: expect.stringContaining("Bengaluru"),
      }),
    ]);
  });

  it("returns no geo suggestions for too-short queries without upstream fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const harness = createRouteHarness({ register: registerGeoRoutes });
    const response = await harness.request("/search?q=ab");

    await expect(response.json()).resolves.toEqual({ suggestions: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves the latest reel through the Hono /social route", async () => {
    getLatestReelMock.mockResolvedValue({
      caption: "Latest reel",
      href: "https://www.instagram.com/reel/example",
      poster: "https://example.com/poster.jpg",
      videoUrl: "https://example.com/video.mp4",
    });

    const harness = createRouteHarness({ register: registerSocialRoutes });
    const response = await harness.request("/latest-reel");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      caption: "Latest reel",
      href: "https://www.instagram.com/reel/example",
    });
  });
});
