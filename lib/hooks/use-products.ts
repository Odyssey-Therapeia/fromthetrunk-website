"use client";

import { useQuery } from "@tanstack/react-query";

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  pricePaise: number;
  originalPricePaise: number | null;
  status: "draft" | "published";
  stockStatus: "available" | "reserved" | "sold";
  storyTitle: string;
  featured: boolean;
  thumbnailUrl: string | null;
  collection: { id: string; name: string } | null;
};

type UseProductsOptions = {
  search?: string;
  status?: string;
  stockStatus?: string;
};

export function useProducts(options: UseProductsOptions = {}) {
  return useQuery({
    queryKey: ["admin", "products", options],
    queryFn: async (): Promise<ProductListItem[]> => {
      const params = new URLSearchParams();
      params.set("includeDrafts", "true");
      params.set("limit", "200");

      const res = await fetch(`/api/v2/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load products");
      const data: ProductListItem[] = await res.json();

      let filtered = data;

      if (options.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.storyTitle.toLowerCase().includes(q) ||
            p.slug.toLowerCase().includes(q),
        );
      }
      if (options.status && options.status !== "all") {
        filtered = filtered.filter((p) => p.status === options.status);
      }
      if (options.stockStatus && options.stockStatus !== "all") {
        filtered = filtered.filter((p) => p.stockStatus === options.stockStatus);
      }

      return filtered;
    },
  });
}
