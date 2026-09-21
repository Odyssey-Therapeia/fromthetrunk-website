import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  expect,
  test as base,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

export { expect };

/**
 * Deterministic harness for the UI invariance proof (playwright.visual.config.ts).
 *
 * Everything here exists so two runs — the pre-change code and the changed
 * code — differ ONLY by what the code renders:
 *
 *   - first-visit overlays are suppressed through their own storage keys and
 *     cookies, never by clicking them away;
 *   - animations and transitions collapse to their settled frame, marquees
 *     stop, and the Next dev overlay is hidden;
 *   - each capture waits for hydration, fonts, the target's images and a quiet
 *     DOM, then hides fixed layers and un-sticks sticky ones OUTSIDE the target
 *     so nothing floats over it (neither changes layout);
 *   - every same-origin non-GET request is logged; analytics writes are
 *     stubbed and anything unknown is aborted, so browsing stays read-only.
 */

// ---------------------------------------------------------------------------
// Run identity and artifacts
// ---------------------------------------------------------------------------

/** Same rule as playwright.visual.config.ts, which also exports it to env. */
export const VISUAL_ARTIFACT_DIR = resolve(
  process.env.FTT_VISUAL_ARTIFACT_DIR?.trim() ||
    (process.env.FTT_VISUAL_SNAPSHOT_DIR
      ? dirname(process.env.FTT_VISUAL_SNAPSHOT_DIR)
      : "test-results/ui-invariance"),
);
export const VISUAL_RUN_LABEL = process.env.FTT_VISUAL_LABEL?.trim() || "run";
export const SLUGS_FILE = join(VISUAL_ARTIFACT_DIR, "slugs.json");
export const SEARCH_QUERY = "saree";

export function writeArtifact(relativePath: string, value: unknown): string {
  const file = join(VISUAL_ARTIFACT_DIR, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function fileSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// First-visit overlays
// ---------------------------------------------------------------------------

/*
 * Each key was read from the source of BOTH trees (HEAD fd971a9 and the
 * working tree) before being relied on:
 *
 * - components/widgets/welcome-popup.tsx returns early while
 *   localStorage["ftt-welcome-seen-v1"] is truthy.
 * - components/sections/home-intro-gate.tsx skips the intro when
 *   sessionStorage["ftt-home-intro-seen"] === "true".
 * - lib/drape-room/launch/storage.ts hasSeenDrapeTeaser() compares
 *   sessionStorage[config.sessionKey = "ftt:drape-room:teaser-shown:v1"] to "1".
 * - lib/drape-room/launch/storage.ts hasSeenDrapeCardCoachmark() compares the
 *   cookie config.coachmarkCookie = "ftt_drape_guide_v1" to "true". The coach
 *   mark exists only in the working tree; the cookie is inert on HEAD.
 * - components/analytics/analytics-gate.tsx renders the banner only for
 *   "unknown"; lib/analytics/consent.ts CONSENT_COOKIE = "ftt_analytics_consent".
 *   "denied" hides the banner and keeps GTM unloaded ("granted" would pull in
 *   third-party scripts and make runs differ).
 * - components/widgets/floating-whatsapp.tsx and floating-reel.tsx keep their
 *   auto-bubble and reel closed while their sessionStorage key is set.
 */
export const FIRST_VISIT_LOCAL_STORAGE: Readonly<Record<string, string>> = {
  "ftt-welcome-seen-v1": "1",
};

export const FIRST_VISIT_SESSION_STORAGE: Readonly<Record<string, string>> = {
  "ftt-home-intro-seen": "true",
  "ftt:drape-room:teaser-shown:v1": "1",
  "ftt-wa-bubble-dismissed": "1",
  "ftt-reel-dismissed": "1",
};

export const FIRST_VISIT_COOKIES: Readonly<Record<string, string>> = {
  ftt_analytics_consent: "denied",
  ftt_drape_guide_v1: "true",
};

const HARNESS_STYLE_ID = "ftt-visual-harness-style";
const HIDDEN_ATTRIBUTE = "data-ftt-visual-hidden";
const UNSTUCK_ATTRIBUTE = "data-ftt-visual-unstuck";
const ROOT_ATTRIBUTE = "data-ftt-visual-root";

/*
 * Animations and transitions are collapsed to zero duration rather than
 * paused mid-flight: a paused `both`-fill entrance would freeze at its
 * invisible first frame, while a zero-length one lands on its settled frame
 * every time. The marquee is stopped outright so it rests at its origin.
 */
export const HARNESS_CSS = `
nextjs-portal { display: none !important; }
*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
.ftt-marquee, [class*="ftt-marquee"] { animation: none !important; }
[${HIDDEN_ATTRIBUTE}] { visibility: hidden !important; }
[${UNSTUCK_ATTRIBUTE}] { position: relative !important; top: auto !important; bottom: auto !important; }
`;

type FirstVisitPayload = {
  css: string;
  local: Record<string, string>;
  session: Record<string, string>;
  styleId: string;
};

/** Runs before any page script on every navigation (serialised into the page). */
function installFirstVisitState(payload: FirstVisitPayload): void {
  try {
    for (const [key, value] of Object.entries(payload.local)) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Opaque origins (about:blank frames) have no storage.
  }
  try {
    for (const [key, value] of Object.entries(payload.session)) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Opaque origins (about:blank frames) have no storage.
  }

  // lib/analytics/client.ts posts events with sendBeacon and falls back to
  // fetch when the beacon is refused. Refusing same-origin API beacons routes
  // every analytics write through fetch, which the write guard can stub.
  try {
    const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (nativeSendBeacon) {
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        const target = new URL(String(url), window.location.href);
        if (
          target.origin === window.location.origin &&
          target.pathname.startsWith("/api/")
        ) {
          return false;
        }
        return nativeSendBeacon(url, data);
      };
    }
  } catch {
    // A locked-down navigator simply keeps its native beacon.
  }

  const inject = () => {
    if (document.getElementById(payload.styleId)) return;
    const parent = document.head ?? document.documentElement;
    if (!parent) return;
    const style = document.createElement("style");
    style.id = payload.styleId;
    style.textContent = payload.css;
    parent.appendChild(style);
  };
  inject();
  document.addEventListener("DOMContentLoaded", inject, { once: true });
}

// ---------------------------------------------------------------------------
// Write guard
// ---------------------------------------------------------------------------

type NonGetRequest = {
  action: "aborted" | "allowed-read" | "stubbed-analytics";
  method: string;
  path: string;
  resourceType: string;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Tracking writes (lib/analytics/client.ts -> /api/v2/events/track). */
const ANALYTICS_WRITE_PATHS = [/^\/api\/v2\/events(?:\/|$)/, /^\/api\/auth\/_log$/];
/**
 * Reads that happen to use POST. The working tree's card and PDP stock badge
 * fetch the viewer-state verdict this way (lib/realtime/use-collection-stock.tsx);
 * blocking it would make the AFTER UI differ for a harness reason.
 */
const READ_ONLY_POST_PATHS = [/^\/api\/v2\/products\/viewer-state$/];

async function installWriteGuard(
  page: Page,
  origin: string,
  log: NonGetRequest[],
): Promise<void> {
  await page.route(
    (url) => url.origin === origin,
    async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (SAFE_METHODS.has(method)) {
        await route.continue().catch(() => undefined);
        return;
      }

      const url = new URL(request.url());
      const entry = {
        method,
        path: `${url.pathname}${url.search}`,
        resourceType: request.resourceType(),
      };

      if (ANALYTICS_WRITE_PATHS.some((pattern) => pattern.test(url.pathname))) {
        log.push({ ...entry, action: "stubbed-analytics" });
        await route.fulfill({ status: 204, body: "" }).catch(() => undefined);
        return;
      }
      if (READ_ONLY_POST_PATHS.some((pattern) => pattern.test(url.pathname))) {
        log.push({ ...entry, action: "allowed-read" });
        await route.continue().catch(() => undefined);
        return;
      }

      log.push({ ...entry, action: "aborted" });
      await route.abort("blockedbyclient").catch(() => undefined);
    },
  );
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

export const test = base.extend({
  // The callback is `runTest`, not `use`: the repo's react-hooks lint rule
  // treats any call to a function named `use` as a React hook.
  page: async ({ page, context, baseURL }, runTest, testInfo) => {
    if (!baseURL) {
      throw new Error("The visual harness needs a baseURL (PLAYWRIGHT_BASE_URL).");
    }
    const origin = new URL(baseURL).origin;

    await context.addCookies(
      Object.entries(FIRST_VISIT_COOKIES).map(([name, value]) => ({
        name,
        value,
        url: origin,
        sameSite: "Lax" as const,
      })),
    );
    await page.addInitScript(installFirstVisitState, {
      css: HARNESS_CSS,
      local: { ...FIRST_VISIT_LOCAL_STORAGE },
      session: { ...FIRST_VISIT_SESSION_STORAGE },
      styleId: HARNESS_STYLE_ID,
    });

    const nonGetRequests: NonGetRequest[] = [];
    await installWriteGuard(page, origin, nonGetRequests);

    await runTest(page);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    const file = writeArtifact(
      join(
        "requests",
        VISUAL_RUN_LABEL,
        testInfo.project.name,
        `${fileSafe(testInfo.title)}.json`,
      ),
      {
        baseURL,
        nonGetRequests,
        project: testInfo.project.name,
        test: testInfo.title,
      },
    );
    await testInfo.attach("non-get-requests.json", {
      contentType: "application/json",
      path: file,
    });
  },
});

// ---------------------------------------------------------------------------
// Navigation and settling
// ---------------------------------------------------------------------------

export async function openPage(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "load" });
  if (response && response.status() >= 400) {
    throw new Error(`GET ${path} answered HTTP ${response.status()}.`);
  }
  await ensureHarnessStyle(page);
}

/** Hydration is allowed to drop a foreign <style>; put it back if it did. */
async function ensureHarnessStyle(page: Page): Promise<void> {
  await page.evaluate(
    ({ css, styleId }) => {
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    },
    { css: HARNESS_CSS, styleId: HARNESS_STYLE_ID },
  );
}

async function pollUntil(
  page: Page,
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(intervalMs);
  }
}

/** React attaches its fiber to every host node it hydrates. */
async function waitForHydration(page: Page, target: Locator): Promise<void> {
  const hydrated = await pollUntil(
    page,
    () =>
      target.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
      ),
    60_000,
  );
  if (!hydrated) {
    throw new Error("The capture target never hydrated (no React fiber after 60s).");
  }
}

/*
 * components/widgets/site-widgets.tsx mounts the floating WhatsApp control
 * 6.5s after hydration on every non-home route. Waiting for it first means the
 * isolation step can never race a fixed layer that mounts mid-capture.
 */
const LATE_WIDGET_SELECTOR = '[aria-label="Chat with us on WhatsApp"]';
const lateWidgetsSettledAt = new WeakMap<Page, string>();

async function waitForLateWidgets(page: Page): Promise<void> {
  if (lateWidgetsSettledAt.get(page) === page.url()) return;
  const mounted = await page
    .locator(LATE_WIDGET_SELECTOR)
    .first()
    .waitFor({ state: "attached", timeout: 25_000 })
    .then(
      () => true,
      () => false,
    );
  if (!mounted) {
    test.info().annotations.push({
      type: "harness-warning",
      description: `${page.url()}: the floating WhatsApp control did not mount within 25s.`,
    });
  }
  lateWidgetsSettledAt.set(page, page.url());
}

async function loadImages(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((root) => {
    for (const image of Array.from(root.querySelectorAll("img"))) {
      if (image.loading === "lazy") image.loading = "eager";
    }
  });
  const loaded = await pollUntil(
    page,
    () =>
      target.evaluate((root) =>
        Array.from(root.querySelectorAll("img")).every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      ),
    30_000,
  );
  if (!loaded) {
    test.info().annotations.push({
      type: "harness-warning",
      description: `${page.url()}: an image inside the capture target was still not decoded after 30s.`,
    });
  }
}

async function waitForDomQuiet(
  target: Locator,
  quietMs = 800,
  timeoutMs = 15_000,
): Promise<void> {
  await target.evaluate(
    (root, { quiet, timeout }) =>
      new Promise<void>((resolveQuiet) => {
        let quietTimer = 0;
        let deadlineTimer = 0;
        const observer = new MutationObserver(() => {
          window.clearTimeout(quietTimer);
          quietTimer = window.setTimeout(finish, quiet);
        });
        function finish() {
          observer.disconnect();
          window.clearTimeout(quietTimer);
          window.clearTimeout(deadlineTimer);
          resolveQuiet();
        }
        observer.observe(root, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
        quietTimer = window.setTimeout(finish, quiet);
        deadlineTimer = window.setTimeout(finish, timeout);
      }),
    { quiet: quietMs, timeout: timeoutMs },
  );
}

/** Proves the suppression worked instead of assuming it. */
async function assertNoFirstVisitOverlay(page: Page): Promise<void> {
  await expect(
    page.locator("[data-ftt-consent-banner]"),
    "the analytics consent banner must stay suppressed by its cookie",
  ).toHaveCount(0);
  await expect(
    page.locator('[role="dialog"]').filter({ visible: true }),
    "no dialog (welcome popup, Drape Room teaser) may be open during a capture",
  ).toHaveCount(0);
}

export async function settle(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible({ timeout: 60_000 });
  await waitForHydration(page, target);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await waitForLateWidgets(page);
  await ensureHarnessStyle(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await loadImages(page, target);
  await waitForDomQuiet(target);
  await assertNoFirstVisitOverlay(page);
}

// ---------------------------------------------------------------------------
// Isolation and capture
// ---------------------------------------------------------------------------

/**
 * Hides fixed layers and un-sticks sticky ones that are neither ancestors nor
 * descendants of a root. A sticky box already occupies its flow position and a
 * fixed one occupies none, so neither change moves the target.
 */
export async function isolate(page: Page, roots: Locator[]): Promise<void> {
  for (const root of roots) {
    await root.evaluate((node, attribute) => node.setAttribute(attribute, ""), ROOT_ATTRIBUTE);
  }
  await page.evaluate(
    ({ hidden, root, unstuck }) => {
      const roots = Array.from(document.querySelectorAll(`[${root}]`));
      for (const element of Array.from(document.body.querySelectorAll("*"))) {
        if (roots.some((node) => element.contains(node) || node.contains(element))) {
          continue;
        }
        const { position } = window.getComputedStyle(element);
        if (position === "fixed") element.setAttribute(hidden, "");
        else if (position === "sticky") element.setAttribute(unstuck, "");
      }
    },
    { hidden: HIDDEN_ATTRIBUTE, root: ROOT_ATTRIBUTE, unstuck: UNSTUCK_ATTRIBUTE },
  );
}

export async function releaseIsolation(page: Page): Promise<void> {
  await page.evaluate((attributes) => {
    for (const attribute of attributes) {
      for (const element of Array.from(document.querySelectorAll(`[${attribute}]`))) {
        element.removeAttribute(attribute);
      }
    }
  }, [HIDDEN_ATTRIBUTE, ROOT_ATTRIBUTE, UNSTUCK_ATTRIBUTE]);
}

/** Soft, so one test reports every differing piece rather than the first. */
export async function expectElementScreenshot(
  page: Page,
  target: Locator,
  name: string,
): Promise<void> {
  await settle(page, target);
  await isolate(page, [target]);
  try {
    await expect.soft(target).toHaveScreenshot(`${name}.png`);
  } finally {
    await releaseIsolation(page);
  }
}

/**
 * Captures the union of several cards (a grid row) including the gaps between
 * them, so spacing and alignment are compared too, not just each card alone.
 */
export async function expectRegionScreenshot(
  page: Page,
  members: Locator[],
  name: string,
  padding = 12,
): Promise<void> {
  const [first] = members;
  if (!first) throw new Error(`Region ${name} has no members.`);
  for (const member of members) await settle(page, member);

  await isolate(page, members);
  try {
    await first.evaluate((node) => {
      window.scrollBy(0, node.getBoundingClientRect().top - 24);
    });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Region screenshots need a fixed viewport.");

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const member of members) {
      const box = await member.boundingBox();
      if (!box) throw new Error(`Region ${name} has a member with no layout box.`);
      left = Math.min(left, box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width);
      bottom = Math.max(bottom, box.y + box.height);
    }
    if (bottom + padding > viewport.height) {
      throw new Error(
        `Region ${name} is ${Math.ceil(bottom - top)}px tall and does not fit the ${viewport.height}px viewport.`,
      );
    }

    const x = Math.max(0, Math.floor(left - padding));
    const y = Math.max(0, Math.floor(top - padding));
    const clip = {
      x,
      y,
      width: Math.min(viewport.width, Math.ceil(right + padding)) - x,
      height: Math.ceil(bottom + padding) - y,
    };
    await expect.soft(page).toHaveScreenshot(`${name}.png`, { clip });
  } finally {
    await releaseIsolation(page);
  }
}

// ---------------------------------------------------------------------------
// Product cards
// ---------------------------------------------------------------------------

/** Present on the card root in both HEAD and the working tree. */
export const PRODUCT_CARD_SELECTOR = "[data-ftt-product-card]";

export function productCards(page: Page): Locator {
  return page.locator(PRODUCT_CARD_SELECTOR);
}

export function productCardBySlug(page: Page, slug: string): Locator {
  return productCards(page)
    .filter({ has: page.locator(`a[href="/collection/${slug}"]`) })
    .first();
}

export async function slugOfCard(card: Locator): Promise<string> {
  const href = await card.locator('a[href^="/collection/"]').first().getAttribute("href");
  return decodeURIComponent((href ?? "").slice("/collection/".length).split(/[?#]/)[0] ?? "");
}

/** The leading cards that share the first card's row. */
export async function firstRowMembers(page: Page, limit = 8): Promise<Locator[]> {
  const cards = productCards(page);
  await settle(page, cards.first());
  const tops = await cards.evaluateAll(
    (nodes, max) => nodes.slice(0, max).map((node) => node.getBoundingClientRect().top),
    limit,
  );
  const [firstTop] = tops;
  if (firstTop === undefined) throw new Error("No product cards rendered.");
  let count = 0;
  while (count < tops.length && Math.abs((tops[count] ?? Number.NaN) - firstTop) <= 2) {
    count += 1;
  }
  return Array.from({ length: count }, (_, index) => cards.nth(index));
}

type CardInventoryEntry = {
  blouse: boolean;
  index: number;
  reserved: boolean;
  slug: string;
  sold: boolean;
};

/** Classifies cards by the badge and button copy they already render. */
async function readCardInventory(page: Page): Promise<CardInventoryEntry[]> {
  return productCards(page).evaluateAll((cards) =>
    cards.map((card, index) => {
      const href = card.querySelector('a[href^="/collection/"]')?.getAttribute("href") ?? "";
      const slug = decodeURIComponent(
        href.slice("/collection/".length).split(/[?#]/)[0] ?? "",
      );
      const leafTexts = Array.from(card.querySelectorAll("*"))
        .filter((element) => element.childElementCount === 0)
        .map((element) => (element.textContent ?? "").trim())
        .filter(Boolean);
      return {
        blouse: leafTexts.includes("Select size"),
        index,
        reserved: leafTexts.includes("Reserved"),
        slug,
        sold: leafTexts.includes("Sold out") || leafTexts.includes("Sold"),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Slugs: resolved once, then shared by every run
// ---------------------------------------------------------------------------

export type VisualSlugs = {
  version: 1;
  resolvedAt: string;
  resolvedFrom: string;
  resolvedByProject: string;
  /** First eight /collection slugs in DOM order; guards the row region. */
  collectionOrder: string[];
  collectionCards: string[];
  reservedCard: string | null;
  soldCard: string | null;
  pdpAvailable: string | null;
  pdpSold: string | null;
  searchQuery: string;
  searchOrder: string[];
  searchCards: string[];
  notes: string[];
};

let cachedSlugs: VisualSlugs | null = null;

function parseSlugs(raw: string, source: string): VisualSlugs {
  const parsed = JSON.parse(raw) as Partial<VisualSlugs>;
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.collectionOrder) ||
    !Array.isArray(parsed.collectionCards) ||
    !Array.isArray(parsed.searchOrder) ||
    !Array.isArray(parsed.searchCards)
  ) {
    throw new Error(`${source} is not a version 1 visual slugs file.`);
  }
  return parsed as VisualSlugs;
}

export function hasResolvedSlugs(): boolean {
  return Boolean(cachedSlugs || process.env.FTT_VISUAL_SLUGS?.trim() || existsSync(SLUGS_FILE));
}

export async function loadOrResolveSlugs(page: Page, testInfo: TestInfo): Promise<VisualSlugs> {
  if (cachedSlugs) return cachedSlugs;

  const override = process.env.FTT_VISUAL_SLUGS?.trim();
  if (override) {
    cachedSlugs = override.startsWith("{")
      ? parseSlugs(override, "FTT_VISUAL_SLUGS")
      : parseSlugs(readFileSync(resolve(override), "utf8"), override);
    return cachedSlugs;
  }
  if (existsSync(SLUGS_FILE)) {
    cachedSlugs = parseSlugs(readFileSync(SLUGS_FILE, "utf8"), SLUGS_FILE);
    return cachedSlugs;
  }

  cachedSlugs = await resolveSlugs(page, testInfo);
  mkdirSync(dirname(SLUGS_FILE), { recursive: true });
  writeFileSync(SLUGS_FILE, `${JSON.stringify(cachedSlugs, null, 2)}\n`, "utf8");
  return cachedSlugs;
}

async function resolveSlugs(page: Page, testInfo: TestInfo): Promise<VisualSlugs> {
  await openPage(page, "/collection");
  await expect(productCards(page).first()).toBeVisible({ timeout: 60_000 });
  await waitForHydration(page, productCards(page).first());
  const collection = await readCardInventory(page);

  await openPage(page, `/search?q=${encodeURIComponent(SEARCH_QUERY)}`);
  await expect(productCards(page).first()).toBeVisible({ timeout: 60_000 });
  const search = await readCardInventory(page);

  const reserved = collection.find((card) => card.reserved) ?? null;
  const sold = collection.find((card) => card.sold) ?? null;
  const availableSaree =
    collection.find((card) => !card.reserved && !card.sold && !card.blouse) ?? null;

  const hiddenByCatalogue =
    "The public catalogue query hides sold and actively reserved pieces " +
    "(lib/adapters/postgres-catalog-search.ts), so none is expected there.";
  const notes: string[] = [];
  if (!reserved) {
    notes.push(`No /collection card carried a "Reserved" badge at resolution time. ${hiddenByCatalogue}`);
  }
  if (!sold) {
    notes.push(
      `No /collection card carried a "Sold out"/"Sold" badge at resolution time, so there is no sold card or sold PDP to compare. ${hiddenByCatalogue}`,
    );
  }

  return {
    version: 1,
    resolvedAt: new Date().toISOString(),
    resolvedFrom: new URL(page.url()).origin,
    resolvedByProject: testInfo.project.name,
    collectionOrder: collection.slice(0, 8).map((card) => card.slug),
    collectionCards: collection.slice(0, 4).map((card) => card.slug),
    reservedCard: reserved?.slug ?? null,
    soldCard: sold?.slug ?? null,
    pdpAvailable: availableSaree?.slug ?? null,
    pdpSold: sold?.slug ?? null,
    searchQuery: SEARCH_QUERY,
    searchOrder: search.slice(0, 8).map((card) => card.slug),
    searchCards: search.slice(0, 4).map((card) => card.slug),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Overflow facts (recorded, never pixel-asserted)
// ---------------------------------------------------------------------------

export type BoxFacts = {
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type PillFacts = {
  clientHeight: number;
  clientWidth: number;
  /** Content wider than the pill AND the pill clips it (ellipsis/hidden). */
  clipped: boolean;
  contentWiderThanPill: boolean;
  inkBox: BoxFacts;
  /** The text itself reaches under the add/in-bag buttons (the box may not). */
  inkCollidesWithButtons: boolean;
  inkOutsideCard: boolean;
  inkOutsidePill: boolean;
  inkOutsideSlot: boolean;
  lineCount: number;
  /** Any of: content wider than the box, ink past its edge, box past its slot or card. */
  overflows: boolean;
  overflowX: string;
  pillBox: BoxFacts;
  pillCollidesWithButtons: boolean;
  pillOutsideCard: boolean;
  pillOutsideSlot: boolean;
  scrollHeight: number;
  scrollWidth: number;
  slotBox: BoxFacts;
  text: string;
  textOverflow: string;
  /** Painted outside where it belongs: unclipped ink past the pill, or the pill past its slot or card. */
  visiblySpills: boolean;
  whiteSpace: string;
};

export type CardOverflowFacts = {
  cardBox: BoxFacts;
  cardClientWidth: number;
  cardScrollWidth: number;
  index: number;
  pill: PillFacts | null;
  rowBox: BoxFacts | null;
  rowClientWidth: number | null;
  rowFound: boolean;
  rowOverflowX: number | null;
  rowOverflows: boolean | null;
  rowScrollWidth: number | null;
  slug: string;
};

export type OverflowFacts = {
  body: { clientWidth: number; overflowX: number; scrollWidth: number };
  cards: CardOverflowFacts[];
  document: { clientWidth: number; overflowX: number; scrollWidth: number };
  summary: {
    cards: number;
    pills: number;
    pillsClipped: number;
    pillsCollidingWithButtons: number;
    pillsMultiLine: number;
    pillsOutsideCard: number;
    pillsOverflowing: number;
    pillsVisiblySpilling: number;
    rowsMeasured: number;
    rowsOverflowing: number;
  };
  url: string;
  viewport: { height: number; width: number };
};

/**
 * For every product card commerce row: scrollWidth versus clientWidth, and
 * whether its "New arrival" pill overflows. The row is the card body's
 * border-t child in both trees; the pill is the rounded-full span in the row's
 * leading slot.
 */
export async function measureCommerceRowOverflow(page: Page): Promise<OverflowFacts> {
  return page.evaluate((cardSelector): OverflowFacts => {
    const EPSILON = 0.5;
    const round = (value: number) => Math.round(value * 100) / 100;
    const box = (rect: DOMRect): BoxFacts => ({
      height: round(rect.height),
      left: round(rect.left),
      right: round(rect.right),
      top: round(rect.top + window.scrollY),
      width: round(rect.width),
    });
    const horizontallyOutside = (inner: DOMRect, outer: DOMRect) =>
      inner.right > outer.right + EPSILON || inner.left < outer.left - EPSILON;

    const cards = Array.from(document.querySelectorAll<HTMLElement>(cardSelector));
    const entries = cards.map((card, index): CardOverflowFacts => {
      const href = card.querySelector('a[href^="/collection/"]')?.getAttribute("href") ?? "";
      const slug = decodeURIComponent(href.slice("/collection/".length).split(/[?#]/)[0] ?? "");
      const cardRect = card.getBoundingClientRect();
      const body = card.lastElementChild;
      const borderRow = body
        ? Array.from(body.children).find((child) => child.classList.contains("border-t"))
        : undefined;
      const row = (borderRow ?? body?.lastElementChild ?? null) as HTMLElement | null;

      const base: CardOverflowFacts = {
        cardBox: box(cardRect),
        cardClientWidth: card.clientWidth,
        cardScrollWidth: card.scrollWidth,
        index,
        pill: null,
        rowBox: null,
        rowClientWidth: null,
        rowFound: false,
        rowOverflowX: null,
        rowOverflows: null,
        rowScrollWidth: null,
        slug,
      };
      if (!row) return base;

      const rowRect = row.getBoundingClientRect();
      const slot = row.firstElementChild as HTMLElement | null;
      const buttons = row.lastElementChild as HTMLElement | null;
      const pill = slot?.querySelector<HTMLElement>(":scope > span.rounded-full") ?? null;

      let pillFacts: PillFacts | null = null;
      if (slot && pill) {
        const pillRect = pill.getBoundingClientRect();
        const slotRect = slot.getBoundingClientRect();
        const inkRange = document.createRange();
        inkRange.selectNodeContents(pill);
        const inkRect = inkRange.getBoundingClientRect();

        const lineTops = new Set<number>();
        const walker = document.createTreeWalker(pill, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const textRange = document.createRange();
          textRange.selectNodeContents(node);
          for (const rect of Array.from(textRange.getClientRects())) {
            if (rect.width > 0 && rect.height > 0) lineTops.add(Math.round(rect.top));
          }
        }

        const style = window.getComputedStyle(pill);
        const clipsContent = style.overflowX !== "visible";
        const contentWiderThanPill = pill.scrollWidth > pill.clientWidth;
        const hasInk = inkRect.width > 0;
        const inkOutsidePill = hasInk && horizontallyOutside(inkRect, pillRect);
        const inkOutsideCard = hasInk && horizontallyOutside(inkRect, cardRect);
        const pillOutsideSlot = horizontallyOutside(pillRect, slotRect);
        const pillOutsideCard = horizontallyOutside(pillRect, cardRect);
        const buttonsRect =
          buttons && buttons !== slot ? buttons.getBoundingClientRect() : null;

        pillFacts = {
          clientHeight: pill.clientHeight,
          clientWidth: pill.clientWidth,
          clipped: contentWiderThanPill && clipsContent,
          contentWiderThanPill,
          inkBox: box(inkRect),
          inkCollidesWithButtons:
            hasInk && buttonsRect ? inkRect.right > buttonsRect.left + EPSILON : false,
          inkOutsideCard,
          inkOutsidePill,
          inkOutsideSlot: hasInk && horizontallyOutside(inkRect, slotRect),
          lineCount: lineTops.size,
          overflows:
            contentWiderThanPill || inkOutsidePill || pillOutsideSlot || pillOutsideCard,
          overflowX: style.overflowX,
          pillBox: box(pillRect),
          pillCollidesWithButtons: buttonsRect
            ? pillRect.right > buttonsRect.left + EPSILON
            : false,
          pillOutsideCard,
          pillOutsideSlot,
          scrollHeight: pill.scrollHeight,
          scrollWidth: pill.scrollWidth,
          slotBox: box(slotRect),
          text: pill.innerText.replace(/\s+/g, " ").trim(),
          textOverflow: style.textOverflow,
          visiblySpills:
            (inkOutsidePill && !clipsContent) || pillOutsideSlot || inkOutsideCard,
          whiteSpace: style.whiteSpace,
        };
      }

      return {
        ...base,
        pill: pillFacts,
        rowBox: box(rowRect),
        rowClientWidth: row.clientWidth,
        rowFound: true,
        rowOverflowX: row.scrollWidth - row.clientWidth,
        rowOverflows: row.scrollWidth > row.clientWidth,
        rowScrollWidth: row.scrollWidth,
      };
    });

    const measured = entries.filter((entry) => entry.rowFound);
    const pills = measured
      .map((entry) => entry.pill)
      .filter((pill): pill is PillFacts => pill !== null);
    const root = document.documentElement;

    return {
      body: {
        clientWidth: document.body.clientWidth,
        overflowX: document.body.scrollWidth - document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
      cards: entries,
      document: {
        clientWidth: root.clientWidth,
        overflowX: root.scrollWidth - root.clientWidth,
        scrollWidth: root.scrollWidth,
      },
      summary: {
        cards: entries.length,
        pills: pills.length,
        pillsClipped: pills.filter((pill) => pill.clipped).length,
        pillsCollidingWithButtons: pills.filter(
          (pill) => pill.pillCollidesWithButtons || pill.inkCollidesWithButtons,
        ).length,
        pillsMultiLine: pills.filter((pill) => pill.lineCount > 1).length,
        pillsOutsideCard: pills.filter((pill) => pill.pillOutsideCard || pill.inkOutsideCard)
          .length,
        pillsOverflowing: pills.filter((pill) => pill.overflows).length,
        pillsVisiblySpilling: pills.filter((pill) => pill.visiblySpills).length,
        rowsMeasured: measured.length,
        rowsOverflowing: measured.filter((entry) => entry.rowOverflows).length,
      },
      url: `${window.location.pathname}${window.location.search}`,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  }, PRODUCT_CARD_SELECTOR);
}
