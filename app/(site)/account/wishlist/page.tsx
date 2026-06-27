"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Sparkles } from "lucide-react";

import { ProductCard } from "@/components/product/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/domain";

const fetchWishlist = async (): Promise<Product[]> => {
  const wishlistResponse = await fetch("/api/v2/wishlist");
  if (!wishlistResponse.ok) return [];
  const wishlistIds = (await wishlistResponse.json()) as string[];
  if (wishlistIds.length === 0) return [];

  const params = new URLSearchParams({
    ids: wishlistIds.join(","),
  });
  const productsResponse = await fetch(`/api/v2/products?${params.toString()}`);
  if (!productsResponse.ok) return [];
  const products = (await productsResponse.json()) as Product[];
  const productById = new Map(products.map((product) => [product.id, product]));

  return wishlistIds
    .map((id) => productById.get(id) ?? null)
    .filter((product): product is Product => Boolean(product));
};

export default function WishlistPage() {
  const { data: session, status } = useSession();

  const { data: products, isLoading, isError } = useQuery({
    queryKey: ["wishlist", "products"],
    queryFn: fetchWishlist,
    enabled: Boolean(session?.user?.id),
  });

  if (status === "loading") {
    return <WishlistState message="Loading your saved pieces..." />;
  }

  if (!session?.user?.id) {
    return (
      <WishlistState message="Please sign in to view your wishlist.">
        <Button asChild className="mt-4 rounded-full bg-ftt-navy text-ftt-ivory">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </WishlistState>
    );
  }

  const items = products ?? [];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[1.75rem] border border-ftt-border bg-ftt-card shadow-[0_18px_50px_rgba(20,29,70,0.09)]">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
              Wishlist
            </p>
            <h2 className="mt-2 font-serif text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.94] text-ftt-navy">
              Pieces you are thinking about.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ftt-burgundy/60">
              Save a saree while you decide. Every piece is unique, so this
              is a quiet place to compare what still feels like yours.
            </p>
          </div>

          <div className="rounded-[1.35rem] bg-ftt-navy p-5 text-ftt-ivory">
            <Heart className="size-5 text-ftt-gold" />
            <p className="mt-8 font-serif text-4xl leading-none">
              {items.length}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ftt-ivory/58">
              Saved piece{items.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <WishlistState message="Loading wishlist..." />
      ) : isError ? (
        <WishlistState message="Unable to load wishlist right now." />
      ) : items.length === 0 ? (
        <div className="ftt-account-glow-card rounded-[1.75rem] border border-dashed border-ftt-border bg-ftt-card p-8 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-ftt-navy text-ftt-gold">
            <Sparkles className="size-5" />
          </div>
          <Badge className="mt-5 rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-ftt-gold">
            Waiting for a favourite
          </Badge>
          <h3 className="mx-auto mt-5 max-w-xl font-serif text-[clamp(2rem,4vw,3.65rem)] leading-none text-ftt-navy">
            Your saved trunk is still empty.
          </h3>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-ftt-burgundy/60">
            Tap the heart on any saree to keep it here while you choose your
            next heirloom.
          </p>
          <Button
            asChild
            className="mt-6 rounded-full bg-ftt-navy px-7 text-ftt-ivory hover:bg-ftt-midnight"
          >
            <Link href="/collection">Browse the collection</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:gap-5 xl:grid-cols-3">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

function WishlistState({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ftt-border bg-ftt-card p-6 text-sm leading-6 text-ftt-burgundy/60 shadow-sm">
      {message}
      {children}
    </div>
  );
}
