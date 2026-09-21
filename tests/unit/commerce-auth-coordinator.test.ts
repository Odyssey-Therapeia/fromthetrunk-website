/**
 * The single sign-in coordinator.
 *
 * Every commerce button asks this provider for auth instead of raising its
 * own dialog — which is what let a wishlist click inside the Drape Room stack
 * a second aria-modal over the first and black out the screen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};
// The module reads window.sessionStorage, so window has to exist here.
vi.stubGlobal("window", { sessionStorage: memoryStorage });

const {
  INTENT_MAX_AGE_MS,
  forgetIntent,
  readIntent,
  rememberIntent,
} = await import("@/lib/commerce/auth-intent");

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const intent = {
  id: "intent-1",
  productId: "11111111-1111-4111-8111-111111111111",
  source: "product-card",
  type: "add-to-cart",
} as const;

describe("pending commerce intent", () => {
  beforeEach(() => store.clear());

  it("survives the sign-in round trip", () => {
    rememberIntent(intent, 1_000);
    expect(readIntent(2_000)).toEqual(intent);
  });

  it("expires rather than reserving a saree the shopper moved on from", () => {
    rememberIntent(intent, 1_000);
    expect(readIntent(1_000 + INTENT_MAX_AGE_MS + 1)).toBeNull();
    // And it clears itself out on the way.
    expect(store.size).toBe(0);
  });

  it("caps the wait at ten minutes", () => {
    expect(INTENT_MAX_AGE_MS).toBe(10 * 60 * 1000);
  });

  it("is dropped on cancel", () => {
    rememberIntent(intent, 1_000);
    forgetIntent();
    expect(readIntent(1_000)).toBeNull();
  });

  it("survives unreadable storage without throwing", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    });

    expect(() => rememberIntent(intent, 1_000)).not.toThrow();
    expect(readIntent(1_000)).toBeNull();

    vi.stubGlobal("window", { sessionStorage: memoryStorage });
  });

  it("never holds a credential", () => {
    // Only what was clicked, on which product. Never a name, email, code or
    // login ticket.
    const intentModule = source("lib/commerce/auth-intent.ts");
    for (const forbidden of ["email", "otp", "loginTicket", "ticket", "password"]) {
      expect(intentModule).not.toContain(`${forbidden}:`);
    }
  });

  it("is scoped to this tab, not shared across the browser", () => {
    const intentModule = source("lib/commerce/auth-intent.ts");
    expect(intentModule).toContain("window.sessionStorage");
    expect(intentModule).not.toContain("window.localStorage");
  });
});

describe("the coordinator", () => {
  const provider = source("components/commerce/commerce-auth-provider.tsx");
  const runners = source("components/commerce/commerce-intent-runners.tsx");

  it("replays a pending action exactly once", () => {
    // A double fire would reserve the same one-of-one saree twice.
    expect(provider).toContain("replayed.current.has(intent.id)");
    expect(provider).toContain("replayed.current.add(intent.id)");
  });

  it("queues a click while the session is still resolving", () => {
    expect(provider).toContain("A click during session loading is remembered");
    expect(provider).toContain("rememberIntent(intent, Date.now())");
    expect(provider).toContain(
      'if (status === "unauthenticated") openDialogForIntent(intent)',
    );
  });

  it("runs immediately for a signed-in shopper", () => {
    expect(provider).toContain('if (status === "authenticated")');
  });

  it("replays on the session landing, not on the dialog closing", () => {
    const effect = provider.slice(provider.indexOf("Replay after the session"));
    expect(effect).toContain('if (status !== "authenticated") return;');
  });

  it("does not consume an intent before its runner registers", () => {
    expect(provider).toContain("if (!runner) return false");
    expect(provider).toContain("if (!runIntent(intent)) return;");
    expect(provider).toContain("runnerRevision");
  });

  it("replays a wishlist click as an idempotent save", () => {
    const wishlistRunner = runners.slice(
      runners.indexOf('"wishlist-toggle"'),
      runners.indexOf('"add-to-cart"'),
    );

    expect(wishlistRunner).toContain("await save(intent.productId)");
    expect(wishlistRunner).not.toContain("toggle(");
    expect(runners).not.toContain("useWishlistIds");
  });
});

describe("the dialog", () => {
  const dialog = source("components/commerce/commerce-auth-dialog.tsx");

  it("uses the sign-in code path, never the registration wizard", () => {
    expect(dialog).toContain('purpose: "sign_in"');
    expect(dialog).not.toContain('"sign_up"');
  });

  it("asks for an email and nothing else", () => {
    expect(dialog).toContain("Email address");
    expect(dialog).not.toContain("Full name");
    // Checkout already collects what it needs; asking here would turn
    // "save this saree" into a registration form.
    for (const field of ["phone", "postalCode", "password", "line1"]) {
      expect(dialog.toLowerCase()).not.toContain(field.toLowerCase() + '"');
    }
  });

  it("verifies the code against the existing endpoint", () => {
    expect(dialog).toContain("/api/v2/auth/otp/verify");
    expect(dialog).toContain("challengeToken, otp: code");
  });

  it("collects the code in six boxes that accept a paste", () => {
    // input-otp handles a pasted code, arrow keys and backspace across slots,
    // and one-time-code autofill.
    expect(dialog).toContain("InputOTP");
    expect(dialog).toContain("InputOTPSlot");
    expect(dialog).toContain("maxLength={6}");
  });

  it("waits for the session before handing back", () => {
    // Replaying against a session that has not landed would send the action
    // unauthenticated.
    const verify = dialog.slice(dialog.indexOf("const verifyCode"));
    expect(verify.indexOf("await update()")).toBeLessThan(
      verify.indexOf("auth.onAuthenticated()"),
    );
  });

  it("is the only auth dialog in the commerce tree", () => {
    // The provider mounts exactly one; buttons must never raise their own.
    const providers = source("components/providers.tsx");
    expect(providers).toContain("<CommerceAuthDialog />");
    expect(providers).toContain("<CommerceAuthProvider>");
  });
});
