import Link from "next/link";

import type { ProductWithRelations } from "@/db/queries/products";
import { ProductCard } from "@/components/product/product-card";
import { Badge } from "@/components/ui/badge";
import {
  searchProducts,
  type CatalogSearchFilters,
} from "@/lib/ports/catalog-search";
import {
  getKeywordLandingByTypeSlug,
  keywordBreadcrumbJsonLd,
  keywordFaqJsonLd,
  keywordItemListJsonLd,
  type KeywordLandingConfig,
} from "@/lib/seo/keyword-landing-pages";
import { safeJsonLd } from "@/lib/seo/json-ld";

type KeywordProductLandingPageProps = {
  config: KeywordLandingConfig;
};

const LANDING_PRODUCT_LIMIT = 12;
const RELATED_PRODUCT_LIMIT = 4;

// Same column steps as the /collection grid, keyed to the section's own width.
const PRODUCT_GRID =
  "grid grid-cols-1 items-stretch gap-x-4 gap-y-5 @[30rem]:grid-cols-2 @[44rem]:grid-cols-3 @[44rem]:gap-y-6 @[64rem]:grid-cols-4 [&>*]:min-w-0";

async function searchLandingProducts(
  searchFilters: CatalogSearchFilters,
  limit: number,
) {
  const result = await searchProducts({
    ...searchFilters,
    includeFacets: false,
    limit,
    offset: 0,
  });

  return {
    products: result.products,
    totalDocs: result.totalDocs,
  };
}

export async function getKeywordLandingProducts(config: KeywordLandingConfig) {
  if (!config.searchFilters) {
    return { products: [], totalDocs: 0 };
  }

  return searchLandingProducts(config.searchFilters, LANDING_PRODUCT_LIMIT);
}

function pieceCount(count: number) {
  return `${count} piece${count === 1 ? "" : "s"}`;
}

function ProductGridFooter({
  href,
  label,
  shown,
  total,
}: {
  href: string;
  label: string;
  shown: number;
  total: number;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ftt-border pt-5">
      <p className="text-sm text-ftt-burgundy/70">
        {shown < total
          ? `Showing ${shown} of ${pieceCount(total)} available now`
          : `${pieceCount(total)} available now`}
      </p>
      <Link
        href={href}
        aria-label={label}
        className="inline-flex min-h-11 items-center rounded-full border border-ftt-navy px-5 text-sm font-semibold text-ftt-navy transition hover:bg-ftt-navy hover:text-ftt-ivory"
      >
        View all
      </Link>
    </div>
  );
}

function ProductGrid({ products }: { products: ProductWithRelations[] }) {
  return (
    <div className={PRODUCT_GRID}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export async function KeywordProductLandingPage({
  config,
}: KeywordProductLandingPageProps) {
  const { products, totalDocs } = await getKeywordLandingProducts(config);
  const section = config.productSection;
  // Only when this edit is empty: pieces from the closest related edit, shown
  // under that edit's own heading so nothing is labelled as something it isn't.
  const relatedConfig =
    products.length === 0 && section?.relatedEdit
      ? getKeywordLandingByTypeSlug(config.type, section.relatedEdit)
      : undefined;
  const relatedSection = relatedConfig?.productSection;
  const related =
    relatedConfig?.searchFilters && relatedSection
      ? await searchLandingProducts(
          relatedConfig.searchFilters,
          RELATED_PRODUCT_LIMIT,
        )
      : null;
  const showProducts = products.length > 0;
  const breadcrumbJsonLd = keywordBreadcrumbJsonLd(config);
  const faqJsonLd = keywordFaqJsonLd(config);
  const itemListJsonLd = keywordItemListJsonLd(config, products);

  // The site layout already provides <main>; this page is a region inside it.
  return (
    <div className="bg-ftt-ivory pb-16 text-ftt-midnight">
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
          className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/75"
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
            <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-[#74531B]">
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#74531B]">
              In this edit
            </p>
            {totalDocs > 0 ? (
              <p className="mt-3 text-sm leading-7 text-ftt-burgundy/70">
                <span className="font-serif text-3xl leading-none text-ftt-navy">
                  {totalDocs}
                </span>{" "}
                {totalDocs === 1 ? "piece" : "pieces"} available now, each one of
                one.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-7 text-ftt-burgundy/70">
                No pieces are available right now. New ones arrive as each saree
                is authenticated and restored.
              </p>
            )}
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

      <section
        aria-labelledby={
          showProducts && section ? "edit-products-title" : undefined
        }
        className="@container mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        {showProducts ? (
          <>
            {section ? (
              <h2
                id="edit-products-title"
                className="mb-6 font-serif text-3xl text-ftt-navy @[44rem]:text-4xl"
              >
                {section.heading}
              </h2>
            ) : null}
            <ProductGrid products={products} />
            {section ? (
              <ProductGridFooter
                href={section.viewAllHref}
                label={section.viewAllLabel}
                shown={products.length}
                total={totalDocs}
              />
            ) : null}
          </>
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
        {relatedSection && related && related.products.length > 0 ? (
          <section aria-labelledby="related-edit-title" className="mt-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#74531B]">
              You may also like
            </p>
            <h2
              id="related-edit-title"
              className="mt-2 mb-6 font-serif text-3xl text-ftt-navy"
            >
              {relatedSection.heading}
            </h2>
            <ProductGrid products={related.products} />
            <ProductGridFooter
              href={relatedSection.viewAllHref}
              label={relatedSection.viewAllLabel}
              shown={related.products.length}
              total={related.totalDocs}
            />
          </section>
        ) : null}
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
    </div>
  );
}
