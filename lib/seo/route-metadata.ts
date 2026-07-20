import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo/metadata";

/**
 * Customer-facing utility pages — cart, checkout, order confirmation, search,
 * account, wishlist, and the 404. Kept OUT of the index, but crawlers may FOLLOW
 * the links on them (e.g. product links) so link equity still flows through.
 */
export const CUSTOMER_NOINDEX_FOLLOW_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
};

/**
 * Admin surfaces — out of the index AND not followed. Nothing behind admin
 * should be crawled or discovered.
 */
export const ADMIN_NOINDEX_NOFOLLOW_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};

export const ADMIN_METADATA: Metadata = {
  title: "From the Trunk Admin",
  robots: ADMIN_NOINDEX_NOFOLLOW_ROBOTS,
};

export const WHY_PAGE_METADATA: Metadata = publicPageMetadata({
  title: "Why We Do What We Do",
  description:
    "A voice led story experience about why From the Trunk restores, authenticates, and recirculates pre-loved luxury sarees.",
  path: "/why",
});
