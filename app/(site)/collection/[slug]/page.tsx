import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Gem,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import { ProductGallery } from "@/components/product/product-gallery";
import { ProductCard } from "@/components/product/product-card";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { BlousePurchaseControls } from "@/components/product/blouse-purchase-controls";
import { ProductViewTracker } from "@/components/product/product-view-tracker";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { WishlistButton } from "@/components/product/wishlist-button";
import { RestockNotifyButton } from "@/components/product/restock-notify-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatCurrency } from "@/lib/formatters";
import { getProductBySlug, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import {
  getProductDisplayDetails,
  type ProductDisplayDetails,
} from "@/lib/products/display-details";
import { productJsonLd, breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/json-ld";
import { buildPdpTitle, buildPdpDescription } from "@/lib/seo/pdp-meta";
import { getSiteOrigin } from "@/lib/config/site";
import { absoluteUrl } from "@/lib/seo/site-url";
import { toSeoImageUrl } from "@/lib/seo/image-urls";
import { buildPdpGalleryImageAlt } from "@/lib/seo/image-alt";
import {
  productSeoRobots,
  isSeoEligibleProduct,
  shouldEmitProductJsonLd,
} from "@/lib/seo/product-indexing";
import {
  DEFAULT_TWITTER_CARD,
  OG_LOCALE,
  SITE_NAME,
  seoImageMetadata,
} from "@/lib/seo/metadata";
import { getFabricLandingForLabel } from "@/lib/seo/keyword-landing-pages";
import { resolveProductRowStockStatus } from "@/db/inventory";
import { isBlouseProduct } from "@/lib/products/product-type";
import type { Product } from "@/types/domain";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

type EffectiveStockStatus = "available" | "reserved" | "sold";

const PDP_SUPPORT_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/packing", label: "Packing" },
  { href: "/policies/shipping-delivery-policy", label: "Shipping" },
  { href: "/policies/return-refund-policy", label: "Returns" },
] as const;

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const rawProduct = await getProductBySlug(slug);

  if (!rawProduct) {
    return { title: "Product Not Found" };
  }

  const product = rawProduct as Product;
  const displayDetails = getProductDisplayDetails(product);
  const isEligibleForProductSocialPreview = isSeoEligibleProduct(product);
  const primaryImage = product.images?.[0] as
    | {
        media?: {
          alt?: null | string;
          height?: null | number;
          width?: null | number;
        };
      }
    | undefined;
  const image = resolveMediaURL(product.images?.[0]);
  const imageUrl =
    isEligibleForProductSocialPreview ? (toSeoImageUrl(image) ?? undefined) : undefined;
  const canonical = absoluteUrl(`/collection/${product.slug}`);

  const pdpTitle = isEligibleForProductSocialPreview
    ? buildPdpTitle(product.name, displayDetails.fabric)
    : "From the Trunk Product";
  const pdpDescription = isEligibleForProductSocialPreview
    ? buildPdpDescription(
        product.name,
        displayDetails.fabric,
        product.storyNarrative,
        product.storyTitle,
      )
    : "Explore authenticated pre-loved luxury sarees from From the Trunk.";
  const socialImage = seoImageMetadata(
    imageUrl
      ? {
          url: imageUrl,
          width: primaryImage?.media?.width,
          height: primaryImage?.media?.height,
          alt: primaryImage?.media?.alt ?? buildPdpGalleryImageAlt(product, 0),
        }
      : undefined,
  );

  return {
    title: pdpTitle,
    description: pdpDescription,
    alternates: {
      canonical,
    },
    robots: productSeoRobots(product),
    openGraph: {
      title: pdpTitle,
      description: pdpDescription,
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images: [socialImage],
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title: pdpTitle,
      description: pdpDescription,
      images: [socialImage],
    },
  };
}

export default async function SareePage({ params }: ProductPageProps) {
  const { isEnabled: includeDrafts } = await draftMode();
  const { slug } = await params;
  const rawProduct = await getProductBySlug(slug, { includeDrafts });

  if (!rawProduct) {
    return notFound();
  }

  const product = rawProduct as Product;
  const isBlouse = isBlouseProduct(product);
  const includeProductSeo = shouldEmitProductJsonLd(product);
  const effectiveStockStatus: EffectiveStockStatus = resolveProductRowStockStatus({
    reservedUntil: product.reservedUntil,
    stockStatus: product.stockStatus,
  });

  const displayDetails = getProductDisplayDetails(product);
  const fabricLanding = getFabricLandingForLabel(displayDetails.fabric);
  const images = (product.images ?? [])
    .map((img) => resolveMediaURL(img as unknown))
    .filter(Boolean) as string[];
  const imageAlts = images.map((_, index) =>
    buildPdpGalleryImageAlt(product, index),
  );
  const tags = product.tags.map((tag) => tag.name).filter(Boolean);
  const jsonLd = includeProductSeo ? productJsonLd(product) : null;
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Home", url: getSiteOrigin() },
    { name: "Collection", url: absoluteUrl("/collection") },
    { name: product.name, url: absoluteUrl(`/collection/${product.slug}`) },
  ]);

  const allProducts = await getProducts(12, { includeDrafts });
  const related = rankRelatedProducts(
    product,
    (allProducts.docs as Product[]).filter((item) => item.slug !== product.slug),
    displayDetails,
  ).slice(0, 4);

  return (
    <main className="bg-[#FDF7F1] pb-24 text-[#0E0D0E] md:pb-0">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }}
      />
      <ProductViewTracker
        id={product.id}
        slug={product.slug}
        name={product.name}
        price={product.pricePaise / 100}
        image={images[0] ?? ""}
      />

      <div className="mx-auto w-full max-w-[1440px] space-y-7 px-4 py-4 sm:px-6 sm:py-6 lg:space-y-9 lg:px-8 lg:py-7">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#601D1C]/55"
        >
          <Link href="/" className="transition hover:text-[#141D46]">
            Home
          </Link>
          <span>/</span>
          <Link href="/collection" className="transition hover:text-[#141D46]">
            Collection
          </Link>
          <span>/</span>
          <span className="max-w-[18rem] truncate text-[#141D46]">
            Product dossier
          </span>
        </nav>

        <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.58fr)] md:items-stretch md:[--pdp-panel-height:min(72vh,760px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.58fr)] lg:gap-7 lg:[--pdp-panel-height:min(74vh,800px)]">
          <ProductGallery
            images={images}
            alt={imageAlts[0] ?? product.name}
            imageAlts={imageAlts}
          />

          <aside className="h-full rounded-[1.15rem] border border-[#E7DDD4] bg-[#FFFCF8]/88 p-4 shadow-[0_14px_38px_rgba(20,29,70,0.06)] backdrop-blur md:min-h-[var(--pdp-panel-height)] lg:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
                    Product Dossier
                  </p>
                  <p className="mt-1 text-xs text-[#141D46]/52">
                    {isBlouse ? "Tailored blouse" : "Unique circular saree"}
                  </p>
                </div>
                <StockBadge stockStatus={effectiveStockStatus} />
              </div>

              <h1 className="mt-4 font-serif text-[clamp(2rem,3.2vw,3.35rem)] leading-[0.93] text-[#601D1C]">
                {product.name}
              </h1>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#141D46]/68">
                {product.storyTitle || "A restored heirloom from the trunk."}
              </p>

              <div className="mt-4 grid gap-2 min-[420px]:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                <TrustSignal
                  icon={<BadgeCheck />}
                  label="Verified"
                  value="By FTT"
                />
                <TrustSignal
                  icon={<ShieldCheck />}
                  label="Condition"
                  value="Graded"
                />
                <TrustSignal icon={<Gem />} label="Edition" value="1 of 1" />
                <TrustSignal
                  icon={<Sparkles />}
                  label="Origin"
                  value={product.storyProvenance || "Private trunk"}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3 border-y border-[#E7DDD4] py-3">
                <span className="text-2xl font-semibold text-[#141D46]">
                  {formatCurrency(product.pricePaise / 100)}
                </span>
                {product.originalPricePaise ? (
                  <span className="pb-0.5 text-sm text-[#601D1C]/45 line-through">
                    {formatCurrency(product.originalPricePaise / 100)}
                  </span>
                ) : null}
                {product.storyEra ? (
                  <span className="ml-auto rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-1 text-xs text-[#601D1C]/70">
                    {product.storyEra}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <DossierFact label="Fabric" value={displayDetails.fabric} />
                <DossierFact label="Grade" value={displayDetails.condition} />
                <DossierFact label="Length" value={displayDetails.length} />
                <DossierFact label="Width" value={displayDetails.width} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {fabricLanding ? (
                  <Link
                    href={fabricLanding.canonicalPath}
                    className="rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-1.5 text-[11px] font-medium text-[#601D1C]/70 transition hover:border-[#B39152] hover:text-[#141D46]"
                  >
                    More {displayDetails.fabric} sarees
                  </Link>
                ) : null}
                <Link
                  href="/guides/what-is-a-pre-loved-saree"
                  className="rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-1.5 text-[11px] font-medium text-[#601D1C]/70 transition hover:border-[#B39152] hover:text-[#141D46]"
                >
                  What pre-loved means
                </Link>
              </div>

              <div className="mt-4 space-y-2.5">
                {isBlouse ? (
                  <BlousePurchaseControls
                    product={product}
                    initialStatus={effectiveStockStatus}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <AddToCartButton
                        product={product}
                        initialStatus={effectiveStockStatus}
                      />
                    </div>
                    <WishlistButton
                      productId={product.id}
                      productName={product.name}
                      className="h-11 w-11 shrink-0 border border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C] hover:bg-[#601D1C] hover:text-[#FDF7F1]"
                    />
                  </div>
                )}

                {effectiveStockStatus === "available" ? (
                  <p className="text-xs leading-5 text-[#141D46]/58">
                    Adding this piece reserves the unique piece in your bag.
                    Final ownership is confirmed at checkout.
                  </p>
                ) : (
                  <div className="space-y-2 rounded-xl border border-[#601D1C]/16 bg-[#601D1C]/5 p-3">
                    <p className="text-xs leading-5 text-[#601D1C]/75">
                      {effectiveStockStatus === "sold"
                        ? "This piece has found its next wardrobe."
                        : "This piece is currently reserved by another buyer."}
                    </p>
                    <RestockNotifyButton
                      productId={product.id}
                      productName={product.name}
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2 rounded-[1rem] border border-[#141D46]/10 bg-[#141D46] p-3 text-[#FDF7F1]">
                <TrustLine icon={<ShieldCheck />} text="Authenticated by hand" />
                <TrustLine icon={<PackageCheck />} text="Packed with muslin care" />
                <TrustLine icon={<Truck />} text="Shipping at checkout" />
              </div>

              <nav
                aria-label="Product trust and support"
                className="mt-3 flex flex-wrap gap-2"
              >
                {PDP_SUPPORT_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-1.5 text-[11px] font-medium text-[#601D1C]/70 transition hover:border-[#B39152] hover:text-[#141D46]"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              <Accordion
                type="single"
                collapsible
                className="mt-3 border-t border-[#E7DDD4]"
              >
                <AccordionItem value="story" className="border-[#E7DDD4]">
                  <AccordionTrigger className="text-sm text-[#141D46]">
                    Story and provenance
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm leading-6 text-[#141D46]/65">
                    <p>
                      {product.storyNarrative ||
                        "This saree has been reviewed, restored, and prepared for its next chapter."}
                    </p>
                    {product.storyProvenance ? (
                      <p>
                        <span className="font-semibold text-[#141D46]">
                          Provenance:
                        </span>{" "}
                        {product.storyProvenance}
                      </p>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="care" className="border-[#E7DDD4]">
                  <AccordionTrigger className="text-sm text-[#141D46]">
                    Care and ownership
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-[#141D46]/65">
                    Dry clean only. Store folded in muslin, away from direct
                    sunlight and humidity. Shipping and taxes are calculated at
                    checkout.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="measurements" className="border-[#E7DDD4]">
                  <AccordionTrigger className="text-sm text-[#141D46]">
                    Measurements
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-[#141D46]/65">
                    Length: {displayDetails.length}. Width:{" "}
                    {displayDetails.width}. Condition:{" "}
                    {displayDetails.condition}.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
          </aside>
        </section>

        <section className="overflow-hidden rounded-[1.25rem] border border-[#141D46]/10 bg-[#141D46] p-4 text-[#FDF7F1] shadow-[0_16px_42px_rgba(20,29,70,0.13)] sm:p-5 lg:grid lg:grid-cols-[0.9fr_1.4fr] lg:items-center lg:gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
                Provenance Promise
              </p>
              <h2 className="mt-2 max-w-xl font-serif text-[clamp(1.7rem,2.6vw,2.7rem)] leading-[0.98]">
                Not just pre-loved. Carefully re-stored.
              </h2>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:mt-0">
              <PromiseStat label="Authenticated" value="By hand" />
              <PromiseStat label="Condition" value={displayDetails.condition} />
              <PromiseStat label="Ownership" value="Unique" />
            </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon={<Gem />}
            title="Provenance"
            body={
              product.storyProvenance ||
              "Sourced from a private trunk and reviewed before listing."
            }
          />
          <InfoCard
            icon={<ShieldCheck />}
            title="Condition"
            body={displayDetails.condition}
          />
          <InfoCard
            icon={<Sparkles />}
            title="Textile"
            body={
              displayDetails.designer
                ? `${displayDetails.fabric} by ${displayDetails.designer}`
                : displayDetails.fabric
            }
          />
          <InfoCard
            icon={<Ruler />}
            title="Measurements"
            body={`${displayDetails.length}. ${displayDetails.width}.`}
          />
          <InfoCard
            icon={<PackageCheck />}
            title="Care"
            body="Dry clean only. Store in muslin and keep away from direct sunlight."
          />
          <InfoCard
            icon={<Truck />}
            title="Shipping and ownership"
            body="Secure packing. Shipping and taxes are calculated at checkout."
          />
        </section>

        {tags.length > 0 ? (
          <section className="flex flex-wrap gap-2 border-y border-[#E7DDD4] py-5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#E7DDD4] bg-[#FFFCF8] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#601D1C]/65"
              >
                {tag}
              </span>
            ))}
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
                  Curation
                </p>
                <h2 className="mt-2 font-serif text-[clamp(2.1rem,4vw,4rem)] leading-none text-[#601D1C]">
                  Pieces from a similar chapter.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#141D46]/58">
                Selected by fabric, era, and the quiet details that make this
                saree feel connected to the rest of the trunk.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        ) : null}

        <RecentlyViewed excludeId={product.id} limit={6} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E7DDD4] bg-[#FDF7F1]/96 px-3 py-3 shadow-[0_-14px_34px_rgba(20,29,70,0.10)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-screen-sm items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[#141D46]/62">
              {product.name}
            </p>
            <p className="text-base font-semibold text-[#141D46]">
              {formatCurrency(product.pricePaise / 100)}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            {isBlouse ? (
              <Button asChild className="w-full rounded-full py-6">
                <a href="#blouse-size-selector">Select size</a>
              </Button>
            ) : (
              <AddToCartButton
                product={product}
                initialStatus={effectiveStockStatus}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function rankRelatedProducts(
  product: Product,
  candidates: Product[],
  displayDetails: ProductDisplayDetails,
) {
  const productTags = new Set(product.tags.map((tag) => tag.name));
  const normalizedFabric = displayDetails.fabric.toLowerCase();
  const normalizedEra = product.storyEra?.toLowerCase() ?? "";

  return candidates
    .map((candidate) => {
      const candidateDisplayDetails = getProductDisplayDetails(candidate);
      const candidateTags = new Set(candidate.tags.map((tag) => tag.name));
      let score = 0;

      if (
        normalizedEra &&
        candidate.storyEra?.toLowerCase() === normalizedEra
      ) {
        score += 3;
      }

      if (
        normalizedFabric &&
        candidateDisplayDetails.fabric.toLowerCase() === normalizedFabric
      ) {
        score += 2;
      }

      for (const tag of productTags) {
        if (candidateTags.has(tag)) {
          score += 1;
          break;
        }
      }

      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate);
}

function StockBadge({ stockStatus }: { stockStatus: EffectiveStockStatus }) {
  const label =
    stockStatus === "available"
      ? "In stock"
      : stockStatus === "reserved"
        ? "Reserved"
        : "Sold";

  return (
    <Badge
      className={
        stockStatus === "available"
          ? "rounded-full border border-[#141D46]/15 bg-[#141D46]/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#141D46] shadow-none"
          : "rounded-full border border-[#601D1C]/20 bg-[#601D1C]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#601D1C] shadow-none"
      }
    >
      {label}
    </Badge>
  );
}

function DossierFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]/80 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#B39152]">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[#141D46] sm:text-sm">
        {value}
      </p>
    </div>
  );
}

function TrustSignal({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]/72 p-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#B39152]/12 text-[#B39152] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#601D1C]/52">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs font-medium text-[#141D46]">
          {value}
        </span>
      </span>
    </div>
  );
}

function TrustLine({
  icon,
  text,
}: {
  icon: ReactElement;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-[#FDF7F1]/78">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#B39152]/14 text-[#B39152] [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

function PromiseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
        {label}
      </p>
      <p className="mt-1.5 line-clamp-2 font-serif text-xl leading-none text-[#FDF7F1]">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: ReactElement;
  title: string;
  body: string;
}) {
  return (
    <article className="h-full rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8]/82 p-4 shadow-[0_14px_34px_rgba(20,29,70,0.05)]">
      <div className="mb-4 grid h-9 w-9 place-items-center rounded-full bg-[#141D46] text-[#B39152] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <h3 className="font-serif text-[1.45rem] leading-none text-[#601D1C]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#141D46]/62">{body}</p>
    </article>
  );
}
