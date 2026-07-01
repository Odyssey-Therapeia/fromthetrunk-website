/**
 * P5-06: llms.txt — AEO (Answer-Engine Optimization) convention.
 *
 * Served at /llms.txt with content-type text/plain.
 * Derived from REAL content: listProducts + published static pages.
 * Absolute URLs via getSiteOrigin().
 *
 * llms.txt convention: https://llmstxt.org/
 *  - A short site description at the top.
 *  - ## Sections with links to key pages.
 *  - One URL per line in each section.
 *
 * This route is force-dynamic so it always reflects the current product
 * catalogue without needing a rebuild.
 */

import { listProducts } from "@/db/queries/products";
import { getSiteOrigin } from "@/lib/config/site";

export const dynamic = "force-dynamic";

const STATIC_PAGES = [
  { title: "Home", path: "/" },
  { title: "Collection", path: "/collection" },
  { title: "Our Story", path: "/our-story" },
  { title: "Our Team", path: "/our-team" },
  { title: "How It Works", path: "/how-it-works" },
  { title: "Our Why", path: "/why" },
  { title: "FAQs", path: "/faqs" },
  { title: "Sell Your Saree", path: "/sell-your-saree" },
  {
    title: "What Is a Pre-Loved Saree",
    path: "/guides/what-is-a-pre-loved-saree",
  },
  {
    title: "Pre-Loved vs Second-Hand Saree",
    path: "/guides/pre-loved-vs-second-hand-saree",
  },
  { title: "Policies", path: "/policies" },
  { title: "Return Policy", path: "/policies/return-refund-policy" },
  { title: "Shipping Policy", path: "/policies/shipping-delivery-policy" },
  { title: "Privacy Policy", path: "/policies/privacy-policy" },
  { title: "Terms of Service", path: "/policies/terms-of-service" },
] as const;

export async function GET(): Promise<Response> {
  const origin = getSiteOrigin();

  const { rows: products } = await listProducts({
    includeDrafts: false,
    limit: 200,
    offset: 0,
  });

  const lines: string[] = [
    "# From the Trunk",
    "",
    "> From the Trunk is a curated marketplace for authenticated, pre-loved luxury",
    "> sarees. Each piece carries provenance, history, and a story.",
    "> We specialise in unique preloved pieces from renowned Indian weaving traditions.",
    "",
    "## Key pages",
    "",
    ...STATIC_PAGES.map((page) => `- [${page.title}](${origin}${page.path})`),
    "",
    "## Products",
    "",
    ...products
      .filter((p) => p.slug && p.stockStatus !== "sold")
      .map((p) => `- [${p.name}](${origin}/collection/${p.slug})`),
  ];

  const body = lines.join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cache for 1 hour in CDN; revalidate in background
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
