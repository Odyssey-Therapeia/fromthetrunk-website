import { NextResponse } from "next/server";

import { rawSql, withRetry } from "@/db";
import { getPublicProductStockBySlug } from "@/db/queries/products";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import {
  formatServerTiming,
  roundDuration,
  timeAsync,
  type TimingEntry,
} from "@/lib/perf/server-timing";

export const dynamic = "force-dynamic";

const DEFAULT_SLUG = "powder-blue-georgette-saree";

const isDebugAllowed = (request: Request) => {
  const debugToken = process.env.FTT_DEBUG_TOKEN;
  const isProductionBuild = process.env.NODE_ENV === "production";

  if (!isProductionBuild) {
    return true;
  }

  if (process.env.FTT_ENABLE_DEBUG_ENDPOINTS !== "true" || !debugToken) {
    return false;
  }

  return verifyBearerSecret(request.headers.get("authorization"), debugToken);
};

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

export async function GET(request: Request) {
  if (!isDebugAllowed(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const slug = requestUrl.searchParams.get("slug") || DEFAULT_SLUG;
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
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": formatServerTiming([routeTotal, ...timings]),
    },
  });
}
