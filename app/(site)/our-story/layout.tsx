import type { Metadata } from "next";
import type { ReactNode } from "react";

import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "About From The Trunk | Restored Indian Textiles and Pre-Loved Sarees",
  description:
    "Learn how From The Trunk authenticates, restores, and recirculates pre-loved sarees, heirloom silk sarees, and Indian textiles with provenance.",
  path: "/our-story",
});

export default function OurStoryLayout({ children }: { children: ReactNode }) {
  return children;
}
