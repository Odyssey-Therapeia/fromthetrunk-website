import type { Page } from "@playwright/test";

/**
 * Write-safe, overlay-free browser setup for the functional e2e specs.
 *
 * The first-visit keys mirror the ones the visual harness verified against
 * the source (tests/e2e/support/visual-fixtures.ts). That harness is a
 * separate suite with its own fixture, so it is deliberately not imported.
 */

export const FIRST_VISIT_LOCAL_STORAGE: Readonly<Record<string, string>> = {
  // components/widgets/welcome-popup.tsx returns early while this is set.
  "ftt-welcome-seen-v1": "1",
};

export const FIRST_VISIT_SESSION_STORAGE: Readonly<Record<string, string>> = {
  "ftt-home-intro-seen": "true",
  "ftt:drape-room:teaser-shown:v1": "1",
  "ftt-wa-bubble-dismissed": "1",
  "ftt-reel-dismissed": "1",
};

export const FIRST_VISIT_COOKIES: Readonly<Record<string, string>> = {
  // "denied" keeps the consent banner away and every analytics write unsent.
  ftt_analytics_consent: "denied",
  // lib/drape-room/launch/config.ts coachmarkCookie.
  ftt_drape_guide_v1: "true",
};

/**
 * Keep the welcome popup, Drape Room coach mark and teaser, analytics banner
 * and floating widgets from covering the controls a spec clicks. Pass the
 * baseURL so the cookies also reach the very first server render.
 */
export async function suppressFirstVisitOverlays(
  page: Page,
  baseURL?: string,
): Promise<void> {
  if (baseURL) {
    const origin = new URL(baseURL).origin;
    await page.context().addCookies(
      Object.entries(FIRST_VISIT_COOKIES).map(([name, value]) => ({
        name,
        sameSite: "Lax" as const,
        url: origin,
        value,
      })),
    );
  }

  await page.addInitScript(
    (state) => {
      try {
        for (const [key, value] of Object.entries(state.local)) {
          window.localStorage.setItem(key, value);
        }
      } catch {
        // Opaque origins (about:blank) have no storage.
      }
      try {
        for (const [key, value] of Object.entries(state.session)) {
          window.sessionStorage.setItem(key, value);
        }
      } catch {
        // Opaque origins (about:blank) have no storage.
      }
      try {
        for (const [name, value] of Object.entries(state.cookies)) {
          document.cookie = `${name}=${value}; path=/; max-age=3600; SameSite=Lax`;
        }
      } catch {
        // Opaque origins (about:blank) refuse cookies.
      }
    },
    {
      cookies: FIRST_VISIT_COOKIES,
      local: FIRST_VISIT_LOCAL_STORAGE,
      session: FIRST_VISIT_SESSION_STORAGE,
    },
  );
}

export type BlockedWrite = { method: string; path: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Telemetry, never commerce: answered 204 so no page ever waits on it. */
const TELEMETRY_WRITE_PATHS = [
  /^\/api\/v2\/events(?:\/|$)/,
  /^\/api\/auth\/_log$/,
  /^\/api\/v2\/security\/csp-report$/,
];

/**
 * The last line of defence against a database write.
 *
 * Register it BEFORE any specific stub: Playwright runs the most recently
 * registered matching handler first, so every stub a spec adds afterwards
 * answers its own endpoint and only an unstubbed write reaches this guard.
 * That write is aborted and recorded; specs assert the returned list stays
 * empty, so a new mutating call fails loudly instead of touching the database.
 */
export async function installWriteGuard(page: Page): Promise<BlockedWrite[]> {
  const blocked: BlockedWrite[] = [];

  await page.addInitScript(() => {
    // A beacon cannot be intercepted reliably. Refusing same-origin API
    // beacons makes callers fall back to fetch, which the guard can see.
    try {
      const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);
      if (!nativeSendBeacon) return;
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
    } catch {
      // A locked-down navigator keeps its native beacon.
    }
  });

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (SAFE_METHODS.has(method)) {
        await route.fallback();
        return;
      }

      const url = new URL(request.url());
      if (TELEMETRY_WRITE_PATHS.some((pattern) => pattern.test(url.pathname))) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      blocked.push({ method, path: `${url.pathname}${url.search}` });
      await route.abort("blockedbyclient");
    },
  );

  return blocked;
}

/**
 * Answer POST /api/v2/products/viewer-state with "available" for every id.
 *
 * The real route also sweeps lapsed holds, which is a write. Read-only specs
 * that only need a buyable purchase control (layout and screenshot checks)
 * use this instead of the full commerce stub.
 */
export async function stubAvailableViewerState(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/v2/products/viewer-state",
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }

      let productIds: string[] = [];
      try {
        const body = request.postDataJSON() as { productIds?: unknown } | null;
        if (Array.isArray(body?.productIds)) {
          productIds = body.productIds.filter(
            (id): id is string => typeof id === "string",
          );
        }
      } catch {
        productIds = [];
      }

      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          products: Object.fromEntries(
            productIds.map((id) => [id, { reservedUntil: null, state: "available" }]),
          ),
        }),
      });
    },
  );
}

/** Overlays off, writes guarded, verdicts answered: a read-only storefront. */
export async function prepareReadOnlyStorefront(
  page: Page,
  baseURL?: string,
): Promise<BlockedWrite[]> {
  await suppressFirstVisitOverlays(page, baseURL);
  const blocked = await installWriteGuard(page);
  await stubAvailableViewerState(page);
  return blocked;
}
