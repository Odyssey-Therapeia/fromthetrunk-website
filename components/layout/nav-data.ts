/**
 * P3-09: Server-side navigation data fetchers.
 *
 * These are plain async functions (NOT React components) that fetch managed
 * menus for the site header and footer. They are called from RSC wrappers
 * (SiteHeaderServer, SiteFooterServer) which pass the data down to the
 * existing client components.
 *
 * On error (DB unavailable etc.) they fall back to the defaults silently —
 * the site renders correctly even if the managed menus can't be fetched.
 */

import { unstable_cache } from "next/cache";
import {
  PUBLIC_FOOTER_NAV_CACHE_TAG,
  PUBLIC_HEADER_NAV_CACHE_TAG,
} from "@/lib/cache/public-content-cache";

import {
  DEFAULT_NAV_LINKS,
  DEFAULT_FOOTER_SECTIONS,
  getNavLinks,
  getFooterSections,
  type NavLink,
  type FooterSection,
} from "@/lib/content/nav-menu";

export type { NavLink, FooterSection };
export { DEFAULT_NAV_LINKS, DEFAULT_FOOTER_SECTIONS };

const getCachedHeaderNav = unstable_cache(
  () => getNavLinks(),
  ["ftt:public-navigation:header"],
  { revalidate: 300, tags: [PUBLIC_HEADER_NAV_CACHE_TAG] },
);

const getCachedFooterSections = unstable_cache(
  () => getFooterSections(),
  ["ftt:public-navigation:footer"],
  { revalidate: 300, tags: [PUBLIC_FOOTER_NAV_CACHE_TAG] },
);

/**
 * Fetch header nav links with fallback to defaults on error.
 */
export async function fetchHeaderNav(): Promise<NavLink[]> {
  try {
    return await getCachedHeaderNav();
  } catch {
    return DEFAULT_NAV_LINKS;
  }
}

/**
 * Fetch footer sections with fallback to defaults on error.
 */
export async function fetchFooterSections(): Promise<FooterSection[]> {
  try {
    return await getCachedFooterSections();
  } catch {
    return DEFAULT_FOOTER_SECTIONS;
  }
}
