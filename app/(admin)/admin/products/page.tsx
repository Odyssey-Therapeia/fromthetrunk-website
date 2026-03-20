"use client";

import Link from "next/link";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/db/money";

type ProductRow = {
  id: string;
  images: Array<{ media: { url: string } }>;
  pricePaise: number;
  slug: string;
  status: "draft" | "published";
  stockStatus: "available" | "reserved" | "sold";
  storyTitle: string;
  thumbnailUrl?: null | string;
};

const statusBadgeVariant: Record<ProductRow["status"], "default" | "outline"> = {
  draft: "outline",
  published: "default",
};

const stockBadgeVariant: Record<
  ProductRow["stockStatus"],
  "default" | "destructive" | "outline" | "secondary"
> = {
  available: "secondary",
  reserved: "outline",
  sold: "destructive",
};

export default function AdminProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | ProductRow["status"]>("all");
  const [stockFilter, setStockFilter] = useState<"all" | ProductRow["stockStatus"]>("all");
  const [deleteTarget, setDeleteTarget] = useState<null | ProductRow>(null);
  const [pendingActionId, setPendingActionId] = useState<null | string>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v2/products?includeDrafts=true");
      if (!response.ok) {
        throw new Error(`Failed to load products (${response.status})`);
      }
      const data = (await response.json()) as ProductRow[];
      setRows(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load products.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [searchQuery, statusFilter, stockFilter]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        row.storyTitle.toLowerCase().includes(normalizedSearch) ||
        row.slug.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesStock = stockFilter === "all" || row.stockStatus === stockFilter;
      return matchesSearch && matchesStatus && matchesStock;
    });
  }, [rows, searchQuery, statusFilter, stockFilter]);

  const readErrorMessage = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        return data.message;
      }
    } catch {
      // fall through to generic status message
    }
    return `Request failed with ${response.status}`;
  };

  const toggleProductStatus = useCallback(async (product: ProductRow) => {
    const nextStatus = product.status === "published" ? "draft" : "published";
    setPendingActionId(product.id);
    try {
      const response = await fetch(`/api/v2/products/${product.id}`, {
        body: JSON.stringify({ status: nextStatus }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setRows((current) =>
        current.map((row) =>
          row.id === product.id
            ? {
                ...row,
                status: nextStatus,
              }
            : row
        )
      );
      toast.success(nextStatus === "published" ? "Product published." : "Product moved to draft.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update product status.");
    } finally {
      setPendingActionId(null);
    }
  }, []);

  const duplicateExistingProduct = useCallback(async (product: ProductRow) => {
    setPendingActionId(product.id);
    try {
      const response = await fetch(`/api/v2/products/${product.id}/duplicate`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const duplicated = (await response.json()) as ProductRow;
      setRows((current) => [duplicated, ...current]);
      toast.success("Product duplicated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to duplicate product.");
    } finally {
      setPendingActionId(null);
    }
  }, []);

  const confirmDeleteProduct = useCallback(async () => {
    if (!deleteTarget) return;
    setPendingActionId(deleteTarget.id);
    try {
      const response = await fetch(`/api/v2/products/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      toast.success("Product deleted.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete product.");
    } finally {
      setPendingActionId(null);
    }
  }, [deleteTarget]);

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        id: "thumbnail",
        header: "Image",
        cell: ({ row }) => {
          const imageUrl = row.original.thumbnailUrl ?? row.original.images[0]?.media.url ?? null;
          return (
            <div className="h-16 w-12 max-w-12 min-w-12 overflow-hidden rounded-md border bg-muted/30">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={row.original.storyTitle}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  src={imageUrl}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  No image
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "storyTitle",
        header: "Title",
        cell: ({ row }) => <span className="line-clamp-2">{row.original.storyTitle}</span>,
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => <span className="line-clamp-2">{row.original.slug}</span>,
      },
      {
        accessorKey: "pricePaise",
        header: "Price",
        sortingFn: "basic",
        cell: ({ row }) => <span className="whitespace-nowrap">{formatINR(row.original.pricePaise)}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <Badge variant={statusBadgeVariant[row.original.status]}>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "stockStatus",
        header: "Stock",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <Badge variant={stockBadgeVariant[row.original.stockStatus]}>
            {row.original.stockStatus}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Open row actions"
                disabled={pendingActionId === row.original.id}
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/products/${row.original.id}`}>Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleProductStatus(row.original)}>
                {row.original.status === "published" ? "Move to draft" : "Publish"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void duplicateExistingProduct(row.original)}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(row.original)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [duplicateExistingProduct, pendingActionId, toggleProductStatus]
  );

  const table = useReactTable({
    columns,
    data: filteredRows,
    getPaginationRowModel: getPaginationRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <p className="text-sm text-muted-foreground">Manage inventory and stories.</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">New Product</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <Input
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by title or slug..."
          value={searchQuery}
        />
        <Select onValueChange={(value: "all" | ProductRow["status"]) => setStatusFilter(value)} value={statusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value: "all" | ProductRow["stockStatus"]) => setStockFilter(value)}
          value={stockFilter}
        >
          <SelectTrigger>
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock states</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  className={
                    header.id === "thumbnail"
                      ? "w-[88px]"
                      : header.id === "actions"
                        ? "w-[72px] text-right"
                        : ""
                  }
                  key={header.id}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                {columns.map((column, columnIndex) => (
                  <TableCell key={`${index}-${column.id ?? columnIndex}`}>
                    <Skeleton className="h-4 w-full max-w-[200px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={
                      cell.column.id === "thumbnail"
                        ? "w-[88px]"
                        : cell.column.id === "actions"
                          ? "text-right"
                          : ""
                    }
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="py-10 text-center text-muted-foreground" colSpan={columns.length}>
                No products match your current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {filteredRows.length} products
        </p>
        <div className="flex items-center gap-2">
          <Select
            onValueChange={(value) => table.setPageSize(Number(value))}
            value={String(table.getState().pagination.pageSize)}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / page</SelectItem>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && setDeleteTarget(null)} open={Boolean(deleteTarget)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.storyTitle || "this product"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteTarget(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={pendingActionId === deleteTarget?.id}
              onClick={() => void confirmDeleteProduct()}
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
