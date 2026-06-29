"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ConnectDialog } from "@/components/layout/connect-dialog";
import { NavDropdown } from "@/components/layout/nav-dropdown";
import { NavLink, NavUnderline } from "@/components/layout/nav-link";

const NAV_ITEMS = [
  { href: "/collection", label: "Collection", strong: true },
  { href: "/collection?tags=top-pick", label: "Top Pick" },
  { href: "/collection?type=blouse", label: "Blouses" },
  { href: "/#connect", label: "Connect With Us" },
  { href: "/our-team", label: "About Us" },
  { href: "/faqs", label: "FAQ & Policies" },
] as const;

const SHOP_BY_ITEMS = [
  { href: "/collection#filter-edit", label: "Edit" },
  { href: "/collection#filter-type", label: "Category" },
  { href: "/collection#filter-fabric", label: "Fabric" },
  { href: "/collection#filter-color", label: "Colour" },
  { href: "/collection#filter-price", label: "Price" },
  { href: "/collection#filter-availability", label: "Availability" },
  { href: "/collection#filter-occasion", label: "Occasion" },
  { href: "/collection#filter-work", label: "Work / Border" },
  { href: "/collection#filter-pattern", label: "Pattern / Motif" },
  { href: "/collection#filter-sort", label: "Sort" },
] as const;

const ABOUT_ITEMS = [
  { href: "/our-team", label: "Our Team" },
  { href: "/our-story", label: "Our Story" },
] as const;

function SiteHeaderDesktopNavInner() {
  const [connectOpen, setConnectOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const tags = searchParams.get("tags") ?? "";
  const type = searchParams.get("type") ?? "";

  const isTopPickActive =
    pathname === "/collection" && tags.split(",").includes("top-pick");
  const isBlouseActive =
    pathname === "/blouses" || (pathname === "/collection" && type === "blouse");
  const isFilteredCollection =
    pathname === "/collection" &&
    search.length > 0 &&
    !isTopPickActive &&
    !isBlouseActive;
  const isCollectionActive =
    (pathname === "/collection" || pathname.startsWith("/collection/")) &&
    !isTopPickActive &&
    !isBlouseActive &&
    !isFilteredCollection;
  const isAboutActive =
    pathname.startsWith("/our-team") ||
    pathname.startsWith("/founders") ||
    pathname.startsWith("/our-story");
  const isFaqsActive =
    pathname.startsWith("/faqs") ||
    pathname.startsWith("/policies") ||
    pathname.endsWith("-policy") ||
    pathname === "/terms-of-service" ||
    pathname === "/privacy-policy";

  return (
    <>
      <nav className="hidden min-w-0 flex-1 items-center justify-start gap-5 xl:flex 2xl:gap-7">
        <NavLink
          href="/collection"
          label="Collection"
          strong
          active={isCollectionActive}
        />
        <NavLink
          href="/collection?tags=top-pick"
          label="Top Pick"
          active={isTopPickActive}
        />
        <NavDropdown
          label="Shop By"
          items={SHOP_BY_ITEMS}
          active={isFilteredCollection}
        />
        <NavLink
          href="/collection?type=blouse"
          label="Blouses"
          active={isBlouseActive}
        />
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="group/nav relative whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#601D1C]/82 transition-colors hover:text-[#601D1C] 2xl:text-[16px]"
        >
          Connect With Us
          <NavUnderline active={false} />
        </button>
        <NavDropdown label="About Us" items={ABOUT_ITEMS} active={isAboutActive} />
        <NavLink href="/faqs" label="FAQ & Policies" active={isFaqsActive} />
      </nav>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </>
  );
}

function SiteHeaderDesktopNavFallback() {
  return (
    <nav className="hidden min-w-0 flex-1 items-center justify-start gap-5 xl:flex 2xl:gap-7">
      {NAV_ITEMS.slice(0, 2).map((link) => (
        <NavLink
          key={link.href}
          href={link.href}
          label={link.label}
          strong={"strong" in link && link.strong}
        />
      ))}
      <NavDropdown label="Shop By" items={SHOP_BY_ITEMS} />
      {NAV_ITEMS.slice(2).map((link) =>
        link.label === "About Us" ? (
          <NavDropdown key={link.href} label="About Us" items={ABOUT_ITEMS} />
        ) : link.label === "Connect With Us" ? (
          <span
            key={link.href}
            className="whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#601D1C]/82 2xl:text-[16px]"
          >
            Connect With Us
          </span>
        ) : (
          <NavLink key={link.href} href={link.href} label={link.label} />
        ),
      )}
    </nav>
  );
}

export function SiteHeaderDesktopNav() {
  return (
    <Suspense fallback={<SiteHeaderDesktopNavFallback />}>
      <SiteHeaderDesktopNavInner />
    </Suspense>
  );
}
