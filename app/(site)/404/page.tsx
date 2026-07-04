import type { Metadata } from "next";

import { BrandedNotFound } from "@/components/errors/branded-not-found";
import { PRIVATE_NOINDEX_ROBOTS } from "@/lib/seo/route-metadata";

export const metadata: Metadata = {
  title: "This piece isn't in the trunk",
  robots: PRIVATE_NOINDEX_ROBOTS,
};

export default function NotFoundRenderRoute() {
  return <BrandedNotFound />;
}
