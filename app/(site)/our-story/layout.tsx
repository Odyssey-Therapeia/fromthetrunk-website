import type { Metadata } from "next";
import type { ReactNode } from "react";

import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Our Story",
  description:
    "The story behind From the Trunk: authenticated, restored, and re-storied sarees given another life.",
  path: "/our-story",
});

export default function OurStoryLayout({ children }: { children: ReactNode }) {
  return children;
}
