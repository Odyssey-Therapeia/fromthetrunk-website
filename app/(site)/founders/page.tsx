import type { Metadata } from "next";

import { FoundersPageClient } from "@/components/sections/founders-page-client";

export const metadata: Metadata = {
  title: "Founders",
  description:
    "Meet the three hands behind From the Trunk, India's circular saree house built around curation, care, and community.",
};

export default function FoundersPage() {
  return <FoundersPageClient />;
}
