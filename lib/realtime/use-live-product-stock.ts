"use client";

import { useCallback, useMemo } from "react";

import { useElectricShapeRows } from "@/lib/realtime/use-electric-shape";

type StockStatus = "available" | "reserved" | "sold";

type LiveProductStockOptions = {
  enabled?: boolean;
  initialStatus: StockStatus;
  productId: string;
  productSlug: string;
};

type ProductStockRow = {
  id: string;
  reservedUntil: null | string;
  stockStatus: StockStatus;
};

const STOCK_FALLBACK_CACHE_MS = 5_000;

const fallbackStockCache = new Map<
  string,
  { expiresAt: number; rows: ProductStockRow[] }
>();
const fallbackStockRequests = new Map<string, Promise<ProductStockRow[]>>();

const toFallbackStockRow = (
  productId: string,
  stockStatus: StockStatus,
): ProductStockRow => ({
  id: productId,
  reservedUntil: null,
  stockStatus,
});

const normalizeStockRow = (
  value: unknown,
  fallbackStatus: StockStatus
): ProductStockRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stockStatus =
    (typeof row.stockStatus === "string" ? row.stockStatus : row.stock_status) ??
    fallbackStatus;

  const normalizedStatus: StockStatus =
    stockStatus === "reserved" || stockStatus === "sold" ? stockStatus : "available";

  return {
    id: String(row.id ?? ""),
    reservedUntil:
      typeof row.reservedUntil === "string"
        ? row.reservedUntil
        : typeof row.reserved_until === "string"
          ? row.reserved_until
          : null,
    stockStatus: normalizedStatus,
  };
};

const fetchFallbackStockRows = ({
  initialStatus,
  productId,
  productSlug,
}: Pick<LiveProductStockOptions, "initialStatus" | "productId" | "productSlug">) => {
  const cacheKey = productSlug;
  const cached = fallbackStockCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.rows);
  }

  const inFlight = fallbackStockRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = fetch(`/api/v2/products/${encodeURIComponent(productSlug)}/stock`, {
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return [toFallbackStockRow(productId, initialStatus)];
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const row = normalizeStockRow(payload, initialStatus);
      return [row ?? toFallbackStockRow(productId, initialStatus)];
    })
    .catch(() => [toFallbackStockRow(productId, initialStatus)])
    .then((rows) => {
      fallbackStockCache.set(cacheKey, {
        expiresAt: Date.now() + STOCK_FALLBACK_CACHE_MS,
        rows,
      });
      return rows;
    })
    .finally(() => {
      fallbackStockRequests.delete(cacheKey);
    });

  fallbackStockRequests.set(cacheKey, request);
  return request;
};

export const useLiveProductStock = ({
  enabled = true,
  initialStatus,
  productId,
  productSlug,
}: LiveProductStockOptions) => {
  const fallbackFetch = useCallback(async () => {
    return fetchFallbackStockRows({ initialStatus, productId, productSlug });
  }, [initialStatus, productId, productSlug]);

  const shapeParams = useMemo(
    () => ({
      params: [productId],
      replica: "full",
      where: "id = $1",
    }),
    [productId]
  );
  const mapStockRows = useCallback(
    (values: unknown[]) =>
      values
        .map((entry) => normalizeStockRow(entry, initialStatus))
        .filter((entry): entry is ProductStockRow => Boolean(entry)),
    [initialStatus],
  );

  const { mode, rows } = useElectricShapeRows<ProductStockRow>({
    enabled,
    fallbackFetch,
    initialRows: [
      {
        id: productId,
        reservedUntil: null,
        stockStatus: initialStatus,
      },
    ],
    immediateFallbackFetch: false,
    mapRows: mapStockRows,
    pollIntervalMs: 60_000,
    pollWhenHidden: false,
    shapeParams,
    table: "products",
  });

  return {
    mode,
    reservedUntil: rows[0]?.reservedUntil ?? null,
    stockStatus: rows[0]?.stockStatus ?? initialStatus,
  };
};
