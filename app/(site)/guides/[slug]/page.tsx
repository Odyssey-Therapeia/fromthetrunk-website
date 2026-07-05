import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KeywordContentPage } from "@/components/seo/keyword-content-page";
import {
  getGuideLanding,
  keywordLandingMetadata,
  keywordLandingPages,
} from "@/lib/seo/keyword-landing-pages";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = getGuideLanding(slug);
  if (!config) return { title: "Guide" };
  return keywordLandingMetadata(config, 0);
}

export function generateStaticParams() {
  return keywordLandingPages
    .filter((page) => page.type === "guide")
    .map((page) => ({ slug: page.slug }));
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const config = getGuideLanding(slug);
  if (!config) notFound();
  return <KeywordContentPage config={config} />;
}
