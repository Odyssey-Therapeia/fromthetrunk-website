/**
 * Meta Pixel (browser) configuration and runtime helpers.
 *
 * The Pixel is loaded through a hand-rolled, consent-gated loader
 * (`components/analytics/meta-pixel-loader.tsx`) — NOT Meta's standard inline
 * snippet. It only loads when:
 *   1. `NEXT_PUBLIC_META_PIXEL_ID` is configured, and
 *   2. the visitor has accepted analytics consent (see `lib/analytics/consent.ts`).
 *
 * Why not the copy-paste snippet: it is an inline <script> that also injects
 * its own <script> tag and fires PageView immediately. Here the queue stub is
 * bootstrapped from ordinary JS (no `'unsafe-inline'` dependency), fbevents.js
 * is loaded by `next/script`, and PageView is owned exclusively by
 * `components/analytics/meta-pixel-page-view.tsx` so a client-side route change
 * is counted exactly once — the same split GTM already uses here.
 *
 * SCOPE: PageView only. Conversions (InitiateCheckout, Purchase) stay
 * server-side in `lib/adapters/meta-capi-sink.ts`. Do not add a browser
 * Purchase without also sharing that event's `event_id` with the server, or
 * Meta will count the sale twice.
 */

/** Meta's pixel library. `next/script` loads this; we never inject it by hand. */
export const META_PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * Meta's queue stub, plus the two private markers this module needs:
 *
 * - `fttOwned` distinguishes the stub we created from one a Google Tag Manager
 *   container tag (or any other installer) put on the page first.
 * - `fttInitialisedId` is the pixel id we have already run `init` for, so a
 *   re-mount re-grants consent instead of initialising a second time.
 */
export interface FbqFunction {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  fttInitialisedId?: string;
  fttOwned?: boolean;
  getState?: () => unknown;
  loaded?: boolean;
  push?: unknown;
  queue?: unknown[][];
  version?: string;
}

export interface MetaPixelWindow {
  _fbq?: FbqFunction;
  fbq?: FbqFunction;
}

/** Who installed the `fbq` currently on the page, if anyone. */
export type PixelOwnership = "foreign" | "none" | "ours";

export type MetaPixelInstall =
  | { status: "already-installed" }
  | { status: "installed" }
  | { pixelIds: string[]; status: "skipped-foreign" };

/** True when a Meta Pixel id is configured (non-empty). */
export function shouldRenderMetaPixel(pixelId: string | undefined): boolean {
  return Boolean(pixelId && pixelId.trim().length > 0);
}

/**
 * The configured Meta Pixel id, or undefined when the Pixel is disabled.
 *
 * `NEXT_PUBLIC_META_PIXEL_ID` is inlined at build time by Next.js, so this
 * reads correctly on both server and client.
 */
export function getMetaPixelId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return shouldRenderMetaPixel(id) ? id!.trim() : undefined;
}

/**
 * Whether a Meta Pixel is already present, and whether we put it there.
 *
 * A "foreign" pixel is almost always a Meta Pixel tag inside the Google Tag
 * Manager container that `GtmLoader` also loads. Installing a second pixel
 * alongside it would double every PageView, so the loader stands down.
 */
export function detectExistingPixel(win: MetaPixelWindow): PixelOwnership {
  const fbq = win.fbq;
  if (typeof fbq !== "function") return "none";
  return fbq.fttOwned === true ? "ours" : "foreign";
}

/**
 * Pixel ids already registered on the page, for diagnostics when we stand down.
 *
 * `fbq.getState()` is not part of Meta's documented API, so every access is
 * defensive: a missing or reshaped state reports nothing rather than throwing
 * inside an effect.
 */
export function installedPixelIds(win: MetaPixelWindow): string[] {
  try {
    const state = win.fbq?.getState?.() as { pixels?: unknown } | undefined;
    const pixels = state?.pixels;
    if (!Array.isArray(pixels)) return [];
    return pixels
      .map((pixel) => (pixel as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Create Meta's queue stub, so calls made before fbevents.js arrives are
 * replayed once it loads. This is the snippet's `!function(f,b,e,v,n,t,s)`
 * body minus the DOM injection, which `next/script` performs instead.
 */
export function bootstrapFbq(win: MetaPixelWindow): FbqFunction {
  const existing = win.fbq;
  if (typeof existing === "function") return existing;

  const fbq = function (...args: unknown[]): void {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, args);
      return;
    }
    fbq.queue?.push(args);
  } as FbqFunction;

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  fbq.fttOwned = true;

  win.fbq = fbq;
  win._fbq = win._fbq ?? fbq;
  return fbq;
}

/**
 * Bootstrap and initialise the Pixel for a consenting visitor.
 *
 * Meta requires `consent`/`revoke` to be issued BEFORE `init`, so the sequence
 * is revoke → init → grant even though this only ever runs once consent has
 * been granted. That ordering means no event can escape between the pixel
 * being created and consent being applied.
 *
 * Deliberately does NOT fire PageView: `MetaPixelPageView` owns every PageView,
 * including the first, which is what keeps the count at exactly one per URL.
 */
export function initMetaPixel(
  win: MetaPixelWindow,
  pixelId: string,
): MetaPixelInstall {
  if (detectExistingPixel(win) === "foreign") {
    return { pixelIds: installedPixelIds(win), status: "skipped-foreign" };
  }

  const fbq = bootstrapFbq(win);

  if (fbq.fttInitialisedId === pixelId) {
    // Consent was withdrawn and granted again within the same page. The pixel
    // is still in memory, so re-granting is the whole job; initialising twice
    // would register the id a second time.
    fbq("consent", "grant");
    return { status: "already-installed" };
  }

  fbq("consent", "revoke");
  fbq("init", pixelId);
  fbq("consent", "grant");
  fbq.fttInitialisedId = pixelId;

  return { status: "installed" };
}

/**
 * Fire one PageView, but only into a pixel this module initialised.
 *
 * Returns false when there is nothing to track — no pixel yet, or a foreign
 * one that is already reporting its own PageViews. The caller uses that answer
 * to decide whether the URL has actually been counted.
 */
export function trackMetaPageView(win: MetaPixelWindow): boolean {
  const fbq = win.fbq;
  if (typeof fbq !== "function" || fbq.fttInitialisedId == null) return false;
  fbq("track", "PageView");
  return true;
}

/**
 * Stop the Pixel sending data after consent is withdrawn.
 *
 * Unmounting the loader does not unload fbevents.js — the library stays in
 * memory for the life of the document — so withdrawal has to be explicit.
 */
export function revokeMetaPixelConsent(win: MetaPixelWindow): boolean {
  const fbq = win.fbq;
  if (typeof fbq !== "function" || fbq.fttInitialisedId == null) return false;
  fbq("consent", "revoke");
  return true;
}
