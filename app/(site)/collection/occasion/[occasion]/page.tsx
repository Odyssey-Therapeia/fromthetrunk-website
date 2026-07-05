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

type OccasionLandingPageProps = {
  params: Promise<{ occasion: string }>;
};

export const revalidate = 60;

export async function generateMetadata({
  params,
}: OccasionLandingPageProps): Promise<Metadata> {
  const { occasion } = await params;
  const config = getKeywordLandingByTypeSlug("occasion", occasion);
  if (!config) return { title: "Occasion" };
  const { totalDocs } = await getKeywordLandingProducts(config);
  return keywordLandingMetadata(config, totalDocs);
}

export function generateStaticParams() {
  return ["wedding", "festive"].map((occasion) => ({ occasion }));
}

export default async function OccasionLandingPage({
  params,
}: OccasionLandingPageProps) {
  const { occasion } = await params;
  const config = getKeywordLandingByTypeSlug("occasion", occasion);
  if (!config) notFound();
  return <KeywordProductLandingPage config={config} />;
}
