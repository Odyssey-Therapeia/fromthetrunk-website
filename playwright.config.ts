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
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --webpack --port ${port}`,
    url: healthURL,
    reuseExistingServer: !isolatedRun,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
