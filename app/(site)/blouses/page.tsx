import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getKeywordLandingProducts,
  KeywordProductLandingPage,
} from "@/components/seo/keyword-product-landing-page";
import {
  getKeywordLandingByTypeSlug,
  keywordLandingMetadata,
} from "@/lib/seo/keyword-landing-pages";

const config = getKeywordLandingByTypeSlug("blouse", "blouses");

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  if (!config) return { title: "Blouses" };
  const { totalDocs } = await getKeywordLandingProducts(config);
  return keywordLandingMetadata(config, totalDocs);
}

export default async function BlousesPage() {
  if (!config) notFound();
  const { totalDocs } = await getKeywordLandingProducts(config);
  if (totalDocs < config.minProductCount) notFound();
  return <KeywordProductLandingPage config={config} />;
}
