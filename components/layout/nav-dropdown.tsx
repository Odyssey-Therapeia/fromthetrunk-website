"use client";

import { useState } from "react";
import Link from "next/link";

import { NavUnderline } from "@/components/layout/nav-link";

type NavDropdownItem = { href: string; label: string };

/**
 * Desktop nav dropdown that opens on hover/focus and — crucially — closes as
 * soon as an item is selected (the old CSS-only version stayed open until the
 * cursor moved away). A transparent `pt-4` bridge keeps it open while the
 * cursor travels from the trigger into the menu.
 */
export function NavDropdown({
  label,
  items,
  active = false,
}: {
  label: string;
  items: NavDropdownItem[];
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((value) => !value)}
        className="group/nav relative inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#601D1C]/82 transition-colors hover:text-[#601D1C] 2xl:text-[16px]"
      >
        {label}
        <span className="text-[#B39152]" aria-hidden="true">
          ⌄
        </span>
        <NavUnderline active={active} />
      </button>

      {open ? (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-4">
          <div className="w-48 rounded-xl border border-[#601D1C]/10 bg-[#FDF7F1] p-2 shadow-xl shadow-[#601D1C]/10">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-semibold text-[#601D1C]/75 transition hover:bg-[#601D1C] hover:text-[#B39152]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
