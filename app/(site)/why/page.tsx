import type { Metadata } from "next";

import { OurWhyExperience } from "@/components/sections/our-why-experience";
import { WHY_PAGE_METADATA } from "@/lib/seo/route-metadata";

export const metadata: Metadata = WHY_PAGE_METADATA;

// Curated saree photos for the "Our Why" story, served from public/our-story/.
// The hero composition uses the first three (big image, bottom-left and
// top-right thumbnails). Reorder these or drop in your own files/URLs to change
// which photos appear.
const WHY_IMAGES = [
  {
    src: "/our-story/chap_1.avif",
    alt: "A pre-loved heritage saree from From the Trunk",
  },
  {
    src: "/category/georgette.jpg",
    alt: "A restored silk saree styled for a modern wardrobe",
  },
  {
    src: "/our-story/chap_3.avif",
    alt: "A curated saree ready for its next chapter",
  },
  {
    src: "/our-story/chap_4.avif",
    alt: "A consciously chosen pre-loved saree",
  },
  {
    src: "/our-story/chap_5.avif",
    alt: "A restored saree from the From the Trunk collection",
  },
];

export default function WhyPage() {
  return <OurWhyExperience images={WHY_IMAGES} />;
}
