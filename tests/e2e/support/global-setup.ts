import { chromium, type FullConfig } from "@playwright/test";

/**
 * Deterministic readiness + warm-up for the browser suite.
 *
 * The Drape Room harness (app/(site)/collection/e2e/drape-room/page.tsx) is
 * hard-disabled when NODE_ENV === "production", so the suite cannot run against
 * `next start`; it must use the dev server. Under `next dev` each route is
 * compiled on first request, and that first compile regularly exceeds a normal
 * per-test timeout — which previously showed up as tests "failing" on a cold
 * machine and passing on a warm one.
 *
 * The fix is to make readiness explicit and automatic rather than a manual
 * "hit the page once first" step, and without inflating per-test timeouts:
 *
 *   1. poll a static, database-free asset until the server actually answers;
 *   2. request each route the specs navigate to, so compilation is already done
 *      before the first timed assertion.
 *
 * Warm-up requests are plain GETs. They read; they never write.
 */

// Static and database-free: proves the server is listening AND that the
// reserved vision namespace is being served, without touching Postgres.
const READINESS_PATH = "/drape-room/vision/mediapipe-1.0.1/manifest.json";

const WARM_PATHS = [
  "/",
  "/collection",
  "/cart",
  "/collection/e2e/drape-room",
];

const READINESS_TIMEOUT_MS = 180_000;
const WARM_TIMEOUT_MS = 120_000;

async function waitForServer(baseURL: string): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastError = "no attempt made";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL(READINESS_PATH, baseURL), {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `E2E server at ${baseURL} was not ready within ${READINESS_TIMEOUT_MS}ms (last: ${lastError}).`,
  );
}

/**
 * Warm in a REAL browser, not with fetch.
 *
 * Under `next dev` the server compiles a route on first request, but the
 * client-side chunks compile only when a browser actually asks for them. A
 * fetch-based warm-up therefore leaves the first real page visit racing chunk
 * compilation, and a chunk that is invalidated mid-flight throws ChunkLoadError
 * during hydration — which unmounts the product grid and makes the SSR'd cards
 * disappear. That surfaced as "No addable product found on the collection page"
 * on a cold machine while the same specs passed on a warm one.
 *
 * Visiting each route once with a browser compiles both halves up front.
 */
async function warm(baseURL: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    for (const path of WARM_PATHS) {
      try {
        await page.goto(path, {
          waitUntil: "load",
          timeout: WARM_TIMEOUT_MS,
        });
        // Let hydration finish so its chunks are compiled and cached too.
        await page.waitForTimeout(1_500);
      } catch {
        // A warm-up miss is not a failure: the route may legitimately need a
        // database this run does not have. Specs that need it will report it.
      }
    }
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:3000";

  await waitForServer(baseURL);
  await warm(baseURL);
}
