import type { Metadata } from "next";

import { FoundersPageClient } from "@/components/sections/founders-page-client";
import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Our Team",
  description:
    "Meet the founders and contributors behind From the Trunk, the circular saree house giving every saree a second story.",
  path: "/our-team",
});

export default function FoundersPage() {
  return <FoundersPageClient />;
}
