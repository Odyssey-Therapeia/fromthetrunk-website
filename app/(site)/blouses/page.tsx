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
  // Robots come from keywordLandingMetadata: indexable when blouses are in stock,
  // noindex (but still rendered) when the edit is empty — so it never 404s.
  const { totalDocs } = await getKeywordLandingProducts(config);
  return keywordLandingMetadata(config, totalDocs);
}

export default async function BlousesPage() {
  if (!config) notFound();
  // No inventory gate: /blouses is a stable public landing page. The shared
  // component renders a graceful empty state when no blouses are available.
  return <KeywordProductLandingPage config={config} />;
}
