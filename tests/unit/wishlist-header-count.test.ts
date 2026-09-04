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
const mergeWorker = read("components/wishlist/wishlist-merge-on-login.tsx");

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
    expect(wishlistButton).toContain('dispatchWishlistUpdated({ reason: "add"');
    expect(wishlistButton).toContain('dispatchWishlistUpdated({ reason: "remove"');
    expect(mergeWorker).toContain('dispatchWishlistUpdated({ reason: "merge" })');
  });

  it("is the only cross-provider channel — no polling in the header", () => {
    expect(island).toContain("subscribeToWishlistUpdated");
    expect(island).not.toContain("refetchInterval");
    expect(island).not.toContain("setInterval");
  });
});

describe("header wishlist count", () => {
  it("reads the shared account endpoint, not a duplicated implementation", () => {
    expect(island).toContain('fetch("/api/v2/wishlist"');
    // One fetch definition only; mutations stay in the product button.
    // \b excludes refetch(); exactly one real network call lives here.
    expect(island.match(/\bfetch\(/g)).toHaveLength(1);
    expect(island).not.toContain("method: \"POST\"");
    expect(island).not.toContain("method: \"DELETE\"");
  });

  it("deduplicates product ids before counting", () => {
    expect(island).toContain("new Set(wishlistIds ?? []).size");

    const ids = ["a", "a", "b"];
    expect(new Set(ids).size).toBe(2);
  });

  it("matches the account-only wishlist policy of the product button", () => {
    // The button sends guests to an auth dialog and never writes a guest list,
    // so the header must not read the guest store either.
    expect(wishlistButton).toContain("setAuthOpen(true)");
    expect(island).not.toContain("useGuestWishlistStore");
    expect(island).not.toContain("wishlist-store");
  });

  it("skips the request entirely for signed-out visitors", () => {
    expect(island).toContain("enabled: isAuthenticated");
    // A 401 still degrades to an empty list rather than throwing.
    expect(island).toContain("if (!response.ok) return [];");
  });

  it("clears the cached count on sign-out", () => {
    expect(island).toContain('if (status !== "unauthenticated") return;');
    expect(island).toContain('queryClient.setQueryData(["wishlist", "ids"], [])');
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
