import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { APP_ORIGIN, HARNESS_PATH } from "./support/drape-room-fixtures";

/**
 * HTTP-level proof that the Drape Room's MediaPipe assets are actually served
 * by the running app from the versioned same-origin path the client requests.
 *
 * WHY STATUS ALONE IS NOT ENOUGH
 * ------------------------------
 * `/drape-room/` is a public-asset prefix in proxy.ts, so the proxy passes the
 * path straight through. When the file does not exist, Next.js falls through to
 * the CMS catch-all and renders an HTML "404" page — with HTTP status **200**.
 * A naive `expect(status).toBe(200)` therefore passes even with every MediaPipe
 * asset deleted. Each assertion below pins the content-type and the exact byte
 * length from manifest.json, which is what actually distinguishes a real wasm
 * payload from an HTML error page.
 */

const ASSET_ROOT = "/drape-room/vision/mediapipe-1.0.1";
const MANIFEST_PATH = "public/drape-room/vision/mediapipe-1.0.1/manifest.json";

type ManifestEntry = { bytes: number; file: string; sha256: string };
type Manifest = { models: ManifestEntry[]; packageVersion: string; runtime: ManifestEntry[] };

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), MANIFEST_PATH), "utf8"),
) as Manifest;

const expectedContentType = (file: string): RegExp => {
  if (file.endsWith(".wasm")) return /^application\/wasm/;
  if (file.endsWith(".js")) return /javascript/;
  return /^application\/(octet-stream|x-binary)/;
};

test.describe("Drape Room MediaPipe assets over HTTP", () => {
  const allAssets = [...manifest.runtime, ...manifest.models];

  for (const entry of allAssets) {
    test(`serves ${entry.file} as ${entry.bytes} real bytes`, async ({ request }) => {
      const response = await request.get(`${APP_ORIGIN}${ASSET_ROOT}/${entry.file}`);

      expect(response.status()).toBe(200);

      const body = await response.body();
      // The load-bearing assertions: an HTML 404 page would fail both.
      expect(body.byteLength).toBe(entry.bytes);
      expect(body.byteLength).toBeGreaterThan(0);
      expect(createHash("sha256").update(body).digest("hex")).toBe(entry.sha256);
      expect(response.headers()["content-type"]).toMatch(
        expectedContentType(entry.file),
      );
      // Versioned path, so the immutable header is safe and expected.
      expect(response.headers()["cache-control"]).toContain("immutable");
    });
  }

  test("the model is the pinned Pose Landmarker Lite build", async ({ request }) => {
    const response = await request.get(
      `${APP_ORIGIN}${ASSET_ROOT}/models/pose_landmarker_lite.task`,
    );
    const body = await response.body();

    expect(response.status()).toBe(200);
    expect(body.byteLength).toBe(5_777_746);
    // A TFLite flatbuffer, not an HTML document.
    expect(body.subarray(0, 15).toString("utf8")).not.toContain("<");
  });

  // `/drape-room/vision/` is a reserved static namespace (see
  // lib/drape-room/vision-asset-paths.ts and the guard in proxy.ts). Before
  // that guard, a missing asset fell into the CMS catch-all and streamed a
  // ~136 KB HTML page as HTTP 200 — which made a plain status check pass even
  // with every MediaPipe asset deleted, and handed MediaPipe HTML where it
  // expects a binary.
  for (const suffix of [
    "/models/definitely-not-a-real-model.task",
    "/wasm/definitely-not-a-real-runtime.wasm",
    "/models/does_not_exist.task",
  ]) {
    test(`404s a missing asset instead of streaming the CMS page: ${suffix}`, async ({
      request,
    }) => {
      const response = await request.get(`${APP_ORIGIN}${ASSET_ROOT}${suffix}`);
      const body = await response.body();

      // The status is the whole point: it used to be 200. The body is the
      // site's not-found page, so it is legitimately HTML — what matters is
      // that it is not served as if it were a real asset.
      expect(response.status()).toBe(404);
      expect(body.byteLength).not.toBe(5_777_746);
      expect(body.byteLength).not.toBe(11_756_954);
    });
  }

  test("404s an unknown version directory inside the namespace", async ({ request }) => {
    const response = await request.get(
      `${APP_ORIGIN}/drape-room/vision/mediapipe-9.9.9/models/pose_landmarker_lite.task`,
    );

    expect(response.status()).toBe(404);
  });

  test("the storefront's initial document never requests MediaPipe", async ({ page }) => {
    const visionRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("/drape-room/vision/") ||
        url.includes("tasks-vision") ||
        url.includes("vision_wasm")
      ) {
        visionRequests.push(url);
      }
    });

    // Not networkidle: the harness renders a deterministic placeholder product
    // whose blob image 404s, so the network never goes fully idle.
    await page.goto(`${APP_ORIGIN}${HARNESS_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Drape Room E2E harness" }),
    ).toBeVisible({ timeout: 20_000 });
    // Give hydration and any eager chunk prefetch a chance to fire.
    await page.waitForTimeout(2_000);

    // MediaPipe is behind two dynamic-import boundaries and only loads once a
    // photo is being checked; simply landing on a page must never pull ~23 MB.
    expect(visionRequests).toEqual([]);
  });
});
