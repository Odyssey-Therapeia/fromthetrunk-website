import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/domain";

type EmptyCartProps = {
  featuredPicks: Product[];
};

/** Shown when the bag is empty: an invitation plus a few featured pieces. */
export function EmptyCart({ featuredPicks }: EmptyCartProps) {
  return (
    <div className="space-y-12">
      <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-ftt-border bg-ftt-card p-10 text-center shadow-[var(--ftt-soft-shadow)] sm:p-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#74531B]">
          Your bag is empty
        </p>
        <h2 className="mt-4 font-serif text-3xl text-ftt-navy">
          Add a treasure to continue
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ftt-burgundy">
          Browse our curated collection of pre-loved luxury sarees and return
          here to complete your acquisition.
        </p>
        <Button
          asChild
          className="mt-8 rounded-full bg-ftt-navy px-10 py-6 text-ftt-ivory hover:bg-ftt-midnight"
        >
          <Link
            href="/collection"
            className="text-[10px] font-semibold uppercase tracking-[0.15em]"
          >
            Explore the collection
          </Link>
        </Button>
      </div>

      {featuredPicks.length > 0 ? (
        <section className="space-y-8">
          <div className="space-y-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#74531B]">
              Featured picks
            </p>
            <h2 className="font-serif text-3xl text-ftt-navy">
              Treasures to begin with
            </h2>
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 md:grid-cols-3">
            {featuredPicks.map((product, index) => {
              const imageSrc = resolveMediaURL(product.images?.[0]);
              return (
                <Link
                  key={product.id}
                  href={`/collection/${product.slug}`}
                  className="group flex flex-col items-center gap-5 rounded-3xl border border-ftt-border bg-ftt-card p-6 shadow-[var(--ftt-soft-shadow)] transition-all hover:-translate-y-1"
                >
                  <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-ftt-ivory">
                    {imageSrc ? (
                      <Image
                        src={imageSrc}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 33vw"
                        loading={index === 0 ? "eager" : "lazy"}
                        className="object-cover transition duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/50">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-center">
                    <p className="font-serif text-lg text-ftt-navy">
                      {product.name}
                    </p>
                    <p className="text-sm font-semibold text-ftt-burgundy">
                      {formatCurrency(product.pricePaise / 100)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
