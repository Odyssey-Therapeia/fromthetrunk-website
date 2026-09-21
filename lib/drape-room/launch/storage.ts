/**
 * SSR-safe session memory for the Drape Room teaser.
 *
 * The auto-open is once per browser tab. Every read is guarded so a server
 * render, a privacy mode that throws on sessionStorage, or a disabled-storage
 * browser degrades to "not shown yet" rather than crashing. Nothing here may be
 * called during render — only from effects and handlers — so hydration output
 * never depends on storage.
 */
import { drapeLaunchConfig } from "./config";

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Safari private mode and hardened privacy settings throw on access.
    return null;
  }
}

export function hasSeenDrapeTeaser(): boolean {
  const store = session();
  if (!store) return false;
  try {
    return store.getItem(drapeLaunchConfig.sessionKey) === "1";
  } catch {
    return false;
  }
}

/**
 * Marked the moment the teaser auto-opens, not when it is dismissed, so moving
 * to another product in the same tab cannot trigger a second automatic open.
 */
export function markDrapeTeaserSeen(): void {
  const store = session();
  if (!store) return;
  try {
    store.setItem(drapeLaunchConfig.sessionKey, "1");
  } catch {
    // A full or unavailable quota only costs us the once-per-session guard.
  }
}

/**
 * Undoes `markDrapeTeaserSeen`.
 *
 * Used when the teaser is suspended by another overlay moments after opening:
 * the shopper never actually read it, so burning the once-per-tab budget would
 * silently lose the campaign.
 */
export function clearDrapeTeaserSeen(): void {
  const store = session();
  if (!store) return;
  try {
    store.removeItem(drapeLaunchConfig.sessionKey);
  } catch {
    // Nothing to do: the guard simply stays set for this tab.
  }
}

/*
 * The coach mark's memory is a cookie, not storage.
 *
 * Three states, deliberately:
 *   absent   — never taught, so show it
 *   "true"   — taught and done, never show it again
 *   "false"  — an explicit reset, so show it again
 *
 * Only `absent` and `"false"` show the lesson, which makes clearing it a
 * one-line edit in devtools rather than a storage inspector hunt, and leaves
 * the flag readable by the server should a future variant need it.
 */
const TAUGHT = "true";
const SHOW_AGAIN = "false";

/** One year: long enough that a returning shopper is not taught twice. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): null | string {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      return decodeURIComponent(entry.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function hasSeenDrapeCardCoachmark(): boolean {
  // Server render: claim seen so nothing can depend on the flag in SSR output.
  if (typeof document === "undefined") return true;
  return readCookie(drapeLaunchConfig.coachmarkCookie) === TAUGHT;
}

export function markDrapeCardCoachmarkSeen(): void {
  writeCookie(drapeLaunchConfig.coachmarkCookie, TAUGHT);
}

/** Writes the explicit "show again" state rather than deleting the cookie. */
export function clearDrapeCardCoachmarkSeen(): void {
  writeCookie(drapeLaunchConfig.coachmarkCookie, SHOW_AGAIN);
}
