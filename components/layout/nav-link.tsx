"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Animated underline shared by the desktop nav links and dropdown triggers.
 * - Hover: a gold underline wipes in from the left.
 * - Active page: a solid gold underline that slides between items as the route
 *   changes (framer-motion shared layout via a single `layoutId`).
 *
 * The host element must be `relative` and carry the `group/nav` class so the
 * hover wipe responds to that item only.
 */
export function NavUnderline({ active }: { active: boolean }) {
  return (
    <>
      <span className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] origin-left scale-x-0 rounded-full bg-[#B39152]/55 transition-transform duration-300 ease-out group-hover/nav:scale-x-100" />
      {active ? (
        <span className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[#B39152] transition-transform duration-300 ease-out" />
      ) : null}
    </>
  );
}

export function NavLink({
  href,
  label,
  active = false,
  strong = false,
}: {
  href: string;
  label: string;
  active?: boolean;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav relative whitespace-nowrap text-[15px] tracking-[0.035em] transition-colors 2xl:text-[16px]",
        strong
          ? "font-bold text-[#601D1C]"
          : active
            ? "font-semibold text-[#601D1C]"
            : "font-semibold text-[#601D1C]/82 hover:text-[#601D1C]",
      )}
    >
      {label}
      <NavUnderline active={active} />
    </Link>
  );
}
