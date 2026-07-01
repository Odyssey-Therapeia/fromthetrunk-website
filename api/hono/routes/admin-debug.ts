import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { rawSql, withRetry } from "@/db";
import { getPublicProductStockBySlug } from "@/db/queries/products";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import {
  formatServerTiming,
  roundDuration,
  timeAsync,
  type TimingEntry,
} from "@/lib/perf/server-timing";

const DEFAULT_SLUG = "powder-blue-georgette-saree";

const databaseUrlShape = () => {
  const value = process.env.DATABASE_URL;
  if (!value) return "missing";

  try {
    const url = new URL(value);
    const host = url.hostname;
    const isPooled =
      host.includes("-pooler.") ||
      url.searchParams.get("pgbouncer") === "true" ||
      url.searchParams.get("pool_timeout") !== null;
    return isPooled ? "pooled" : "direct-or-http";
  } catch {
    return "unparseable";
  }
};

export const registerAdminDebugRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/db-ping", async (c) => {
    const isProductionBuild = process.env.NODE_ENV === "production";
    const debugEndpointsEnabled =
      process.env.FTT_ENABLE_DEBUG_ENDPOINTS === "true";
    const authUser = c.get("authUser");
    const debugToken = process.env.FTT_DEBUG_TOKEN;
    const hasDebugToken =
      debugToken &&
      verifyBearerSecret(c.req.header("authorization") ?? null, debugToken);

    if (
      isProductionBuild &&
      (!debugEndpointsEnabled || (authUser?.role !== "admin" && !hasDebugToken))
    ) {
      return new Response(null, { status: 404 });
    }

    const slug = c.req.query("slug") || DEFAULT_SLUG;
    const timings: TimingEntry[] = [];
    const startedAt = performance.now();

    await timeAsync(timings, "db-select-1", () =>
      withRetry(() => rawSql`select 1 as ok`),
    );

    const stockRows = await timeAsync(timings, "db-stock-query", () =>
      getPublicProductStockBySlug(slug),
    );

    const productRows = await timeAsync(timings, "db-product-query", () =>
      withRetry(() => rawSql`
        select id, slug, status, stock_status, reserved_until, updated_at
        from products
        where slug = ${slug}
          and status = 'published'
        limit 1
      `),
    );

    const totalMs = roundDuration(performance.now() - startedAt);
    const body = {
      dbAcquireConnectMs: null,
      dbAcquireConnectNote:
        "Not separately measurable with the current module-level Neon HTTP client.",
      databaseUrlShape: databaseUrlShape(),
      productLookupRows: Array.isArray(productRows) ? productRows.length : 0,
      slug,
      stockLookupRows: stockRows ? 1 : 0,
      timings: {
        totalMs,
        ...Object.fromEntries(
          timings.map((entry) => [`${entry.name}Ms`, entry.durationMs]),
        ),
      },
      vercel: {
        env: process.env.VERCEL_ENV ?? null,
        region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? null,
      },
    };

    const routeTotal = { durationMs: totalMs, name: "route-total" };
    return Response.json(body, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": formatServerTiming([routeTotal, ...timings]),
      },
    });
  });
};
