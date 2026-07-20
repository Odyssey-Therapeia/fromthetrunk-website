import type { Metadata } from "next";
import type { ReactNode } from "react";

import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Our Story — Sarees With Provenance | From The Trunk",
  description:
    "Why we authenticate every saree and pass on its story. Meet From The Trunk — a home for pre-loved luxury sarees that still have a story to tell.",
  path: "/our-story",
});

export default function OurStoryLayout({ children }: { children: ReactNode }) {
  return children;
}
