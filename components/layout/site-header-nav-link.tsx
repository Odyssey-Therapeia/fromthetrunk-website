"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

type SiteHeaderNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Marks the link `aria-current="page"` on this path and everything under it. */
  activePrefix?: string;
};

/**
 * The only client piece of the server-rendered header nav: it reads the
 * current path so a section link can show as active. Styling stays in
 * site-header-server.tsx through `aria-[current=page]:` classes.
 */
export function SiteHeaderNavLink({ href, activePrefix, ...props }: SiteHeaderNavLinkProps) {
  const pathname = usePathname();
  const active = activePrefix
    ? pathname === activePrefix || pathname.startsWith(`${activePrefix}/`)
    : false;

  return <Link href={href} aria-current={active ? "page" : undefined} {...props} />;
}
