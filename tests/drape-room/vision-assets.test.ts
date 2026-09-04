import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VISION_ASSET_ROOT,
  VISION_MANIFEST_PATH,
  checkRuntimeMatchesInstalledPackage,
  checkVisionAssets,
  readVisionManifest,
} from "@/scripts/drape-room/prepare-vision-assets";

/**
 * The Drape Room's local full-body check is the gate that stands between a
 * user photo and a PAID provider request. It runs entirely in the browser on
 * MediaPipe wasm + a pinned Pose Landmarker model, both served same-origin from
 * public/drape-room/vision/mediapipe-1.0.1.
 *
 * If those bytes are absent or altered, the gate cannot run. This suite pins
 * the parts of that contract observable without a browser:
 *
 *   - every manifest asset exists in the deployable tree, non-empty, at the
 *     exact pinned byte size and sha256;
 *   - the runtime wasm/js is byte-identical to the pinned npm package;
 *   - nothing in the load path points at a third-party CDN;
 *   - MediaPipe stays out of the initial storefront bundle.
 *
 * HTTP delivery, the real full-body fixture, and the headshot rejection need a
 * server and a browser — they are pinned in tests/e2e/drape-room-vision.spec.ts
 * and tests/e2e/drape-room.spec.ts.
 */

const root = process.cwd();
const readinessModule = readFileSync(
  join(root, "lib/drape-room/client/photo-readiness-mediapipe.ts"),
  "utf8",
);

// Third-party hosts that must never appear in the runtime load path. The
// model's provenance URL is recorded in manifest.json (documentation, never
// fetched at runtime), so the manifest is deliberately excluded here.
const FORBIDDEN_RUNTIME_HOSTS = [
  "cdn.jsdelivr.net",
  "jsdelivr",
  "unpkg.com",
  "esm.sh",
  "storage.googleapis.com",
  "cdn.skypack.dev",
  "https://",
  "http://",
];

describe("Drape Room MediaPipe runtime assets", () => {
  it("ships every manifest asset at the exact pinned size and hash", () => {
    const checks = checkVisionAssets(root);

    expect(checks.length).toBeGreaterThan(0);
    // Report the offenders rather than a bare boolean so a drift is actionable.
    expect(
      checks
        .filter((check) => !check.ok)
        .map((check) => `${check.entry.file}: ${check.problem}`),
    ).toEqual([]);
    expect(checks.every((check) => check.ok)).toBe(true);
  });

  it("pins the Pose Landmarker Lite model at its expected non-zero byte size", () => {
    const manifest = readVisionManifest(root);
    const model = manifest.models.find(
      (entry) => entry.file === "models/pose_landmarker_lite.task",
    );

    expect(model).toBeDefined();
    // The pinned float16 build. A zero-byte or truncated file is the exact
    // failure that would silently disable the gate.
    expect(model!.bytes).toBe(5_777_746);
    expect(model!.sha256).toMatch(/^[a-f0-9]{64}$/);

    const modelPath = join(root, VISION_ASSET_ROOT, model!.file);
    expect(existsSync(modelPath)).toBe(true);
    const actualBytes = statSync(modelPath).size;
    expect(actualBytes).toBeGreaterThan(0);
    expect(actualBytes).toBe(model!.bytes);
  });

  it("keeps the committed runtime byte-identical to the pinned npm package", () => {
    const parity = checkRuntimeMatchesInstalledPackage(root);

    // [] means node_modules is not installed; nothing to compare.
    if (parity.length === 0) return;
    expect(
      parity.filter((row) => !row.ok).map((row) => `${row.file}: ${row.problem}`),
    ).toEqual([]);

    const installed = JSON.parse(
      readFileSync(
        join(root, "node_modules/@mediapipe/tasks-vision/package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(installed.version).toBe(readVisionManifest(root).packageVersion);
  });

  it("loads only same-origin relative paths, never a third-party CDN", () => {
    expect(readinessModule).toContain(
      'const ASSET_ROOT = "/drape-room/vision/mediapipe-1.0.1"',
    );
    expect(readinessModule).toContain("FilesetResolver.forVisionTasks(`${ASSET_ROOT}/wasm`)");
    expect(readinessModule).toContain(
      "modelAssetPath: `${ASSET_ROOT}/models/pose_landmarker_lite.task`",
    );
    for (const host of FORBIDDEN_RUNTIME_HOSTS) {
      expect(readinessModule).not.toContain(host);
    }
  });

  it("keeps the versioned asset directory aligned with the path the client requests", () => {
    // A version bump must move the directory and the ASSET_ROOT together, or
    // the browser requests a path that does not exist.
    const manifest = readVisionManifest(root);
    expect(VISION_ASSET_ROOT).toBe(
      `public/drape-room/vision/mediapipe-${manifest.packageVersion}`,
    );
    expect(readinessModule).toContain(
      `/drape-room/vision/mediapipe-${manifest.packageVersion}`,
    );
    expect(existsSync(join(root, VISION_MANIFEST_PATH))).toBe(true);
  });

  it("serves the versioned assets with an immutable cache header", () => {
    const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");

    expect(nextConfig).toContain("/drape-room/vision/mediapipe-1.0.1/:path*");
    expect(nextConfig).toContain("public, max-age=31536000, immutable");
  });

  it("reaches MediaPipe only through a dynamic import, never the initial bundle", () => {
    const host = readFileSync(
      join(root, "components/drape-room/drape-room-portal-host.tsx"),
      "utf8",
    );
    const processing = readFileSync(
      join(root, "lib/drape-room/client/photo-processing.ts"),
      "utf8",
    );

    // The only static mention of the package outside the leaf module is a
    // type-only import, which is erased at build time.
    expect(readinessModule).toContain("import type {");
    expect(readinessModule).toMatch(
      /await import\(\s*"@mediapipe\/tasks-vision"\s*\)/,
    );
    // No value-position static import of the package anywhere in the module.
    expect(readinessModule).not.toMatch(
      /^import\s+(?!type\b)[^;]*from\s+"@mediapipe\/tasks-vision"/m,
    );
    // Both callers cross a dynamic import boundary of their own.
    expect(processing).toContain('await import("./photo-readiness-mediapipe")');
    expect(host).not.toContain("@mediapipe/tasks-vision");
    expect(host).not.toContain("photo-readiness-mediapipe");
  });

  it("keeps MediaPipe out of every route's initial chunk list in the build output", () => {
    const manifestPath = join(root, ".next/build-manifest.json");
    // Static analysis above already proves the import shape; this asserts it
    // against real build output when one is present.
    if (!existsSync(manifestPath)) return;

    const chunkDir = join(root, ".next/static/chunks");
    if (!existsSync(chunkDir)) return;

    const mediapipeChunks = readdirSync(chunkDir).filter((file) => {
      if (!file.endsWith(".js")) return false;
      const contents = readFileSync(join(chunkDir, file), "utf8");
      return (
        contents.includes("PoseLandmarker") ||
        contents.includes("FilesetResolver") ||
        contents.includes("vision_wasm")
      );
    });

    // MediaPipe must be code-split into its own chunk(s)...
    expect(mediapipeChunks.length).toBeGreaterThan(0);
    // ...and none of them may be referenced by the eagerly loaded root bundle.
    const buildManifest = readFileSync(manifestPath, "utf8");
    for (const chunk of mediapipeChunks) {
      expect(buildManifest).not.toContain(chunk);
    }
  });
});
