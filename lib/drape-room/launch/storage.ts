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
