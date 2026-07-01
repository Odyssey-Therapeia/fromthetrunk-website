"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { trackWebsiteMetric } from "@/lib/analytics/client";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { buildProductCardAlt } from "@/lib/seo/image-alt";
import { cn } from "@/lib/utils";
import { useLiveProductStock } from "@/lib/realtime/use-live-product-stock";
import { useCartStore } from "@/lib/store/cart-store";
import { Badge } from "@/components/ui/badge";
import { WishlistButton } from "@/components/product/wishlist-button";
import { ProductCardCommerceRow } from "@/components/product/product-card-commerce-row";
import { isBlouseProduct } from "@/lib/products/product-type";
import type { Product, StockStatus } from "@/types/domain";

interface ProductCardProps {
  product: Product;
  className?: string;
}

const subscribeToMountedState = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export function ProductCard({ product, className }: ProductCardProps) {
  const hasMounted = useSyncExternalStore(
    subscribeToMountedState,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const primaryImage = resolveMediaURL(product.images?.[0]);
  const productImageAlt = buildProductCardAlt(product);
  const { stockStatus } = useLiveProductStock({
    enabled: false,
    initialStatus: product.stockStatus as StockStatus,
    productId: product.id,
    productSlug: product.slug,
  });
  const hasHydrated = useCartStore((store) => store.hasHydrated);
  const hasCartItem = useCartStore((store) => store.hasItem(product.id));
  const inCart = hasMounted && hasHydrated && hasCartItem;
  const isSold = stockStatus === "sold";
  const isReserved = stockStatus === "reserved";
  const isBlouse = isBlouseProduct(product);
  const trackProductCardClick = () => {
    trackWebsiteMetric("product_card_click", {
      pricePaise: product.pricePaise,
      productId: product.id,
      slug: product.slug,
      source: "product_card",
      stockStatus,
    });
  };

  return (
    <article
      data-ftt-product-card
      data-ftt-in-bag={inCart ? "true" : undefined}
      className={cn(
        "@container ftt-product-card group relative isolate flex h-full min-w-0 transform-gpu flex-col overflow-hidden rounded-[1.35rem] border border-[#E7DDD4]/80 bg-card/80 text-card-foreground shadow-soft transition duration-300 hover:-translate-y-1 hover:border-trunk-gold/40 hover:shadow-lift focus-within:shadow-lift",
        isSold && "opacity-75",
        inCart && "shadow-lift",
        className,
      )}
    >
      <div className="relative">
        <Link
          href={`/collection/${product.slug}`}
          prefetch={false}
          className="block"
          aria-label={`View ${product.name}`}
          onClick={trackProductCardClick}
        >
          <div className="relative aspect-3/4 @sm:aspect-4/5 overflow-hidden">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={productImageAlt}
                fill
                sizes="(max-width: 519px) calc(100vw - 1.5rem), (max-width: 767px) calc(50vw - 1.5rem), (max-width: 1023px) calc(33vw - 1.5rem), (max-width: 1279px) calc(33vw - 2rem), (max-width: 1720px) calc((100vw - 24rem) / 4), 320px"
                quality={70}
                className={cn(
                  "object-cover transition duration-700 group-hover:scale-105",
                  isSold && "grayscale",
                )}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
                No image
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/25 via-black/0 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />

            {isSold && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-3 text-center backdrop-blur-[3px]">
                <Badge className="bg-foreground/90 text-background shadow-soft">
                  Sold out
                </Badge>
                <p className="max-w-[15rem] text-[10px] font-medium leading-snug text-white/90 @sm:text-[11px]">
                  We&apos;ll notify you if something like this comes back. Till
                  then, shop with us.
                </p>
              </div>
            )}
            {isReserved && (
              <Badge className="absolute left-2 top-2 @sm:left-4 @sm:top-4 bg-[#B39152]/18 text-[10px] text-[#601D1C] shadow-soft @sm:text-xs">
                Reserved
              </Badge>
            )}

            {!isSold && !isReserved && !isBlouse && product.originalPricePaise && (
              <Badge className="absolute left-2 top-2 @sm:left-4 @sm:top-4 text-[10px] @sm:text-xs bg-white/85 text-trunk-brown shadow-soft">
                Pre-loved
              </Badge>
            )}
          </div>
        </Link>
        {!isSold && (
          <div className="absolute right-2 top-2 @sm:right-3 @sm:top-3 z-10">
            <WishlistButton
              productId={product.id}
              productName={product.name}
              className="h-7 w-7 @sm:h-8 @sm:w-8 bg-white/80 shadow-sm backdrop-blur hover:bg-white"
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-2 @sm:p-4">
        <Link
          href={`/collection/${product.slug}`}
          prefetch={false}
          className="block min-w-0 flex-1 space-y-1 @sm:space-y-1.5"
          onClick={trackProductCardClick}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <h3 className="line-clamp-2 max-w-full break-words font-serif text-[15px] font-semibold leading-[1.08] text-[#141D46] @sm:text-lg @md:text-xl">
                {product.name}
              </h3>
              <p className="mt-1 line-clamp-1 max-w-full break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-[#601D1C]/72 @sm:text-xs @sm:tracking-[0.18em]">
                <span>{product.detailsFabric ?? "Heirloom"}</span>
                <span className="hidden @sm:inline">, unique</span>
              </p>
            </div>
            <ArrowUpRight className="mt-0.5 hidden @sm:block h-5 w-5 shrink-0 text-muted-foreground transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="flex items-center gap-1 @sm:gap-2">
            <span
              className={cn(
                "text-[15px] font-bold leading-none @sm:text-base",
                isSold
                  ? "text-muted-foreground line-through"
                  : "text-[#141D46]",
              )}
            >
              {formatCurrency(product.pricePaise / 100)}
            </span>
            {product.originalPricePaise && !isSold && (
              <span className="text-[11px] text-[#601D1C]/45 line-through @sm:text-xs">
                {formatCurrency(product.originalPricePaise / 100)}
              </span>
            )}
          </div>
          <p className="hidden @sm:block text-sm text-muted-foreground">
            {product.storyTitle ?? "A story from the trunk"}
          </p>
        </Link>
        <ProductCardCommerceRow product={{ ...product, stockStatus }} />
      </div>
    </article>
  );
}
