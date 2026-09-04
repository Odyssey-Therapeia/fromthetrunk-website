import Image from "next/image";
import Link from "next/link";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteHeaderCommerceControls } from "@/components/layout/site-header-commerce-controls";
import { DrapeRoomPhotoMenu } from "@/components/drape-room/drape-room-photo-menu";

const NAV_ITEMS = [
  { href: "/collection", label: "Collection" },
  { href: "/top-viewed", label: "Top Viewed" },
  { href: "/blouses", label: "Blouses" },
  { href: "/#connect", label: "Connect With Us" },
  { href: "/our-team", label: "About Us" },
  { href: "/faqs", label: "FAQ & Policies" },
] as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c1.1-3.6 3.3-5.4 6.5-5.4s5.4 1.8 6.5 5.4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

const iconLinkClass =
  "grid size-11 place-items-center rounded-full text-[#601D1C] transition hover:bg-[#601D1C]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B39152]";

export async function SiteHeaderServer() {
  return (
    <header className="sticky top-0 z-50 bg-[#FDF7F1]/95 backdrop-blur">
      <AnnouncementBar />
      <div className="border-b border-[#601D1C]/10">
        <div className="relative flex h-16 w-full items-stretch justify-between gap-2 px-3 sm:px-5 md:px-8 lg:px-10 xl:h-18 xl:px-14">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-10">
            <Link href="/" prefetch={false} className="flex h-full shrink-0 items-center">
              <Image
                src="/Ftt_logo_navbar.avif"
                alt=""
                width={180}
                height={100}
                loading="eager"
                className="h-14 w-auto object-contain xl:h-[4.25rem]"
                sizes="180px"
                unoptimized
              />
              <span className="sr-only">From the Trunk</span>
            </Link>

            <nav aria-label="Primary navigation" className="hidden items-center gap-6 xl:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className="whitespace-nowrap text-sm font-medium text-[#601D1C] underline-offset-8 transition hover:text-[#B39152] hover:underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <details className="group/search relative hidden sm:block">
              <summary className={`${iconLinkClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`} aria-label="Search products">
                <SearchIcon />
              </summary>
              <form action="/search" className="absolute right-0 top-[calc(100%+0.5rem)] hidden w-80 rounded-2xl border border-[#601D1C]/15 bg-[#FFFCF8] p-3 shadow-xl group-open/search:flex">
                <label className="sr-only" htmlFor="header-search">Search products</label>
                <input id="header-search" name="q" minLength={2} required placeholder="Search sarees…" className="min-w-0 flex-1 rounded-l-full border border-[#601D1C]/20 bg-white px-4 py-2 text-sm outline-none focus:border-[#B39152]" />
                <button className="rounded-r-full bg-[#601D1C] px-4 text-sm font-medium text-[#FDF7F1]" type="submit">Search</button>
              </form>
            </details>
            <DrapeRoomPhotoMenu />
            <Link href="/account" prefetch={false} className={iconLinkClass} aria-label="Your account"><AccountIcon /></Link>
            {/* Wishlist + cart are the only header controls that need live client
                state (counts, and the cart Sheet). They live in one small island
                so this header stays a server component. */}
            <SiteHeaderCommerceControls />

            <details className="group/menu relative xl:hidden">
              <summary className={`${iconLinkClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`} aria-label="Open menu"><MenuIcon /></summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] hidden w-[min(84vw,24rem)] rounded-3xl border border-[#601D1C]/15 bg-[#FFFCF8] p-5 shadow-xl group-open/menu:block">
                <form action="/search" className="mb-5 flex sm:hidden">
                  <label className="sr-only" htmlFor="mobile-header-search">Search products</label>
                  <input id="mobile-header-search" name="q" minLength={2} required placeholder="Search sarees…" className="min-w-0 flex-1 rounded-l-full border border-[#601D1C]/20 px-4 py-2 text-sm" />
                  <button className="rounded-r-full bg-[#601D1C] px-4 text-sm text-[#FDF7F1]" type="submit">Search</button>
                </form>
                <nav aria-label="Mobile navigation" className="grid gap-1">
                  {NAV_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} prefetch={false} className="rounded-xl px-3 py-2.5 text-base font-medium text-[#601D1C] hover:bg-[#B39152]/10">{item.label}</Link>
                  ))}
                  {/* Compact fallback for headers too narrow to carry the heart
                      icon. Mirrors the icon's own gate in
                      components/layout/site-header-commerce-controls.tsx
                      (`hidden min-[375px]:grid`) so exactly one wishlist entry
                      point is offered at any width — the icon from 375px up,
                      this link below it. Was `sm:hidden` (640px), which
                      duplicated the entry point across 375–639px. */}
                  <Link href="/account/wishlist" prefetch={false} className="rounded-xl px-3 py-2.5 text-base font-medium text-[#601D1C] hover:bg-[#B39152]/10 min-[375px]:hidden">Liked products</Link>
                </nav>
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
