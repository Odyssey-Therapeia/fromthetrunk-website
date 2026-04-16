"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

import { ProductsGrid } from "@/components/admin/products/products-grid";
import { ProductsToolbar } from "@/components/admin/products/products-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts } from "@/lib/hooks/use-products";

export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");

  const { data: products, isLoading, refetch } = useProducts({
    search,
    status,
    stockStatus,
  });

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/v2/products/${id}/duplicate`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to duplicate");
        toast.success("Product duplicated");
        void refetch();
      } catch {
        toast.error("Failed to duplicate product");
      }
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this product?")) return;
      try {
        const res = await fetch(`/api/v2/products/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        toast.success("Product deleted");
        void refetch();
      } catch {
        toast.error("Failed to delete product");
      }
    },
    [refetch],
  );

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/products?includeDrafts=true&limit=1000");
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();

      const headers = ["Name", "Slug", "Price (Paise)", "Status", "Stock Status", "Fabric", "Story Title"];
      const rows = data.map((p: Record<string, unknown>) =>
        [p.name, p.slug, p.pricePaise, p.status, p.stockStatus, p.detailsFabric ?? "", p.storyTitle].join(","),
      );
      const csv = [headers.join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ftt-products-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Products exported");
    } catch {
      toast.error("Export failed");
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          Catalog
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Products</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your saree catalog.
        </p>
      </div>

      <ProductsToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        stockStatus={stockStatus}
        onStockStatusChange={setStockStatus}
        onExport={handleExport}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={`product-skeleton-${i}`} className="rounded-2xl border border-border/70 bg-card/85 p-0">
              <Skeleton className="aspect-[3/4] w-full rounded-t-2xl" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ProductsGrid
          products={products ?? []}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
