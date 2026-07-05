import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KeywordContentPage } from "@/components/seo/keyword-content-page";
import {
  getKeywordLandingByTypeSlug,
  keywordLandingMetadata,
} from "@/lib/seo/keyword-landing-pages";

const config = getKeywordLandingByTypeSlug("supply", "sell-your-saree");

export const metadata: Metadata = config
  ? keywordLandingMetadata(config, 0)
  : { title: "Sell Your Saree" };

export default function SellYourSareePage() {
  if (!config) notFound();
  return <KeywordContentPage config={config} />;
}
