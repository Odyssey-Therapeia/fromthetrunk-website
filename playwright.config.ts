import { defineConfig } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const healthURL = process.env.PLAYWRIGHT_HEALTH_URL?.trim() || baseURL;
const configuredPort = Number.parseInt(
  process.env.PLAYWRIGHT_PORT?.trim() || new URL(baseURL).port || "3000",
  10,
);
const port = Number.isFinite(configuredPort) ? configuredPort : 3000;
const isolatedRun =
  Boolean(process.env.CI) || process.env.PLAYWRIGHT_ISOLATED === "true";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  // Explicit readiness + route warm-up, so a cold dev-server compile never
  // burns a per-test timeout. See tests/e2e/support/global-setup.ts.
  globalSetup: "./tests/e2e/support/global-setup.ts",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    // Deliberately `next dev`, not `next build && next start`: the Drape Room
    // browser harness at /collection/e2e/drape-room is hard-disabled when
    // NODE_ENV === "production", which is a safety property, not a defect. The
    // suite performs no database writes (cart reserve/release are intercepted
    // in tests/e2e/support/cart-reservation-stub.ts).
    command: `pnpm exec next dev --webpack --port ${port}`,
    url: healthURL,
    reuseExistingServer: !isolatedRun,
    // Cold Next compiles are slow; this bounds SERVER BOOT only. Per-test
    // timeouts stay at 30s so a genuinely hung test still fails fast.
    timeout: 180_000,
    env: {
      // The harness 404s without this, which previously made every Drape Room
      // spec fail at its first assertion for a non-obvious reason.
      FTT_DRAPE_ROOM_E2E: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
