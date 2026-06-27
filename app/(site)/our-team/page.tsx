import type { Metadata } from "next";

import { FoundersPageClient } from "@/components/sections/founders-page-client";

export const metadata: Metadata = {
  title: "Our Team",
  description:
    "Meet the founders and contributors behind From the Trunk, the circular saree house giving every saree a second story.",
};

export default function FoundersPage() {
  return <FoundersPageClient />;
}
