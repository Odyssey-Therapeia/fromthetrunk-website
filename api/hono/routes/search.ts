import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { semanticSearchProducts } from "@/lib/ai/embeddings";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { searchProducts } from "@/lib/ports/catalog-search";
import {
  MAX_PUBLIC_SEARCH_QUERY_LENGTH,
  normalizePublicSearchQuery,
} from "@/lib/search/query";

const searchQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 12)),
  q: z
    .string()
    .transform(normalizePublicSearchQuery)
    .pipe(z.string().min(2).max(MAX_PUBLIC_SEARCH_QUERY_LENGTH)),
});

const semanticSearchBodySchema = z.object({
  limit: z.number().int().positive().max(24).optional(),
  query: z.string().trim().min(2),
});

export const registerSearchRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: {
        query: searchQuerySchema,
      },
      responses: {
        200: { description: "Keyword search results" },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Invalid query",
        },
      },
      tags: ["Search"],
    }),
    async (c) => {
      // Public keyword search: moderate per-IP cap, memory-backed so normal
      // product browsing is never hard-blocked by a limiter hiccup.
      const rateLimited = await rateLimitResponse(c.req.raw, "search:keyword", {
        limit: 60,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const query = c.req.valid("query");
      const requestedLimit = Number.isFinite(query.limit) ? query.limit : 12;
      const limit = Math.max(1, Math.min(requestedLimit ?? 12, 24));

      // P6-03: delegate to the catalog-search port (ILIKE over name/storyTitle/storyNarrative/attributes)
      // Port is published-only and swappable (see lib/ports/catalog-search.ts upgrade comment).
      const result = await searchProducts({
        query: query.q,
        limit,
        includeFacets: false,
        includeTotal: false,
      });
      const rows = result.products;

      return c.json(
        {
          docs: rows,
          query: query.q,
          totalDocs: rows.length,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/semantic",
      request: {
        body: {
          content: {
            "application/json": { schema: semanticSearchBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Semantic search results" },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Invalid payload",
        },
      },
      tags: ["Search"],
    }),
    async (c) => {
      // Semantic search is expensive (embeddings) → stricter, durable per-IP cap.
      const rateLimited = await rateLimitResponse(c.req.raw, "search:semantic", {
        limit: 10,
        requireDurable: true,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const body = c.req.valid("json");
      const results = await semanticSearchProducts(body.query, body.limit ?? 12);
      return c.json(
        {
          docs: results.map((entry) => ({
            ...entry.product,
            similarity: entry.similarity,
          })),
          query: body.query,
          totalDocs: results.length,
        },
        200
      );
    }
  );
};
