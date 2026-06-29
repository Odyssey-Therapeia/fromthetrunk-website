"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";

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

const NAV_ITEMS = [
  { href: "/collection", label: "Collection", strong: true },
  { href: "/collection?tags=top-pick", label: "Top Pick" },
  { href: "/collection?type=blouse", label: "Blouses" },
  { href: "/#connect", label: "Connect With Us" },
  { href: "/our-team", label: "About Us" },
  { href: "/faqs", label: "FAQ & Policies" },
] as const;

const SHOP_BY_ITEMS = [
  { href: "/collection#filter-sort", label: "Sort" },
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
  const { data: session } = useSession();
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

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
            href={session ? "/account/profile" : "/account/sign-in"}
            aria-label={session ? "Your account" : "Sign in"}
          >
            <AccountIcon />
            {session ? (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#B39152]" />
            ) : null}
          </Link>
        </Button>

        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative size-11 rounded-full hover:bg-[#601D1C]/8 hover:text-[#601D1C]"
        >
          <Link href="/account/wishlist" aria-label="Liked products">
            <HeartIcon />
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
                    {NAV_ITEMS.slice(0, 2).map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`text-lg text-[#601D1C] ${"strong" in link && link.strong ? "font-bold" : "font-medium"}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <div className="grid gap-3 border-y border-[#601D1C]/10 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                      Shop By
                    </p>
                    {SHOP_BY_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-[#601D1C]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="grid gap-3 border-y border-[#601D1C]/10 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                      About Us
                    </p>
                    {ABOUT_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
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
                  <Link
                    href="/faqs"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-lg font-medium text-[#601D1C]"
                  >
                    FAQ & Policies
                  </Link>
                  <Link
                    href={session ? "/account/profile" : "/account/sign-in"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-lg font-medium text-[#601D1C]"
                  >
                    {session ? "Account" : "Sign In"}
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
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <SiteHeaderControlsInner />
    </SessionProvider>
  );
}
