"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  items: readonly NavDropdownItem[];
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuId = useId();
  const previousPathnameRef = useRef(pathname);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;

    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
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
        <div
          id={menuId}
          role="menu"
          className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-4"
        >
          <div className="w-64 rounded-xl border border-[#601D1C]/10 bg-[#FDF7F1] p-2 shadow-xl shadow-[#601D1C]/10">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
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
