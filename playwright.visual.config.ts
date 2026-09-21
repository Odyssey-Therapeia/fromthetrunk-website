import { dirname, join, resolve } from "node:path";

import { defineConfig } from "@playwright/test";

/**
 * UI invariance proof — REQUIRED TEST 20, "desktop and mobile UI remain
 * visually unchanged".
 *
 * Deliberately separate from playwright.config.ts: no webServer and no global
 * warm-up. The same spec runs twice — once against the pre-change code with
 * --update-snapshots (BEFORE) and once against the changed code without it
 * (AFTER) — so the server and the baseline directory are inputs:
 *
 *   PLAYWRIGHT_BASE_URL      required; the server under test
 *   FTT_VISUAL_SNAPSHOT_DIR  where baselines live (default tests/e2e/__visual__)
 *   FTT_VISUAL_ARTIFACT_DIR  slugs.json, overflow JSON, request logs, reports
 *                            (default: the snapshot directory's parent)
 *   FTT_VISUAL_LABEL         names this run's artifacts (default from the port:
 *                            3101 -> "before", 3000 -> "after")
 *   FTT_VISUAL_SLUGS         optional JSON string or file path that replaces
 *                            slugs.json, so both runs compare the same pieces
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
if (!baseURL) {
  throw new Error(
    "playwright.visual.config.ts needs PLAYWRIGHT_BASE_URL, e.g. http://localhost:3101 for the BEFORE baseline.",
  );
}

const artifactDir = resolve(
  process.env.FTT_VISUAL_ARTIFACT_DIR?.trim() ||
    (process.env.FTT_VISUAL_SNAPSHOT_DIR
      ? dirname(process.env.FTT_VISUAL_SNAPSHOT_DIR)
      : "test-results/ui-invariance"),
);
const port = new URL(baseURL).port;
const label =
  process.env.FTT_VISUAL_LABEL?.trim() ||
  (port === "3101" ? "before" : port === "3000" ? "after" : `port-${port || "default"}`);

// Workers inherit the runner's environment, so the spec and its fixtures read
// exactly these values rather than re-deriving them.
process.env.FTT_VISUAL_ARTIFACT_DIR = artifactDir;
process.env.FTT_VISUAL_LABEL = label;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/ui-invariance.spec.ts",
  snapshotPathTemplate: `${process.env.FTT_VISUAL_SNAPSHOT_DIR ?? "tests/e2e/__visual__"}/{projectName}/{arg}{ext}`,
  // Kept per label so an AFTER run never wipes the BEFORE run's failure output.
  outputDir: join(artifactDir, "test-output", label),
  timeout: 90_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: join(artifactDir, `report-${label}.json`) }],
  ],
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    // A browser-context option, not a top-level `use` key, in Playwright 1.61.
    contextOptions: { reducedMotion: "reduce" },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    colorScheme: "light",
    // A service worker could serve a cached shell from the other run.
    serviceWorkers: "block",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-1280",
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      name: "mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
