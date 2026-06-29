import Image from "next/image";
import Link from "next/link";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteHeaderControls } from "@/components/layout/site-header-controls";

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

function NavUnderline() {
  return (
    <span className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] origin-left scale-x-0 rounded-full bg-[#B39152]/55 transition-transform duration-300 ease-out group-hover/nav:scale-x-100" />
  );
}

function ServerNavLink({
  href,
  label,
  strong = false,
}: {
  href: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group/nav relative whitespace-nowrap text-[15px] tracking-[0.035em] transition-colors 2xl:text-[16px]",
        strong
          ? "font-bold text-[#601D1C]"
          : "font-semibold text-[#601D1C]/82 hover:text-[#601D1C]",
      ].join(" ")}
    >
      {label}
      <NavUnderline />
    </Link>
  );
}

function ServerNavDropdown({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string }[];
}) {
  return (
    <div className="group/dropdown relative">
      <button
        type="button"
        className="group/nav relative inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#601D1C]/82 transition-colors hover:text-[#601D1C] 2xl:text-[16px]"
      >
        {label}
        <span className="text-[#B39152]" aria-hidden="true">
          ⌄
        </span>
        <NavUnderline />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-50 -translate-x-1/2 pt-4 opacity-0 transition group-hover/dropdown:pointer-events-auto group-hover/dropdown:opacity-100 group-focus-within/dropdown:pointer-events-auto group-focus-within/dropdown:opacity-100">
        <div className="w-64 rounded-xl border border-[#601D1C]/10 bg-[#FDF7F1] p-2 shadow-xl shadow-[#601D1C]/10">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-4 py-3 text-sm font-semibold text-[#601D1C]/75 transition hover:bg-[#601D1C] hover:text-[#B39152]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function SiteHeaderServer() {
  return (
    <header className="sticky top-0 z-50 bg-[#FDF7F1]/95 backdrop-blur">
      <AnnouncementBar />
      <div className="border-b border-[#601D1C]/10">
        <div className="flex h-16 w-full items-stretch justify-between gap-2 px-3 sm:px-5 md:px-8 lg:px-10 xl:h-18 xl:px-14">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-10">
            <Link href="/" className="flex h-full shrink-0 items-center">
              <Image
                src="/logo.png"
                alt="From the Trunk"
                width={180}
                height={100}
                className="h-14 w-auto object-contain xl:h-[4.25rem]"
                sizes="180px"
              />
              <span className="sr-only">From the Trunk</span>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-start gap-5 xl:flex 2xl:gap-7">
              {NAV_ITEMS.slice(0, 2).map((link) => (
                <ServerNavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  strong={"strong" in link && link.strong}
                />
              ))}
              <ServerNavDropdown label="Shop By" items={SHOP_BY_ITEMS} />
              {NAV_ITEMS.slice(2).map((link) =>
                link.label === "About Us" ? (
                  <ServerNavDropdown
                    key={link.href}
                    label="About Us"
                    items={ABOUT_ITEMS}
                  />
                ) : (
                  <ServerNavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                  />
                ),
              )}
            </nav>
          </div>

          <SiteHeaderControls />
        </div>
      </div>
    </header>
  );
}
