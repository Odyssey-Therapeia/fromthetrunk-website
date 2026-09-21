"use client";

import Link from "next/link";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CommerceCountBadge } from "@/components/layout/commerce-count-badge";
import { useWishlistIds } from "@/lib/wishlist/use-wishlist";

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

function HeaderWishlistControl() {
  // The global provider gives every surface this same account-keyed query.
  // Signed-out shoppers have no browser-owned list and therefore count zero.
  const { ids: wishlistIds } = useWishlistIds();
  const wishlistCount = new Set(wishlistIds).size;
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
 * Mounted inside the server header's icon row. The site layout owns the one
 * CommerceProviders tree, so this island shares its session and QueryClient
 * with cards, PDP, checkout and the Drape Room.
 */
export function SiteHeaderCommerceControls() {
  return <SiteHeaderCommerceControlsInner />;
}
