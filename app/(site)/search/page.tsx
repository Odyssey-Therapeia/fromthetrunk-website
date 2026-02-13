import type { Metadata } from "next";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductCard } from "@/components/product/product-card";
import { getPayloadClient } from "@/lib/payload/server";
import type { Product } from "@/types/payload-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string }> | { q?: string };
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedParams = await Promise.resolve(searchParams);
  const query = resolvedParams?.q?.trim() ?? "";

  let results: Product[] = [];

  if (query.length >= 2) {
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "products",
      depth: 2,
      limit: 48,
      where: {
        and: [
          { status: { equals: "published" } },
          {
            or: [
              { name: { contains: query } },
              { "details.fabric": { contains: query } },
              { "details.designer": { contains: query } },
              { "story.era": { contains: query } },
              { "story.provenance": { contains: query } },
            ],
          },
        ],
      },
      sort: "-createdAt",
      overrideAccess: true,
    });
    results = result.docs as unknown as Product[];
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Search Results
        </p>
        <h1 className="font-serif text-4xl text-foreground md:text-5xl">
          {query
            ? `Results for "${query}"`
            : "Search the collection"}
        </h1>
        {query && (
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? "No pieces matched your search. Try a different term."
              : `Found ${results.length} piece${results.length === 1 ? "" : "s"}.`}
          </p>
        )}
        {!query && (
          <p className="text-sm text-muted-foreground">
            Use the search bar in the header to find sarees by name, fabric,
            designer, or era.
          </p>
        )}
      </ScrollReveal>

      {results.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {results.map((product, index) => (
            <ScrollReveal key={product.id} delay={index * 0.04}>
              <ProductCard product={product} />
            </ScrollReveal>
          ))}
        </div>
      )}

      {query && results.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Try searching for &ldquo;silk&rdquo;, &ldquo;banarasi&rdquo;,
            &ldquo;bridal&rdquo;, or a designer name.
          </p>
        </div>
      )}
    </div>
  );
}
