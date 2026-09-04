"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CommerceCountBadge } from "@/components/layout/commerce-count-badge";
import { CommerceProviders } from "@/components/providers";
import { subscribeToWishlistUpdated } from "@/lib/wishlist/wishlist-events";

/**
 * The header's commerce island.
 *
 * The active header (components/layout/site-header-server.tsx) stays a server
 * component: it keeps the logo, navigation, search, account link, mobile menu,
 * announcement bar, and the Drape Room photo menu. This island owns only the
 * two controls that need live client state — the wishlist icon with its count
 * and the cart icon, which is the existing CartDrawer's Sheet trigger.
 *
 * Deliberately NOT here: a second drawer, a second cart store, a second copy of
 * the wishlist API. It reuses components/cart/cart-drawer.tsx and the shared
 * /api/v2/wishlist endpoint.
 */

const HEADER_ICON_CLASS =
  "relative grid size-11 place-items-center rounded-full text-[#601D1C] transition hover:bg-[#601D1C]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]";

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      aria-hidden="true"
    >
      <path d="M19.5 5.8c-1.8-1.8-4.7-1.6-6.4.4L12 7.5l-1.1-1.3c-1.7-2-4.6-2.2-6.4-.4-1.9 1.9-1.9 5 0 6.9L12 20l7.5-7.3c1.9-1.9 1.9-5 0-6.9Z" />
    </svg>
  );
}

/** Account-scoped wishlist ids. Returns [] for guests — /api/v2/wishlist 401s. */
const fetchWishlistIds = async (): Promise<string[]> => {
  const response = await fetch("/api/v2/wishlist", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as unknown;
  return Array.isArray(payload)
    ? payload.filter((id): id is string => typeof id === "string")
    : [];
};

function HeaderWishlistControl() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const isAuthenticated = Boolean(session?.user?.id);

  // Same policy as components/product/wishlist-button.tsx: the wishlist is
  // account-backed only. Guests are prompted to sign in before saving, so the
  // header must never surface a guest-store count the account does not have.
  // `enabled` keeps anonymous page loads from firing a pointless 401.
  const { data: wishlistIds, refetch } = useQuery({
    queryKey: ["wishlist", "ids"],
    queryFn: fetchWishlistIds,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // Product buttons and the Drape Room mutate under their own QueryClient, so
  // their invalidation never reaches this tree — the shared browser event does.
  // refetch() runs even while the query is disabled, which covers the sign-in
  // dialog case where this provider's session has not caught up yet; the
  // endpoint 401s for guests and fetchWishlistIds turns that into [].
  const handleWishlistUpdated = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(
    () => subscribeToWishlistUpdated(handleWishlistUpdated),
    [handleWishlistUpdated],
  );

  // Drop the cached count on sign-out so a previous account's total never
  // lingers in the header.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    queryClient.setQueryData(["wishlist", "ids"], []);
  }, [queryClient, status]);

  // Deduplicated: the endpoint is the sole authority for this number.
  const wishlistCount = new Set(wishlistIds ?? []).size;
  const wishlistLabel =
    wishlistCount > 0
      ? `Wishlist, ${wishlistCount} saved ${wishlistCount === 1 ? "piece" : "pieces"}`
      : "Wishlist, empty";

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {wishlistCount > 0 ? wishlistLabel : ""}
      </div>
      <Link
        href="/account/wishlist"
        prefetch={false}
        // The complete 44px control fits beside the optional Drape photo,
        // account, cart, and menu from 375px upward. Narrower headers retain
        // the existing "Liked products" mobile-menu link as the compact path.
        className={`${HEADER_ICON_CLASS} hidden min-[375px]:grid`}
        aria-label={wishlistLabel}
        data-ftt-wishlist-target
      >
        <HeartIcon />
        <CommerceCountBadge count={wishlistCount} />
      </Link>
    </>
  );
}

function SiteHeaderCommerceControlsInner() {
  return (
    <>
      <HeaderWishlistControl />
      {/* The existing right-side Sheet. Its trigger IS the header cart icon and
          already carries data-ftt-cart-target / data-ftt-cart-count. */}
      <CartDrawer triggerClassName={HEADER_ICON_CLASS} />
    </>
  );
}

/**
 * Mounted inside the server header's icon row. CommerceProviders is the
 * smallest wrapper that satisfies the wishlist's session + query needs; the
 * cart drawer needs neither and reads the persisted Zustand store directly.
 * The guest-wishlist merge worker stays out — it belongs to route-level
 * Providers and must not run twice.
 */
export function SiteHeaderCommerceControls() {
  return (
    <CommerceProviders>
      <SiteHeaderCommerceControlsInner />
    </CommerceProviders>
  );
}
