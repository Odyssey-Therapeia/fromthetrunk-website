/**
 * Read-only Drape Room usage and application-accounted cost report.
 *
 * Usage:
 *   pnpm run drape:usage:report
 *   pnpm run drape:usage:report -- --from=2026-09-01 --to=2026-09-30
 *   pnpm run drape:usage:report -- --product-id=<uuid> --format=json
 *
 * This script issues SELECT statements only. It reads DATABASE_URL through the
 * existing `@/db` client and introduces no new environment variable. The client
 * is imported lazily, matching `lib/drape-room/ledger/budget.ts`, so importing
 * this module never requires a database connection.
 *
 * It deliberately never selects the pseudonymous identity columns, and the
 * ledger holds no photo, generated image, prompt, raw IP, or provider payload,
 * so none of those can appear in the output.
 *
 * Cost figures are the application's own conservative accounting, never the
 * provider invoice.
 */
import type { TryonLedgerStatus } from "@/lib/drape-room/ledger/budget";
import {
  buildTryonUsageReport,
  formatTryonUsageReport,
  parseUsageReportArgs,
  TRYON_USAGE_REPORT_USAGE,
  type TryonBudgetBucketRow,
  type TryonPeriodLedgerTotalsRow,
  type TryonUsageLedgerRow,
  type TryonUsageReportOptions,
} from "@/lib/drape-room/reporting/usage-report";

/** Accepts the string form Postgres uses for bigint as well as a number. */
function readInteger(value: unknown, field: string): number {
  if (value === null || value === undefined) {
    throw new Error(`Expected an integer for ${field}, received null`);
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed)) {
    throw new Error(
      `Expected a safe integer for ${field}, received ${String(value)}`,
    );
  }
  return parsed;
}

function readNullableInteger(value: unknown, field: string): number | null {
  return value === null || value === undefined
    ? null
    : readInteger(value, field);
}

function readTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

type DetailRow = {
  actual_micro_usd: unknown;
  background: string;
  budget_period: string;
  completed_at: unknown;
  created_at: unknown;
  latency_ms: unknown;
  output_byte_size: unknown;
  product_id: string | null;
  product_name: string | null;
  product_slug: string | null;
  provider: string;
  reference_count: unknown;
  reference_mode: string | null;
  requested_model: string;
  reserved_micro_usd: unknown;
  served_model: string | null;
  status: TryonLedgerStatus;
};

async function loadDetailRows(
  options: TryonUsageReportOptions,
): Promise<TryonUsageLedgerRow[]> {
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    SELECT
      request.budget_period,
      request.product_id::text AS product_id,
      product.name AS product_name,
      product.slug AS product_slug,
      request.background,
      request.provider,
      request.requested_model,
      request.served_model,
      request.reference_mode,
      request.reference_count,
      request.status,
      request.reserved_micro_usd,
      request.actual_micro_usd,
      request.latency_ms,
      request.output_byte_size,
      request.created_at,
      request.completed_at
    FROM public.ai_tryon_requests AS request
    LEFT JOIN public.products AS product ON product.id = request.product_id
    WHERE (${options.from}::date IS NULL
        OR (request.created_at AT TIME ZONE 'UTC')::date >= ${options.from}::date)
      AND (${options.to}::date IS NULL
        OR (request.created_at AT TIME ZONE 'UTC')::date <= ${options.to}::date)
      AND (${options.productId}::uuid IS NULL
        OR request.product_id = ${options.productId}::uuid)
    ORDER BY request.budget_period, request.created_at, request.id
  `) as DetailRow[];

  return rows.map((detail) => ({
    actualMicroUsd: readNullableInteger(
      detail.actual_micro_usd,
      "actual_micro_usd",
    ),
    background: detail.background,
    budgetPeriod: detail.budget_period,
    completedAt:
      detail.completed_at === null ? null : readTimestamp(detail.completed_at),
    createdAt: readTimestamp(detail.created_at),
    latencyMs: readNullableInteger(detail.latency_ms, "latency_ms"),
    outputByteSize: readNullableInteger(
      detail.output_byte_size,
      "output_byte_size",
    ),
    productId: detail.product_id,
    productName: detail.product_name,
    productSlug: detail.product_slug,
    provider: detail.provider,
    referenceCount: readNullableInteger(
      detail.reference_count,
      "reference_count",
    ),
    referenceMode: detail.reference_mode,
    requestedModel: detail.requested_model,
    reservedMicroUsd: readInteger(
      detail.reserved_micro_usd,
      "reserved_micro_usd",
    ),
    servedModel: detail.served_model,
    status: detail.status,
  }));
}

/**
 * Period totals are read WITHOUT the date/product filters so the comparison
 * against the monthly bucket stays exact even for a narrowed report.
 */
async function loadPeriodTotals(
  periods: readonly string[],
): Promise<TryonPeriodLedgerTotalsRow[]> {
  if (periods.length === 0) return [];
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    SELECT
      budget_period AS period,
      COALESCE(SUM(
        CASE WHEN status IN (
          'succeeded', 'failed_pre_provider', 'ambiguous_provider', 'failed_post_provider'
        ) THEN actual_micro_usd ELSE 0 END
      ), 0) AS accounted_micro_usd,
      COALESCE(SUM(
        CASE WHEN status IN ('reserved', 'in_progress')
        THEN reserved_micro_usd ELSE 0 END
      ), 0) AS open_reserved_micro_usd
    FROM public.ai_tryon_requests
    WHERE budget_period = ANY(${[...periods]}::text[])
    GROUP BY budget_period
    ORDER BY budget_period
  `) as Array<{
    accounted_micro_usd: unknown;
    open_reserved_micro_usd: unknown;
    period: string;
  }>;
  return rows.map((total) => ({
    accountedMicroUsd: readInteger(
      total.accounted_micro_usd,
      "accounted_micro_usd",
    ),
    openReservedMicroUsd: readInteger(
      total.open_reserved_micro_usd,
      "open_reserved_micro_usd",
    ),
    period: total.period,
  }));
}

async function loadBuckets(
  periods: readonly string[],
): Promise<TryonBudgetBucketRow[]> {
  if (periods.length === 0) return [];
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    SELECT period, limit_micro_usd, reserved_micro_usd, settled_micro_usd
    FROM public.ai_tryon_budget_buckets
    WHERE period = ANY(${[...periods]}::text[])
    ORDER BY period
  `) as Array<{
    limit_micro_usd: unknown;
    period: string;
    reserved_micro_usd: unknown;
    settled_micro_usd: unknown;
  }>;
  return rows.map((bucket) => ({
    limitMicroUsd: readInteger(bucket.limit_micro_usd, "limit_micro_usd"),
    period: bucket.period,
    reservedMicroUsd: readInteger(
      bucket.reserved_micro_usd,
      "reserved_micro_usd",
    ),
    settledMicroUsd: readInteger(bucket.settled_micro_usd, "settled_micro_usd"),
  }));
}

async function main(): Promise<void> {
  let options: TryonUsageReportOptions;
  try {
    options = parseUsageReportArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Invalid arguments"}\n\n${TRYON_USAGE_REPORT_USAGE}`,
    );
    process.exitCode = 1;
    return;
  }

  const rows = await loadDetailRows(options);
  const periods = [...new Set(rows.map((row) => row.budgetPeriod))].sort();
  const [ledgerTotals, buckets] = await Promise.all([
    loadPeriodTotals(periods),
    loadBuckets(periods),
  ]);

  const report = buildTryonUsageReport({
    buckets,
    filters: {
      from: options.from,
      productId: options.productId,
      to: options.to,
    },
    ledgerTotals,
    rows,
  });
  process.stdout.write(formatTryonUsageReport(report, options.format));
}

void main();
