import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo/metadata";

export const PRIVATE_NOINDEX_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};

export const ADMIN_METADATA: Metadata = {
  title: "From the Trunk Admin",
  robots: PRIVATE_NOINDEX_ROBOTS,
};

export const WHY_PAGE_METADATA: Metadata = publicPageMetadata({
  title: "Why We Do What We Do",
  description:
    "A voice led story experience about why From the Trunk restores, authenticates, and recirculates pre-loved luxury sarees.",
  path: "/why",
});
