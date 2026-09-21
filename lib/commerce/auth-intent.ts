/**
 * The commerce action a shopper asked for before they were signed in.
 *
 * Held across the sign-in popup — and across a navigation, since sign-in can
 * bounce the router — so the shopper never has to click "Add to bag" twice.
 *
 * Deliberately never holds a name, email, one-time code or login ticket. Only
 * what was clicked and on which product, all of which the page already shows.
 */

export type PendingCommerceIntent =
  | {
      id: string;
      type: "add-to-cart";
      productId: string;
      selectedOptions?: Record<string, unknown>;
      source: string;
    }
  | {
      id: string;
      type: "wishlist-toggle";
      productId: string;
      source: string;
    }
  | {
      id: string;
      type: "notify-me";
      productId: string;
      source: string;
    };

type StoredIntent = {
  intent: PendingCommerceIntent;
  storedAt: number;
};

const STORAGE_KEY = "ftt-commerce-intent-v1";

/**
 * An intent older than this is stale: the shopper has moved on, and silently
 * reserving a saree they no longer want would be worse than asking again.
 */
export const INTENT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * sessionStorage, not localStorage: the intent belongs to this tab and this
 * visit. A second tab must not replay a click made in the first.
 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private modes and hardened settings throw on access.
    return null;
  }
}

export function rememberIntent(intent: PendingCommerceIntent, now: number): void {
  try {
    store()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ intent, storedAt: now } satisfies StoredIntent),
    );
  } catch {
    // Non-fatal: the in-memory copy still drives this tab's own replay.
  }
}

export function readIntent(now: number): PendingCommerceIntent | null {
  try {
    const raw = store()?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredIntent>;
    if (!parsed?.intent || typeof parsed.storedAt !== "number") return null;
    if (now - parsed.storedAt > INTENT_MAX_AGE_MS) {
      forgetIntent();
      return null;
    }

    return parsed.intent;
  } catch {
    return null;
  }
}

export function forgetIntent(): void {
  try {
    store()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
