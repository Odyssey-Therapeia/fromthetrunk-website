import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/product/product-card";
import { searchProducts } from "@/lib/ports/catalog-search";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site-url";

export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: "Most-Viewed Pre-Loved Sarees – Top Picks | From The Trunk",
  description:
    "Our most-viewed pre-loved sarees this week — authenticated silk, chiffon and designer drapes shoppers keep coming back to. One-of-a-kind, updated often.",
  path: "/top-viewed",
});

export default async function TopViewedPage() {
  // Real data source: available products ranked by product_view events over the
  // last 30 days (zero-view products are omitted). The result can be empty, so
  // the page renders a graceful empty state instead of 404ing.
  const { products } = await searchProducts({
    sortBy: "top-viewed",
    availabilityStatus: "available",
    includeFacets: false,
    limit: 24,
    offset: 0,
  });

  return (
    <main className="bg-ftt-ivory pb-16 text-ftt-midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Home", url: absoluteUrl("/") },
              { name: "Collection", url: absoluteUrl("/collection") },
              {
                name: "Most-Loved Pre-Loved Sarees",
                url: absoluteUrl("/top-viewed"),
              },
            ]),
          ),
        }}
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/55"
        >
          <Link href="/" className="hover:text-ftt-navy">
            Home
          </Link>
          <span>/</span>
          <Link href="/collection" className="hover:text-ftt-navy">
            Collection
          </Link>
          <span>/</span>
          <span className="text-ftt-navy">Most-Loved</span>
        </nav>

        <div className="mt-8 max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-ftt-gold">
            The Collection
          </p>
          <h1 className="mt-4 font-serif text-[clamp(2.7rem,6vw,5.6rem)] leading-[0.92] text-ftt-burgundy">
            Most-Loved Pre-Loved Sarees
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-ftt-burgundy/74">
            The pieces shoppers keep coming back to — our most-viewed authenticated
            pre-loved sarees right now, ranked by what buyers are loving this month
            and updated often. Every drape is one-of-a-kind, so a favourite can find
            its person quickly.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {products.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-ftt-border bg-ftt-card p-6 text-ftt-burgundy/72 shadow-[0_16px_42px_rgba(20,29,70,0.08)]">
            <h2 className="font-serif text-3xl text-ftt-navy">
              The most-loved edit is warming up.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7">
              As shoppers browse, the most-viewed pieces rise to the top here.
              Meanwhile, explore the full collection of authenticated pre-loved
              sarees.
            </p>
            <Link
              href="/collection"
              className="mt-5 inline-flex rounded-full bg-ftt-navy px-5 py-3 text-sm font-semibold text-ftt-ivory transition hover:bg-ftt-burgundy"
            >
              Browse all sarees
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
