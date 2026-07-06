import type { Metadata } from "next";

import { FoundersPageClient } from "@/components/sections/founders-page-client";
import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Our Team | From The Trunk",
  description:
    "Meet the team behind From The Trunk, a circular saree house for authenticated pre-loved sarees and restored Indian textiles.",
  path: "/our-team",
});

export default function FoundersPage() {
  return <FoundersPageClient />;
}
