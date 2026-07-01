import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";

import {
  errorSchema,
  idParamSchema,
  slugParamSchema,
} from "@/api/hono/schemas/common";
import {
  ADMIN_PRODUCTS_MAX_LIMIT,
  bulkEditSchema,
  exportQuerySchema,
  listProductsQuerySchema,
  PUBLIC_PRODUCTS_MAX_LIMIT,
  recommendationQuerySchema,
  productPatchSchema,
  productInputSchema,
  tagSuggestionSchema,
} from "@/api/hono/schemas/products";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { resolveProductRowStockStatus } from "@/db/inventory";
import { refreshProductEmbedding } from "@/lib/ai/embeddings";
import { recommendProducts } from "@/lib/ai/recommendations";
import { suggestTagIds } from "@/lib/ai/tag-suggestions";
import {
  createProduct,
  deleteProduct,
  deriveQuantityAvailable,
  duplicateProduct,
  getProduct,
  getPublicProductStockBySlug,
  getProductsByIds,
  listProducts,
  type ProductWithRelations,
  updateProduct,
  updateProductsBatch,
  bulkSetProductTags,
} from "@/db/queries/products";
import {
  bulkAddProductsToCollection,
  bulkRemoveProductsFromCollection,
} from "@/db/queries/collections";
import { isInventoryV2 } from "@/lib/config/flags";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import {
  getTimedPublicProductBySlug,
} from "@/lib/data/products";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { createLogger } from "@/lib/log";
import {
  formatServerTiming,
  roundDuration,
  timeAsync,
  timeSync,
  type TimingEntry,
} from "@/lib/perf/server-timing";

const productRouteLog = createLogger("products:api");

const getRequestId = (request: Request) =>
  request.headers.get("x-request-id") ?? crypto.randomUUID();

const setPublicReadHeaders = (
  c: Context<HonoBindings>,
  {
    cacheControl,
    requestId,
    route,
    startedAt,
    status,
    timings = [],
  }: {
    cacheControl: string;
    requestId: string;
    route: string;
    startedAt: number;
    status: number;
    timings?: TimingEntry[];
  },
) => {
  const durationMs = roundDuration(performance.now() - startedAt);
  const routeTotal = {
    durationMs,
    name: "route-total",
  };
  c.header("Cache-Control", cacheControl);
  c.header("Server-Timing", formatServerTiming([routeTotal, ...timings]));
  c.header("X-Request-Id", requestId);

  productRouteLog.debug("public product read", {
    durationMs,
    requestId,
    route,
    status,
  });
};

/** Escape a CSV cell per RFC 4180. */
const escapeCsvCell = (value: unknown): string => {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function describeDbError(error: unknown) {
  // Drizzle wraps the driver error; the NeonDbError (with the PG fields) is on `.cause`.
  const pg =
    error && typeof error === "object" && "code" in error
      ? (error as Record<string, unknown>)
      : ((error as { cause?: unknown })?.cause as
          | Record<string, unknown>
          | undefined);
  if (pg && typeof pg === "object") {
    return {
      code: pg.code,
      message: pg.message,
      detail: pg.detail,
      constraint: pg.constraint,
      column: pg.column,
      table: pg.table,
    };
  }
  return { message: String(error) };
}

const parseDate = (value: null | string | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const canIncludeDrafts = (
  c: Parameters<typeof requireAdmin>[0],
  requested: boolean,
) => {
  if (!requested) return false;
  return !(requireAdmin(c) instanceof Response);
};

const toIsoString = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value;

export const serializePublicProduct = (product: ProductWithRelations) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  pricePaise: product.pricePaise,
  originalPricePaise: product.originalPricePaise,
  featured: product.featured,
  status: product.status,
  stockStatus: resolveProductRowStockStatus({
    reservedUntil: product.reservedUntil,
    stockStatus: product.stockStatus,
  }),
  typeName: product.typeName,
  typeSlug: product.typeSlug,
  storyTitle: product.storyTitle,
  storyNarrative: product.storyNarrative,
  storyProvenance: product.storyProvenance,
  storyEra: product.storyEra,
  detailsFabric: product.detailsFabric,
  detailsLength: product.detailsLength,
  detailsWidth: product.detailsWidth,
  detailsCondition: product.detailsCondition,
  detailsDesigner: product.detailsDesigner,
  collection: product.collection
    ? {
        description: product.collection.description,
        name: product.collection.name,
        slug: product.collection.slug,
      }
    : null,
  images: product.images.map((image) => ({
    alt: image.media.alt,
    filename: image.media.filename,
    height: image.media.height,
    sortOrder: image.sortOrder,
    url: image.media.url,
    width: image.media.width,
  })),
  tags: product.tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
  })),
  createdAt: toIsoString(product.createdAt),
  updatedAt: toIsoString(product.updatedAt),
});

export const registerProductRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // Lightweight admin-only product lookup by ID (for agent panel auto-anchor)
  app.openapi(
    createRoute({
      method: "get",
      path: "/by-id/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Product summary" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const product = await getProduct(id);
      if (!product) {
        return c.json(
          { code: "NOT_FOUND", message: "Product not found." },
          404,
        );
      }
      return c.json(
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: {
        query: listProductsQuerySchema,
      },
      responses: {
        200: { description: "Products list" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const includeDrafts = canIncludeDrafts(c, Boolean(query.includeDrafts));
      const maxLimit = includeDrafts
        ? ADMIN_PRODUCTS_MAX_LIMIT
        : PUBLIC_PRODUCTS_MAX_LIMIT;
      const limit = Math.min(query.limit ?? PUBLIC_PRODUCTS_MAX_LIMIT, maxLimit);
      const offset = query.offset ?? 0;

      if (query.ids?.length) {
        const products = await getProductsByIds(query.ids, { includeDrafts });
        const ordered = query.ids
          .map((id) => products.find((product) => product.id === id))
          .filter((product): product is ProductWithRelations => Boolean(product));

        if (!includeDrafts) {
          return c.json(ordered.map(serializePublicProduct), 200);
        }

        return c.json(ordered, 200);
      }

      const { rows: products } = await listProducts({
        includeDrafts,
        limit,
        offset,
      });
      if (!includeDrafts) {
        return c.json(products.map(serializePublicProduct), 200);
      }

      const enriched = products.map((product) => ({
        ...product,
        coverImageFilename: product.images[0]?.media.filename ?? null,
        imageCount: product.images.length,
        thumbnailUrl: product.images[0]?.media.url ?? null,
      }));
      return c.json(enriched, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/tag-suggestions",
      request: {
        body: {
          content: {
            "application/json": { schema: tagSuggestionSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Tag suggestions generated" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const suggestions = await suggestTagIds(body, 8);
      return c.json(
        {
          suggestions,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/recommendations",
      request: {
        params: idParamSchema,
        query: recommendationQuerySchema,
      },
      responses: {
        200: { description: "Product recommendations" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");

      const recommendations = await recommendProducts(
        params.id,
        Math.min(Math.max(query.limit ?? 6, 1), 12),
      );

      return c.json(
        {
          recommendations,
        },
        200,
      );
    },
  );

  // ── P4-06: CSV export ─────────────────────────────────────────────────────
  // MUST be registered before /{slug} so "/export.csv" is not matched as a slug.

  app.openapi(
    createRoute({
      method: "get",
      path: "/export.csv",
      request: {
        query: exportQuerySchema,
      },
      responses: {
        200: { description: "CSV export" },
        403: { description: "Forbidden" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const query = c.req.valid("query");

      // Resolve product rows — selection or full list
      let rows: Awaited<ReturnType<typeof listProducts>>["rows"];
      if (query.productIds && query.productIds.length > 0) {
        rows = await getProductsByIds(query.productIds, {
          includeDrafts: true,
        });
      } else {
        const result = await listProducts({ includeDrafts: true, limit: 5000 });
        rows = result.rows;
      }

      // Collect all attribute keys across all products
      const allAttrKeys = new Set<string>();
      for (const product of rows) {
        if (product.attributes && typeof product.attributes === "object") {
          for (const key of Object.keys(product.attributes)) {
            allAttrKeys.add(key);
          }
        }
      }
      const attrKeys = Array.from(allAttrKeys).sort();

      // Build header row
      const baseHeaders = [
        "id",
        "name",
        "slug",
        "status",
        "stockStatus",
        "pricePaise",
        "originalPricePaise",
        "featured",
        "storyTitle",
        "storyNarrative",
        "storyProvenance",
        "storyEra",
        "detailsFabric",
        "detailsLength",
        "detailsWidth",
        "detailsCondition",
        "detailsDesigner",
        "typeId",
        "collectionId",
        "collectionName",
        "collectionSlug",
        "tags",
        ...attrKeys.map((k) => `attr_${k}`),
      ];

      const csvRows: string[] = [baseHeaders.map(escapeCsvCell).join(",")];

      for (const product of rows) {
        const tagNames = product.tags.map((t) => t.name).join("|");
        const row = [
          product.id,
          product.name,
          product.slug,
          product.status,
          product.stockStatus,
          product.pricePaise,
          product.originalPricePaise ?? "",
          product.featured,
          product.storyTitle,
          product.storyNarrative ?? "",
          product.storyProvenance ?? "",
          product.storyEra ?? "",
          product.detailsFabric ?? "",
          product.detailsLength ?? "",
          product.detailsWidth ?? "",
          product.detailsCondition ?? "",
          product.detailsDesigner ?? "",
          product.typeId ?? "",
          product.collectionId ?? "",
          product.collection?.name ?? "",
          product.collection?.slug ?? "",
          tagNames,
          ...attrKeys.map((k) => {
            const v = product.attributes?.[k];
            return Array.isArray(v) ? v.join("|") : (v ?? "");
          }),
        ];
        csvRows.push(row.map(escapeCsvCell).join(","));
      }

      const csv = csvRows.join("\n");

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ftt-products-export.csv"`,
        },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{slug}/stock",
      request: {
        params: slugParamSchema,
      },
      responses: {
        200: { description: "Product stock by slug" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const startedAt = c.get("perfStartedAt") ?? performance.now();
      const timings = c.get("perfTimings") ?? [];
      const requestId = getRequestId(c.req.raw);
      const rateLimited = await timeAsync(timings, "rate-limit", () =>
        rateLimitResponse(
          c.req.raw,
          "products:stock",
          {
            limit: 240,
            windowSeconds: 60,
          },
          { timingSink: (entry) => timings.push(entry) },
        ),
      );
      if (rateLimited) return rateLimited;

      const params = c.req.valid("param");
      const stock = await getPublicProductStockBySlug(
        params.slug,
        (entry) => timings.push(entry),
      );
      if (!stock) {
        setPublicReadHeaders(c, {
          cacheControl: "public, max-age=30, stale-while-revalidate=60",
          requestId,
          route: "products.stock",
          startedAt,
          status: 404,
          timings,
        });
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      const stockStatus = resolveProductRowStockStatus({
        reservedUntil: stock.reservedUntil,
        stockStatus: stock.stockStatus,
      });

      const payload = timeSync(timings, "serialize", () => ({
        id: stock.id,
        reservedUntil: stock.reservedUntil?.toISOString() ?? null,
        slug: stock.slug,
        stockStatus,
        updatedAt: stock.updatedAt.toISOString(),
      }));

      setPublicReadHeaders(c, {
        cacheControl: "public, max-age=5, stale-while-revalidate=30",
        requestId,
        route: "products.stock",
        startedAt,
        status: 200,
        timings,
      });
      return c.json(payload, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{slug}",
      request: {
        params: slugParamSchema,
      },
      responses: {
        200: { description: "Product by slug" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const startedAt = c.get("perfStartedAt") ?? performance.now();
      const timings = c.get("perfTimings") ?? [];
      const requestId = getRequestId(c.req.raw);
      const rateLimited = await timeAsync(timings, "rate-limit", () =>
        rateLimitResponse(
          c.req.raw,
          "products:detail",
          {
            limit: 120,
            windowSeconds: 60,
          },
          { timingSink: (entry) => timings.push(entry) },
        ),
      );
      if (rateLimited) return rateLimited;

      const params = c.req.valid("param");
      c.header("X-FTT-Related-Cache", "N/A");
      const timingStartIndex = timings.length;

      const product = await timeAsync(
        timings,
        "product-cache",
        () =>
          getTimedPublicProductBySlug(params.slug, (entry) =>
            timings.push(entry),
          ),
      );
      const productCacheStatus = timings
        .slice(timingStartIndex)
        .some((entry) => entry.name === "db-product-query")
        ? "MISS"
        : "HIT";
      timings.findLast((entry) => entry.name === "product-cache")!.description =
        productCacheStatus;
      c.header("X-FTT-Product-Cache", productCacheStatus);
      if (!product) {
        setPublicReadHeaders(c, {
          cacheControl: "public, max-age=30, stale-while-revalidate=60",
          requestId,
          route: "products.detail",
          startedAt,
          status: 404,
          timings,
        });
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      const payload = timeSync(timings, "serialize", () =>
        serializePublicProduct(product),
      );

      setPublicReadHeaders(c, {
        cacheControl: "public, max-age=60, stale-while-revalidate=300",
        requestId,
        route: "products.detail",
        startedAt,
        status: 200,
        timings,
      });
      return c.json(payload, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: productInputSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Product created" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const created = await createProduct({
        ...body,
        imageMediaIds: body.imageMediaIds ?? [],
        reservedUntil: parseDate(body.reservedUntil),
        soldAt: parseDate(body.soldAt),
        tagIds: body.tagIds ?? [],
      });
      revalidateProductsCache([created.slug]);
      void refreshProductEmbedding(created.id).catch(() => undefined);
      return c.json(created, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/duplicate",
      request: {
        params: idParamSchema,
      },
      responses: {
        201: { description: "Product duplicated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const duplicated = await duplicateProduct(params.id);
      if (!duplicated) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      void refreshProductEmbedding(duplicated.id).catch(() => undefined);
      revalidateProductsCache([duplicated.slug]);

      return c.json(duplicated, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: productPatchSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Product updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await getProduct(params.id);
      if (!existing) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      // P4-05: when flag ON, dual-write quantityAvailable derived from stockStatus.
      // Flag OFF: only stockStatus is written (v1 byte-identical behavior).
      const quantityAvailableOverride =
        isInventoryV2() && body.stockStatus != null
          ? { quantityAvailable: deriveQuantityAvailable(body.stockStatus) }
          : {};

      let updated;
      try {
        updated = await updateProduct(params.id, {
          ...body,
          ...quantityAvailableOverride,
          reservedUntil: parseDate(body.reservedUntil),
          soldAt: parseDate(body.soldAt),
        });
	      } catch (error) {
	        productRouteLog.error("Product update failed", {
	          changedFields: Object.keys(body),
	          err: error instanceof Error ? error : new Error(String(error)),
	          productId: params.id,
	          requestId: getRequestId(c.req.raw),
	          summary: describeDbError(error),
	        });
	        throw error;
	      }
      if (updated) {
        void refreshProductEmbedding(updated.id).catch(() => undefined);
        revalidateProductsCache([existing.slug, updated.slug]);
      }
      return c.json(updated, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Product deleted" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const existing = await getProduct(params.id);
      if (!existing) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      const deleted = await deleteProduct(params.id);
      if (!deleted) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404,
        );
      }

      revalidateProductsCache([existing.slug]);
      return c.json({ success: true }, 200);
    },
  );

  // ── P4-06: Bulk edit ──────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/bulk-edit",
      request: {
        body: {
          content: { "application/json": { schema: bulkEditSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Bulk edit result" },
        400: { description: "Validation error" },
        403: { description: "Forbidden" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const {
        productIds,
        status,
        addCollectionId,
        removeCollectionId,
        addTagIds,
        removeTagIds,
      } = body;

      // At least one operation must be requested
      const hasOp =
        status !== undefined ||
        addCollectionId !== undefined ||
        removeCollectionId !== undefined ||
        (addTagIds !== undefined && addTagIds.length > 0) ||
        (removeTagIds !== undefined && removeTagIds.length > 0);

      if (!hasOp) {
        return c.json(
          {
            code: "NO_OPERATION",
            message: "At least one bulk operation must be specified.",
          },
          400,
        );
      }

      let updated = 0;
      let failed = 0;
      const errors: Array<{ id: string; message: string }> = [];

      // Status update
      if (status !== undefined) {
        const result = await updateProductsBatch(productIds, { status });
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Collection add
      if (addCollectionId !== undefined) {
        const result = await bulkAddProductsToCollection(
          addCollectionId,
          productIds,
        );
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Collection remove
      if (removeCollectionId !== undefined) {
        const result = await bulkRemoveProductsFromCollection(
          removeCollectionId,
          productIds,
        );
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Tag add/remove
      if (
        (addTagIds !== undefined && addTagIds.length > 0) ||
        (removeTagIds !== undefined && removeTagIds.length > 0)
      ) {
        const result = await bulkSetProductTags(
          productIds,
          addTagIds ?? [],
          removeTagIds ?? [],
        );
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      if (updated > 0) {
        const changedProducts = await getProductsByIds(productIds, {
          includeDrafts: true,
        });
        revalidateProductsCache(changedProducts.map((product) => product.slug));
      }

      return c.json({ updated, failed, errors }, 200);
    },
  );
};
