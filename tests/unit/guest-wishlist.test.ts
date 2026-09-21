/**
 * Guest wishlist behaviour, and the modal it must never open.
 *
 * The Drape Room black screen came from this button raising a second Radix
 * dialog inside the room's own dialog. The structural guarantee — no dialog in
 * the wishlist button at all — is asserted here alongside the guest storage
 * behaviour that removed the need for one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

const { useGuestWishlistStore } = await import("@/lib/store/wishlist-store");

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/*
 * The guest store is retained for a one-time import of trunks saved before
 * commerce became authenticated-first. Nothing writes new entries to it.
 */
describe("legacy guest wishlist store", () => {
  beforeEach(() => {
    useGuestWishlistStore.setState({ productIds: [] });
  });

  it("saves and unsaves without an account", () => {
    const { toggle } = useGuestWishlistStore.getState();

    toggle("saree-1");
    expect(useGuestWishlistStore.getState().has("saree-1")).toBe(true);

    toggle("saree-1");
    expect(useGuestWishlistStore.getState().has("saree-1")).toBe(false);
  });

  it("is idempotent, so a double tap cannot duplicate a piece", () => {
    const { addItem } = useGuestWishlistStore.getState();

    addItem("saree-1");
    addItem("saree-1");

    expect(useGuestWishlistStore.getState().productIds).toEqual(["saree-1"]);
  });

  it("clears after a merge so nothing is merged twice", () => {
    useGuestWishlistStore.setState({ productIds: ["a", "b"] });

    useGuestWishlistStore.getState().clear();

    expect(useGuestWishlistStore.getState().productIds).toEqual([]);
  });
});

describe("wishlist button", () => {
  const button = source("components/product/wishlist-button.tsx");

  it("opens no dialog of its own", () => {
    // A dialog here mounts inside the Drape Room's dialog: two aria-modal
    // surfaces, the room left inert, and a black screen for the shopper.
    expect(button).not.toContain("Dialog");
    expect(button).not.toContain("OtpAuthPanel");
  });

  it("sends a signed-out shopper through the shared popup, not its own", () => {
    // Commerce is authenticated-first now: the heart still responds to a
    // signed-out click, but the sign-in belongs to CommerceAuthProvider.
    expect(button).toContain("useCommerceAuth");
    expect(button).toContain('type: "wishlist-toggle"');
    expect(button).toContain("useWishlistMembership");
    expect(button).toContain("useWishlistActions");
  });
});

describe("active wishlist surfaces read the account source", () => {
  it("counts the account's trunk in the header", () => {
    const header = source(
      "components/layout/site-header-commerce-controls.tsx",
    );
    const hook = source("lib/wishlist/use-wishlist.ts");

    expect(header).toContain("useWishlistIds");
    expect(header).not.toContain("useGuestWishlistStore");
    expect(hook).toContain("queryKey: wishlistIdsKey(userId)");
  });

  it("shows a signed-out visitor the account sign-in path", () => {
    const page = source("app/(site)/account/wishlist/page.tsx");

    expect(page).toContain("useWishlistIds");
    expect(page).toContain("Please sign in to view your wishlist.");
  });

  it("does not mount a guest merge worker", () => {
    const providers = source("components/providers.tsx");
    expect(providers).not.toContain("WishlistMergeOnLogin");
  });
});

describe("browser-owned commerce workers are retired", () => {
  it("uses tab sync only as an invalidation bell, never an ownership source", () => {
    const providers = source("components/providers.tsx");
    const tabSync = source("components/cart/cart-tab-sync.tsx");
    const expirySweeper = source("components/cart/cart-expiry-sweeper.tsx");

    expect(providers).toContain("<CartTabSync />");
    expect(providers).toContain("<CartExpirySweeper />");
    expect(tabSync).toContain("CART_TAB_SYNC_KEY");
    expect(tabSync).toContain("void refresh()");
    expect(tabSync).not.toContain("ftt-cart-v2");
    expect(tabSync).not.toContain("replaceItems");
    expect(expirySweeper).toContain("void refresh()");
    expect(expirySweeper).not.toContain("removePresentationItem");
  });
});
