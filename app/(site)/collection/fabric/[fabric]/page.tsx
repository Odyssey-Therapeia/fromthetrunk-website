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

type FabricLandingPageProps = {
  params: Promise<{ fabric: string }>;
};

export const revalidate = 60;

export async function generateMetadata({
  params,
}: FabricLandingPageProps): Promise<Metadata> {
  const { fabric } = await params;
  const config = getKeywordLandingByTypeSlug("fabric", fabric);
  if (!config) return { title: "Fabric" };
  const { totalDocs } = await getKeywordLandingProducts(config);
  return keywordLandingMetadata(config, totalDocs);
}

export function generateStaticParams() {
  return ["silk", "kanjeevaram", "chiffon", "georgette"].map((fabric) => ({
    fabric,
  }));
}

export default async function FabricLandingPage({
  params,
}: FabricLandingPageProps) {
  const { fabric } = await params;
  const config = getKeywordLandingByTypeSlug("fabric", fabric);
  if (!config) notFound();
  return <KeywordProductLandingPage config={config} />;
}
