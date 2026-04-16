"use client";

import Image from "next/image";
import Link from "next/link";
import { Edit, Copy, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/db/money";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/lib/hooks/use-products";

type ProductCardProps = {
  product: ProductListItem;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
};

const stockColors = {
  available: "border-green-300 text-green-700 bg-green-50",
  reserved: "border-amber-300 text-amber-700 bg-amber-50",
  sold: "border-red-300 text-red-700 bg-red-50",
} as const;

export function ProductCard({ product, onDuplicate, onDelete }: ProductCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/admin/products/${product.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
          {product.thumbnailUrl ? (
            <Image
              src={product.thumbnailUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="text-sm">No image</span>
            </div>
          )}
        </div>
      </Link>

      <div className="space-y-2 p-4">
        <Link href={`/admin/products/${product.id}`}>
          <h3 className="truncate text-sm font-medium">{product.name}</h3>
        </Link>
        <p className="text-base font-semibold">{formatINR(product.pricePaise)}</p>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wider",
              product.status === "published"
                ? "border-green-300 text-green-700"
                : "border-border text-muted-foreground",
            )}
          >
            {product.status}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-[10px] uppercase tracking-wider", stockColors[product.stockStatus])}
          >
            {product.stockStatus}
          </Badge>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          asChild
          size="icon"
          variant="secondary"
          className="h-8 w-8 rounded-full shadow-sm"
        >
          <Link href={`/admin/products/${product.id}`}>
            <Edit className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {onDuplicate && (
          <Button
            onClick={(e) => {
              e.preventDefault();
              onDuplicate(product.id);
            }}
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full shadow-sm"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button
            onClick={(e) => {
              e.preventDefault();
              onDelete(product.id);
            }}
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
