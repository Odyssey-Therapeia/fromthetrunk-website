import Link from "next/link";

import { ProductCard } from "@/components/product/product-card";
import { Badge } from "@/components/ui/badge";
import { searchProducts } from "@/lib/ports/catalog-search";
import {
  isKeywordLandingIndexable,
  keywordBreadcrumbJsonLd,
  keywordFaqJsonLd,
  keywordItemListJsonLd,
  type KeywordLandingConfig,
} from "@/lib/seo/keyword-landing-pages";
import { safeJsonLd } from "@/lib/seo/json-ld";

type KeywordProductLandingPageProps = {
  config: KeywordLandingConfig;
};

export async function getKeywordLandingProducts(config: KeywordLandingConfig) {
  if (!config.searchFilters) {
    return { products: [], totalDocs: 0 };
  }

  const result = await searchProducts({
    ...config.searchFilters,
    includeFacets: false,
    limit: 12,
    offset: 0,
  });

  return {
    products: result.products,
    totalDocs: result.totalDocs,
  };
}

export async function KeywordProductLandingPage({
  config,
}: KeywordProductLandingPageProps) {
  const { products, totalDocs } = await getKeywordLandingProducts(config);
  const indexable = isKeywordLandingIndexable(config, totalDocs);
  const breadcrumbJsonLd = keywordBreadcrumbJsonLd(config);
  const faqJsonLd = keywordFaqJsonLd(config);
  const itemListJsonLd = keywordItemListJsonLd(config, products);

  return (
    <main className="bg-ftt-ivory pb-16 text-ftt-midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      ) : null}
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
        />
      ) : null}

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
          <span className="text-ftt-navy">{config.h1}</span>
        </nav>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.45fr)] lg:items-start">
          <div>
            <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-ftt-gold">
              {config.primaryKeyword}
            </Badge>
            <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.7rem,6vw,5.6rem)] leading-[0.92] text-ftt-burgundy">
              {config.h1}
            </h1>
            <div className="mt-6 max-w-3xl space-y-4 text-base leading-8 text-ftt-burgundy/74">
              {config.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ftt-gold">
              Page status
            </p>
            <p className="mt-3 text-sm leading-7 text-ftt-burgundy/70">
              {indexable
                ? `${totalDocs} available pieces match this edit.`
                : totalDocs > 0
                  ? `${totalDocs} piece${totalDocs === 1 ? "" : "s"} available now. This page is kept out of the sitemap until the edit is fuller.`
                  : "No available pieces match this edit right now, so this page is not indexed as a product landing page."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {config.related.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-ftt-border bg-ftt-ivory px-3 py-2 text-xs font-medium text-ftt-burgundy transition hover:border-ftt-gold hover:text-ftt-navy"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </aside>
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
              This edit is waiting for the right pieces.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7">
              Browse the full collection meanwhile, or check back as new trunks
              are authenticated and restored.
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

      {config.faq.length > 0 ? (
        <section className="mx-auto mt-12 w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[1.5rem] border border-ftt-border bg-ftt-card p-6 shadow-[0_16px_42px_rgba(20,29,70,0.08)]">
            <h2 className="font-serif text-3xl text-ftt-navy">
              Questions shoppers ask
            </h2>
            <div className="mt-5 grid gap-4">
              {config.faq.map((item) => (
                <div key={item.question} className="border-t border-ftt-border pt-4">
                  <h3 className="font-semibold text-ftt-burgundy">
                    {item.question}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-ftt-burgundy/70">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
