/**
 * Deterministic preparation + verification of the Drape Room's MediaPipe
 * runtime assets.
 *
 * The photo-readiness detector
 * (lib/drape-room/client/photo-readiness-mediapipe.ts) loads ONLY same-origin
 * paths under /drape-room/vision/mediapipe-<version>. Nothing is ever fetched
 * from a third-party CDN at runtime, so those bytes have to be present in the
 * deployed public/ tree before a browser asks for them.
 *
 * Two classes of asset live there, and they are sourced differently:
 *
 *   1. RUNTIME (wasm/*.js, wasm/*.wasm) — shipped inside the pinned
 *      @mediapipe/tasks-vision package. This script copies them straight out of
 *      node_modules, so a `pnpm install` followed by this script always
 *      reproduces the exact bytes for the pinned version. No network access.
 *
 *   2. MODELS (models/*.task, models/*.tflite) — published by Google as
 *      standalone downloads, NOT bundled in the npm package. They are committed
 *      to the repository and pinned by sha256 in manifest.json. This script
 *      never downloads them; it verifies them and, if one is missing, prints
 *      the exact curl command to re-fetch it from the provenance URL already
 *      recorded in the manifest.
 *
 * Every asset is verified against manifest.json (byte size + sha256) whichever
 * mode is used, so drift between the pinned package, the manifest, and the
 * deployed tree fails loudly instead of shipping a broken detector.
 *
 * Usage:
 *   pnpm run drape:vision:verify    # check only, non-mutating (CI / pre-build)
 *   pnpm run drape:vision:prepare   # copy runtime files from node_modules, then check
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const VISION_ASSET_ROOT = "public/drape-room/vision/mediapipe-1.0.1";
export const VISION_MANIFEST_PATH = join(VISION_ASSET_ROOT, "manifest.json");
const RUNTIME_PACKAGE_WASM_DIR = "node_modules/@mediapipe/tasks-vision/wasm";

export type VisionAssetEntry = {
  bytes: number;
  file: string;
  sha256: string;
  source?: string;
};

export type VisionManifest = {
  models: VisionAssetEntry[];
  package: string;
  packageVersion: string;
  runtime: VisionAssetEntry[];
};

export type VisionAssetCheck = {
  actualBytes: number | null;
  actualSha256: string | null;
  entry: VisionAssetEntry;
  kind: "model" | "runtime";
  ok: boolean;
  problem: string | null;
};

const sha256File = (absolutePath: string): string =>
  createHash("sha256").update(readFileSync(absolutePath)).digest("hex");

export function readVisionManifest(root: string = process.cwd()): VisionManifest {
  const manifestPath = join(root, VISION_MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Drape Room vision manifest is missing at ${VISION_MANIFEST_PATH}.`,
    );
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as VisionManifest;
}

/**
 * Verify every manifest entry against the bytes actually on disk. Pure and
 * non-mutating so tests can reuse it directly.
 */
export function checkVisionAssets(
  root: string = process.cwd(),
): VisionAssetCheck[] {
  const manifest = readVisionManifest(root);
  const entries: { entry: VisionAssetEntry; kind: "model" | "runtime" }[] = [
    ...manifest.runtime.map((entry) => ({ entry, kind: "runtime" as const })),
    ...manifest.models.map((entry) => ({ entry, kind: "model" as const })),
  ];

  return entries.map(({ entry, kind }) => {
    const absolutePath = join(root, VISION_ASSET_ROOT, entry.file);
    if (!existsSync(absolutePath)) {
      return {
        actualBytes: null,
        actualSha256: null,
        entry,
        kind,
        ok: false,
        problem: "missing",
      };
    }
    const actualBytes = statSync(absolutePath).size;
    if (actualBytes === 0) {
      return {
        actualBytes,
        actualSha256: null,
        entry,
        kind,
        ok: false,
        problem: "empty",
      };
    }
    const actualSha256 = sha256File(absolutePath);
    if (actualBytes !== entry.bytes) {
      return {
        actualBytes,
        actualSha256,
        entry,
        kind,
        ok: false,
        problem: `byte size ${actualBytes} != manifest ${entry.bytes}`,
      };
    }
    if (actualSha256 !== entry.sha256) {
      return {
        actualBytes,
        actualSha256,
        entry,
        kind,
        ok: false,
        problem: `sha256 ${actualSha256} != manifest ${entry.sha256}`,
      };
    }
    return { actualBytes, actualSha256, entry, kind, ok: true, problem: null };
  });
}

/**
 * Confirm the committed runtime files are byte-identical to the pinned
 * package's. Returns [] when node_modules is not installed, because that is an
 * environment gap rather than an asset defect.
 */
export function checkRuntimeMatchesInstalledPackage(
  root: string = process.cwd(),
): { file: string; ok: boolean; problem: string | null }[] {
  const packageWasmDir = join(root, RUNTIME_PACKAGE_WASM_DIR);
  if (!existsSync(packageWasmDir)) return [];

  const manifest = readVisionManifest(root);
  const packageJsonPath = join(
    root,
    "node_modules/@mediapipe/tasks-vision/package.json",
  );
  // Package-version compatibility is part of the gate, not just of --prepare:
  // committed bytes that match the manifest can still be the WRONG build if the
  // pinned dependency moved underneath them.
  const versionRow = (() => {
    if (!existsSync(packageJsonPath)) {
      return {
        file: "@mediapipe/tasks-vision",
        ok: false,
        problem: "installed package.json is missing",
      };
    }
    const installed = (
      JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
    ).version;
    return {
      file: `@mediapipe/tasks-vision@${installed}`,
      ok: installed === manifest.packageVersion,
      problem:
        installed === manifest.packageVersion
          ? null
          : `installed ${installed} does not match the manifest's pinned ${manifest.packageVersion}`,
    };
  })();

  return [
    versionRow,
    ...manifest.runtime.map((entry) => {
    const packaged = join(root, RUNTIME_PACKAGE_WASM_DIR, entry.file.replace(/^wasm\//, ""));
    const deployed = join(root, VISION_ASSET_ROOT, entry.file);
    if (!existsSync(packaged)) {
      return { file: entry.file, ok: false, problem: "absent from the installed package" };
    }
    if (!existsSync(deployed)) {
      return { file: entry.file, ok: false, problem: "absent from public/" };
    }
    const ok = sha256File(packaged) === sha256File(deployed);
    return {
      file: entry.file,
      ok,
      problem: ok ? null : "differs from the installed @mediapipe/tasks-vision build",
    };
    }),
  ];
}

/** Copy the runtime wasm/js out of the pinned package into the versioned path. */
function copyRuntimeFromPackage(root: string): string[] {
  const manifest = readVisionManifest(root);
  const packageJsonPath = join(root, "node_modules/@mediapipe/tasks-vision/package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      "node_modules/@mediapipe/tasks-vision is not installed. Run `pnpm install` first.",
    );
  }
  const installedVersion = (
    JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
  ).version;
  if (installedVersion !== manifest.packageVersion) {
    throw new Error(
      `Installed @mediapipe/tasks-vision@${installedVersion} does not match the manifest's pinned ${manifest.packageVersion}. ` +
        `Bump ${VISION_ASSET_ROOT} to a new versioned directory rather than overwriting a released one.`,
    );
  }

  const copied: string[] = [];
  for (const entry of manifest.runtime) {
    const from = join(root, RUNTIME_PACKAGE_WASM_DIR, entry.file.replace(/^wasm\//, ""));
    const to = join(root, VISION_ASSET_ROOT, entry.file);
    if (!existsSync(from)) {
      throw new Error(`${entry.file} is absent from the installed package at ${from}.`);
    }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied.push(entry.file);
  }
  return copied;
}

function main(): void {
  const prepare = process.argv.includes("--prepare");
  const root = process.cwd();

  if (prepare) {
    const copied = copyRuntimeFromPackage(root);
    console.info(
      `[drape-room:vision] Copied ${copied.length} runtime file(s) from the pinned package:\n  ${copied.join("\n  ")}`,
    );
  }

  const checks = checkVisionAssets(root);
  const parity = checkRuntimeMatchesInstalledPackage(root);
  const failures = checks.filter((check) => !check.ok);
  const parityFailures = parity.filter((row) => !row.ok);

  for (const check of checks) {
    const status = check.ok ? "ok  " : "FAIL";
    console.info(
      `[drape-room:vision] ${status} ${check.kind.padEnd(7)} ${check.entry.file} (${check.entry.bytes} bytes)` +
        (check.ok ? "" : ` — ${check.problem}`),
    );
  }
  if (parity.length === 0) {
    console.warn(
      "[drape-room:vision] node_modules/@mediapipe/tasks-vision absent — skipped package-parity check.",
    );
  } else {
    for (const row of parityFailures) {
      console.error(`[drape-room:vision] FAIL parity ${row.file} — ${row.problem}`);
    }
  }

  if (failures.length === 0 && parityFailures.length === 0) {
    console.info(
      `[drape-room:vision] All ${checks.length} assets verified against ${VISION_MANIFEST_PATH}.`,
    );
    return;
  }

  // Models are not in the npm package, so `--prepare` cannot recover them.
  // Print the pinned provenance URL so the fetch stays reproducible and
  // explicitly operator-driven rather than an implicit build-time download.
  for (const failure of failures) {
    if (failure.kind !== "model" || !failure.entry.source) continue;
    console.error(
      `\n[drape-room:vision] Re-fetch ${failure.entry.file} (models are not shipped in the npm package):\n` +
        `  curl -fsSL -o "${join(VISION_ASSET_ROOT, failure.entry.file)}" "${failure.entry.source}"\n` +
        `  # then re-run: pnpm run drape:vision:verify  (expects sha256 ${failure.entry.sha256})`,
    );
  }
  process.exitCode = 1;
  throw new Error(
    `Drape Room vision assets failed verification: ${failures.length} manifest mismatch(es), ${parityFailures.length} package-parity mismatch(es).`,
  );
}

// Only run when invoked directly, so the helpers above stay importable by tests.
if (process.argv[1]?.includes("prepare-vision-assets")) {
  main();
}
