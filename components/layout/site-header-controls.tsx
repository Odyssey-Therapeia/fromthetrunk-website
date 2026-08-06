"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { ConnectDialog } from "@/components/layout/connect-dialog";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useGuestWishlistStore } from "@/lib/store/wishlist-store";

const NAV_ITEMS = [
  { href: "/collection", label: "Collection", strong: true },
  { href: "/top-viewed", label: "Top Viewed" },
  { href: "/blouses", label: "Blouses" },
  { href: "/#connect", label: "Connect With Us" },
  { href: "/our-team", label: "About Us" },
  { href: "/faqs", label: "FAQ & Policies" },
] as const;

const SHOP_BY_ITEMS = [
  { href: "/collection#filter-type", label: "Category" },
  { href: "/collection#filter-fabric", label: "Fabric" },
  { href: "/collection#filter-color", label: "Colour" },
  { href: "/collection#filter-price", label: "Price Range" },
  { href: "/collection#filter-availability", label: "Availability" },
  { href: "/collection#filter-occasion", label: "Occasion" },
] as const;

const ABOUT_ITEMS = [
  { href: "/our-team", label: "Our Team" },
  { href: "/our-story", label: "Our Story" },
] as const;

const MORE_ITEMS = [
  { href: "/sell-your-saree", label: "Sell Your Saree" },
  { href: "/why", label: "Why Sell It" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/faqs", label: "FAQ & Policies" },
] as const;

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c1.1-3.6 3.3-5.4 6.5-5.4s5.4 1.8 6.5 5.4" />
    </svg>
  );
}

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

function SiteHeaderControlsInner() {
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  // Keep the global header independent from session/query providers. Account
  // and server-backed wishlist state resolve inside their dedicated routes;
  // the header can still show the already-local guest count at zero network cost.
  const guestWishlistCount = useGuestWishlistStore((s) => s.productIds.length);
  const guestWishlistHydrated = useGuestWishlistStore((s) => s.hasHydrated);
  const wishlistCount = guestWishlistHydrated ? guestWishlistCount : 0;
  const showWishlistCount = hasMounted && wishlistCount > 0;

  return (
    <>
      <div className="ml-auto flex h-full shrink-0 items-center justify-end gap-1.5 text-[#601D1C]">
        <SearchBar />

        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative size-11 rounded-full hover:bg-[#601D1C]/8 hover:text-[#601D1C]"
        >
          <Link
            href="/account"
            prefetch={false}
            aria-label="Your account"
          >
            <AccountIcon />
          </Link>
        </Button>

        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative size-11 rounded-full hover:bg-[#601D1C]/8 hover:text-[#601D1C]"
        >
          <Link
            href="/account/wishlist"
            prefetch={false}
            aria-label={
              showWishlistCount
                ? `Liked products, ${wishlistCount} saved`
                : "Liked products"
            }
          >
            <HeartIcon />
            {showWishlistCount ? (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-[#B39152]/70 bg-[#141D46] px-1 text-[10px] font-medium text-[#FDF7F1]"
                aria-hidden="true"
              >
                {wishlistCount}
              </span>
            ) : null}
          </Link>
        </Button>

        {hasMounted ? (
          <>
            <CartDrawer />

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 xl:hidden"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent className="z-[80] flex h-dvh w-[min(84vw,28rem)] flex-col overflow-hidden bg-[#FDF7F1] p-0 sm:max-w-md">
                <SheetTitle className="sr-only">Mobile navigation</SheetTitle>
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 pb-28 pt-14">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (mobileSearch.trim().length >= 2) {
                        router.push(
                          `/search?q=${encodeURIComponent(mobileSearch.trim())}`,
                        );
                        setMobileSearch("");
                        setMobileMenuOpen(false);
                      }
                    }}
                    className="relative"
                  >
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#601D1C]/50">
                      <SearchIcon />
                    </span>
                    <Input
                      value={mobileSearch}
                      onChange={(event) => setMobileSearch(event.target.value)}
                      placeholder="Search sarees..."
                      className="border-[#601D1C]/15 bg-[#FDF7F1] pl-9"
                      aria-label="Search products"
                    />
                  </form>

                  <div className="grid gap-5">
                    {/* Collection, Top Viewed, Blouses — the primary catalog links. */}
                    {NAV_ITEMS.slice(0, 3).map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`text-lg text-[#601D1C] ${"strong" in link && link.strong ? "font-bold" : "font-medium"}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  {/* Shop By — temporarily hidden.
                  <div className="grid gap-3 border-y border-[#601D1C]/10 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                      Shop By
                    </p>
                    {SHOP_BY_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-[#601D1C]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  */}
                  <div className="grid gap-3 border-y border-[#601D1C]/10 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                      About Us
                    </p>
                    {ABOUT_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-[#601D1C]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setConnectOpen(true);
                    }}
                    className="block w-full text-left text-lg font-medium text-[#601D1C]"
                  >
                    Connect With Us
                  </button>
                  <div className="grid gap-3 border-y border-[#601D1C]/10 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                      More
                    </p>
                    {MORE_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-[#601D1C]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/account"
                    prefetch={false}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-lg font-medium text-[#601D1C]"
                  >
                    Account
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-11 rounded-full"
              aria-label="View cart"
              disabled
            >
              <span className="h-5 w-5 rounded-lg border border-current" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 xl:hidden"
              aria-label="Open menu"
              disabled
            >
              <MenuIcon />
            </Button>
          </>
        )}
      </div>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </>
  );
}

export function SiteHeaderControls() {
  return <SiteHeaderControlsInner />;
}
