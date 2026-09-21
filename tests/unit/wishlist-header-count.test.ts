// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  WISHLIST_UPDATED_EVENT,
  dispatchWishlistUpdated,
  subscribeToWishlistUpdated,
} from "@/lib/wishlist/wishlist-events";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const island = read("components/layout/site-header-commerce-controls.tsx");
const serverHeader = read("components/layout/site-header-server.tsx");
const wishlistButton = read("components/product/wishlist-button.tsx");
const wishlistHook = read("lib/wishlist/use-wishlist.ts");
const providers = read("components/providers.tsx");

describe("wishlist cross-provider event", () => {
  it("delivers add, remove, and merge notifications to subscribers", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToWishlistUpdated(handler);

    dispatchWishlistUpdated({ reason: "add", productId: "p1" });
    dispatchWishlistUpdated({ reason: "remove", productId: "p1" });
    dispatchWishlistUpdated({ reason: "merge" });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0]?.[0]).toEqual({ reason: "add", productId: "p1" });
    expect(handler.mock.calls[2]?.[0]).toEqual({ reason: "merge" });

    unsubscribe();
    dispatchWishlistUpdated({ reason: "add" });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("uses the agreed event name", () => {
    expect(WISHLIST_UPDATED_EVENT).toBe("ftt:wishlist-updated");
  });

  it("is dispatched after every wishlist mutation", () => {
    // Mutations moved into the shared account hook.
    expect(wishlistHook).toContain("dispatchWishlistUpdated");
    expect(wishlistHook).toContain('reason: isSaved ? "remove" : "add"');
  });

  it("needs no header bridge because every surface shares one QueryClient", () => {
    expect(island).not.toContain("subscribeToWishlistUpdated");
    expect(island).toContain("useWishlistIds");
    expect(island).not.toContain("refetchInterval");
    expect(island).not.toContain("setInterval");
  });
});

describe("header wishlist count", () => {
  it("reads the shared account endpoint, not a duplicated implementation", () => {
    expect(island).toContain("useWishlistIds");
    expect(island).not.toContain('fetch("/api/v2/wishlist"');
    expect(wishlistHook).toContain('fetch("/api/v2/wishlist"');
    expect(island).not.toContain("method: \"POST\"");
    expect(island).not.toContain("method: \"DELETE\"");
  });

  it("deduplicates product ids before counting", () => {
    expect(island).toContain("new Set(wishlistIds).size");

    const ids = ["a", "a", "b"];
    expect(new Set(ids).size).toBe(2);
  });

  it("counts only the authenticated account's trunk", () => {
    expect(wishlistButton).not.toContain("setAuthOpen");
    expect(island).not.toContain("useGuestWishlistStore");
    expect(providers).not.toContain("WishlistMergeOnLogin");
  });

  it("skips the request entirely for signed-out visitors", () => {
    expect(wishlistHook).toContain("enabled: isAuthenticated");
  });

  it("keys by account and removes the previous account cache", () => {
    expect(wishlistHook).toContain(
      '["wishlist", "ids", userId ?? "anonymous"]',
    );
    expect(wishlistHook).toContain("queryClient.cancelQueries");
    expect(wishlistHook).toContain("queryClient.removeQueries");
  });

  it("keeps cached ids visible on a transient server failure", () => {
    expect(wishlistHook).toContain("throw new Error");
    expect(wishlistHook).not.toContain("if (!response.ok) return []");
  });

  it("hides the badge at zero and labels the control either way", () => {
    expect(island).toContain("<CommerceCountBadge count={wishlistCount} />");
    expect(island).toContain('"Wishlist, empty"');
    expect(island).toContain("aria-label={wishlistLabel}");
  });

  it("shows the wishlist control on standard mobile widths with a compact fallback below 375px", () => {
    expect(island).toContain("hidden min-[375px]:grid");
    expect(island).toContain("data-ftt-wishlist-target");
    expect(island).not.toContain("hidden sm:grid");
  });

  // The badge is only honestly "supported on mobile" while the icon that carries
  // it is actually rendered. The header icon appears from 375px up; the
  // mobile-menu "Liked products" row is the fallback below that. The two gates
  // must be exact complements — they drifted once (icon `min-[375px]`, link
  // `sm:hidden`), which showed both entry points across 375-639px.
  it("mirrors the icon gate with the mobile-menu fallback so exactly one entry point shows", () => {
    const likedProductsLink = serverHeader
      .split("\n")
      .find((line) => line.includes(">Liked products<"));

    expect(likedProductsLink).toBeDefined();
    expect(likedProductsLink).toContain('href="/account/wishlist"');
    expect(likedProductsLink).toContain("min-[375px]:hidden");
    // `sm:hidden` (640px) would duplicate the icon across 375-639px.
    expect(likedProductsLink).not.toContain("sm:hidden");
  });

  it("announces changes through a restrained live region", () => {
    expect(island).toContain('aria-live="polite"');
    expect(island).toContain('aria-atomic="true"');
    expect(island).toContain('className="sr-only"');
  });
});
