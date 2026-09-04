/**
 * Read-only aggregation for the Drape Room usage report.
 *
 * This module is deliberately free of database and filesystem access so the
 * arithmetic can be tested directly. `scripts/drape-room/report-usage.ts` owns
 * the SQL and passes plain rows in.
 *
 * Currency rules:
 *   - Every authoritative sum is integer micro-USD held in `bigint`.
 *   - Decimal USD is produced only for display, by integer division.
 *   - `actual_micro_usd` is written by `ftt_ai_tryon_finalize` and holds the
 *     amount the application charged against its own monthly safety budget. It
 *     is NOT a provider invoice line and must never be presented as one.
 *
 * Privacy rules:
 *   - The row type has no session tag, idempotency hash, IP, photo digest,
 *     prompt, or provider payload field, so none can reach the output.
 */
import type { TryonLedgerStatus } from "@/lib/drape-room/ledger/budget";

/** Printed with every report, in every format. */
export const USAGE_REPORT_COST_DISCLAIMER =
  "Application-accounted cost — not the provider invoice.";

/** Shown when `product_id` is null or the product row no longer exists. */
export const PRODUCT_NO_LONGER_AVAILABLE = "Product no longer available";

/** Statuses that have been settled against the monthly budget bucket. */
export const TERMINAL_TRYON_STATUSES = [
  "succeeded",
  "failed_pre_provider",
  "ambiguous_provider",
  "failed_post_provider",
] as const satisfies readonly TryonLedgerStatus[];

/** Statuses still holding a reservation rather than a settlement. */
export const IN_FLIGHT_TRYON_STATUSES = [
  "reserved",
  "in_progress",
] as const satisfies readonly TryonLedgerStatus[];

/**
 * The provider may already have performed billable work for these, so the
 * application settles them at the conservative forecast.
 */
export const POTENTIALLY_BILLABLE_FAILURE_STATUSES = [
  "ambiguous_provider",
  "failed_post_provider",
] as const satisfies readonly TryonLedgerStatus[];

export type TryonUsageLedgerRow = {
  actualMicroUsd: number | null;
  background: string;
  budgetPeriod: string;
  completedAt: string | null;
  createdAt: string;
  latencyMs: number | null;
  outputByteSize: number | null;
  productId: string | null;
  /** Current name from the `products` join; null when the product is gone. */
  productName: string | null;
  productSlug: string | null;
  provider: string;
  referenceCount: number | null;
  referenceMode: string | null;
  requestedModel: string;
  reservedMicroUsd: number;
  servedModel: string | null;
  status: TryonLedgerStatus;
};

export type TryonBudgetBucketRow = {
  limitMicroUsd: number;
  period: string;
  reservedMicroUsd: number;
  settledMicroUsd: number;
};

/** Unfiltered per-period ledger totals, used only for bucket reconciliation. */
export type TryonPeriodLedgerTotalsRow = {
  accountedMicroUsd: number;
  openReservedMicroUsd: number;
  period: string;
};

export type TryonUsageGroup = {
  /** Sum of `actual_micro_usd` over terminal rows: what the budget was charged. */
  accountedMicroUsd: bigint;
  /** Sum of the `actual_micro_usd` column wherever it is populated. */
  actualMicroUsd: bigint;
  attempts: number;
  averageLatencyMs: number | null;
  background: string;
  failedPreProvider: number;
  inFlight: number;
  /** Reservation still held by rows that have not settled yet. */
  openReservedMicroUsd: bigint;
  /** Statuses outside the known enum. Always 0 under the current contract. */
  otherOutcomes: number;
  outputByteTotal: bigint;
  period: string;
  potentiallyBillableFailures: number;
  productId: string | null;
  productName: string;
  productSlug: string | null;
  provider: string;
  referenceCount: number | null;
  referenceMode: string | null;
  requestedModel: string;
  /** Sum of the forecast reserved at admission time, never reduced. */
  reservedMicroUsd: bigint;
  servedModel: string | null;
  succeeded: number;
};

export type TryonUsageTotals = Omit<
  TryonUsageGroup,
  | "background"
  | "period"
  | "productId"
  | "productName"
  | "productSlug"
  | "provider"
  | "referenceCount"
  | "referenceMode"
  | "requestedModel"
  | "servedModel"
>;

export type TryonUsagePeriodReconciliation = {
  bucketLimitMicroUsd: bigint | null;
  bucketReservedMicroUsd: bigint | null;
  bucketSettledMicroUsd: bigint | null;
  ledgerAccountedMicroUsd: bigint;
  ledgerOpenReservedMicroUsd: bigint;
  /** Human-readable explanation whenever `reconciled` is false. */
  note: string | null;
  period: string;
  reconciled: boolean;
  reservedDeltaMicroUsd: bigint | null;
  settledDeltaMicroUsd: bigint | null;
};

export type TryonUsageReportFilters = {
  from: string | null;
  productId: string | null;
  to: string | null;
};

export type TryonUsageReport = {
  disclaimer: typeof USAGE_REPORT_COST_DISCLAIMER;
  filters: TryonUsageReportFilters;
  groups: TryonUsageGroup[];
  periods: TryonUsagePeriodReconciliation[];
  totals: TryonUsageTotals;
};

/** BigInt literal syntax is unavailable at the project's ES2017 target. */
const ZERO = BigInt(0);
const MICRO_USD_PER_USD = BigInt(1_000_000);

const TERMINAL = new Set<string>(TERMINAL_TRYON_STATUSES);
const IN_FLIGHT = new Set<string>(IN_FLIGHT_TRYON_STATUSES);
const POTENTIALLY_BILLABLE = new Set<string>(
  POTENTIALLY_BILLABLE_FAILURE_STATUSES,
);

/**
 * Converts integer micro-USD to a fixed six-decimal USD string without ever
 * going through a binary float.
 */
export function microUsdToUsd(microUsd: bigint): string {
  const negative = microUsd < ZERO;
  const absolute = negative ? -microUsd : microUsd;
  const whole = absolute / MICRO_USD_PER_USD;
  const fraction = (absolute % MICRO_USD_PER_USD).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function toBigInt(value: number | null | undefined): bigint {
  if (value === null || value === undefined) return ZERO;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Ledger value is not a safe integer: ${String(value)}`);
  }
  return BigInt(value);
}

function groupKey(row: TryonUsageLedgerRow): string {
  // JSON encoding keeps the key unambiguous whatever the values contain.
  return JSON.stringify([
    row.budgetPeriod,
    row.productId,
    row.background,
    row.provider,
    row.requestedModel,
    row.servedModel,
    row.referenceMode,
    row.referenceCount,
  ]);
}

function emptyGroup(row: TryonUsageLedgerRow): TryonUsageGroup {
  return {
    accountedMicroUsd: ZERO,
    actualMicroUsd: ZERO,
    attempts: 0,
    averageLatencyMs: null,
    background: row.background,
    failedPreProvider: 0,
    inFlight: 0,
    openReservedMicroUsd: ZERO,
    otherOutcomes: 0,
    outputByteTotal: ZERO,
    period: row.budgetPeriod,
    potentiallyBillableFailures: 0,
    productId: row.productId,
    productName: row.productName ?? PRODUCT_NO_LONGER_AVAILABLE,
    productSlug: row.productSlug,
    provider: row.provider,
    referenceCount: row.referenceCount,
    referenceMode: row.referenceMode,
    requestedModel: row.requestedModel,
    reservedMicroUsd: ZERO,
    servedModel: row.servedModel,
    succeeded: 0,
  };
}

function compareGroups(left: TryonUsageGroup, right: TryonUsageGroup): number {
  return (
    left.period.localeCompare(right.period) ||
    left.productName.localeCompare(right.productName) ||
    (left.productId ?? "").localeCompare(right.productId ?? "") ||
    left.background.localeCompare(right.background) ||
    left.provider.localeCompare(right.provider) ||
    left.requestedModel.localeCompare(right.requestedModel) ||
    (left.servedModel ?? "").localeCompare(right.servedModel ?? "") ||
    (left.referenceMode ?? "").localeCompare(right.referenceMode ?? "")
  );
}

/** Groups ledger rows and sums every currency figure in integer micro-USD. */
export function aggregateTryonUsage(
  rows: readonly TryonUsageLedgerRow[],
): { groups: TryonUsageGroup[]; totals: TryonUsageTotals } {
  const grouped = new Map<
    string,
    { group: TryonUsageGroup; latencyCount: number; latencySum: number }
  >();

  for (const row of rows) {
    const key = groupKey(row);
    const entry = grouped.get(key) ?? {
      group: emptyGroup(row),
      latencyCount: 0,
      latencySum: 0,
    };
    const { group } = entry;

    group.attempts += 1;
    if (row.status === "succeeded") group.succeeded += 1;
    else if (row.status === "failed_pre_provider") group.failedPreProvider += 1;
    else if (POTENTIALLY_BILLABLE.has(row.status)) {
      group.potentiallyBillableFailures += 1;
    } else if (IN_FLIGHT.has(row.status)) group.inFlight += 1;
    else group.otherOutcomes += 1;

    group.reservedMicroUsd += toBigInt(row.reservedMicroUsd);
    group.actualMicroUsd += toBigInt(row.actualMicroUsd);
    if (TERMINAL.has(row.status)) {
      group.accountedMicroUsd += toBigInt(row.actualMicroUsd);
    } else {
      group.openReservedMicroUsd += toBigInt(row.reservedMicroUsd);
    }
    group.outputByteTotal += toBigInt(row.outputByteSize);
    if (row.latencyMs !== null) {
      entry.latencySum += row.latencyMs;
      entry.latencyCount += 1;
    }
    // A later row may carry product identity a NULL-product row did not.
    if (group.productName === PRODUCT_NO_LONGER_AVAILABLE && row.productName) {
      group.productName = row.productName;
    }
    group.productSlug ??= row.productSlug;

    grouped.set(key, entry);
  }

  const groups = [...grouped.values()]
    .map(({ group, latencyCount, latencySum }) => ({
      ...group,
      averageLatencyMs:
        latencyCount === 0 ? null : Math.round(latencySum / latencyCount),
    }))
    .sort(compareGroups);

  return { groups, totals: totalsFor(rows, groups) };
}

function totalsFor(
  rows: readonly TryonUsageLedgerRow[],
  groups: readonly TryonUsageGroup[],
): TryonUsageTotals {
  const latencies = rows.filter((row) => row.latencyMs !== null);
  const latencySum = latencies.reduce(
    (sum, row) => sum + (row.latencyMs ?? 0),
    0,
  );
  return {
    accountedMicroUsd: sumOf(groups, "accountedMicroUsd"),
    actualMicroUsd: sumOf(groups, "actualMicroUsd"),
    attempts: countOf(groups, "attempts"),
    averageLatencyMs:
      latencies.length === 0
        ? null
        : Math.round(latencySum / latencies.length),
    failedPreProvider: countOf(groups, "failedPreProvider"),
    inFlight: countOf(groups, "inFlight"),
    openReservedMicroUsd: sumOf(groups, "openReservedMicroUsd"),
    otherOutcomes: countOf(groups, "otherOutcomes"),
    outputByteTotal: sumOf(groups, "outputByteTotal"),
    potentiallyBillableFailures: countOf(groups, "potentiallyBillableFailures"),
    reservedMicroUsd: sumOf(groups, "reservedMicroUsd"),
    succeeded: countOf(groups, "succeeded"),
  };
}

function sumOf(
  groups: readonly TryonUsageGroup[],
  field: {
    [K in keyof TryonUsageGroup]: TryonUsageGroup[K] extends bigint ? K : never;
  }[keyof TryonUsageGroup],
): bigint {
  return groups.reduce((sum, group) => sum + group[field], ZERO);
}

function countOf(
  groups: readonly TryonUsageGroup[],
  field: {
    [K in keyof TryonUsageGroup]: TryonUsageGroup[K] extends number ? K : never;
  }[keyof TryonUsageGroup],
): number {
  return groups.reduce((sum, group) => sum + group[field], 0);
}

/**
 * Compares unfiltered per-period ledger totals with the monthly bucket.
 *
 * Under the current contract `ftt_ai_tryon_finalize` adds the same amount to
 * `settled_micro_usd` that it writes to the row's `actual_micro_usd`, so an
 * exact match is expected. A divergence is reported rather than smoothed over:
 * the legitimate causes are rows created before this accounting contract and
 * manual database intervention.
 */
export function reconcileTryonPeriods(
  ledgerTotals: readonly TryonPeriodLedgerTotalsRow[],
  buckets: readonly TryonBudgetBucketRow[],
): TryonUsagePeriodReconciliation[] {
  const bucketsByPeriod = new Map(
    buckets.map((bucket) => [bucket.period, bucket] as const),
  );
  const periods = new Set<string>([
    ...ledgerTotals.map((row) => row.period),
    ...buckets.map((bucket) => bucket.period),
  ]);

  return [...periods]
    .sort((left, right) => left.localeCompare(right))
    .map((period) => {
      const totals = ledgerTotals.find((row) => row.period === period);
      const bucket = bucketsByPeriod.get(period);
      const ledgerAccountedMicroUsd = toBigInt(totals?.accountedMicroUsd ?? 0);
      const ledgerOpenReservedMicroUsd = toBigInt(
        totals?.openReservedMicroUsd ?? 0,
      );
      if (!bucket) {
        return {
          bucketLimitMicroUsd: null,
          bucketReservedMicroUsd: null,
          bucketSettledMicroUsd: null,
          ledgerAccountedMicroUsd,
          ledgerOpenReservedMicroUsd,
          note: "No budget bucket row exists for this period.",
          period,
          reconciled: false,
          reservedDeltaMicroUsd: null,
          settledDeltaMicroUsd: null,
        } satisfies TryonUsagePeriodReconciliation;
      }
      const bucketSettledMicroUsd = toBigInt(bucket.settledMicroUsd);
      const bucketReservedMicroUsd = toBigInt(bucket.reservedMicroUsd);
      const settledDeltaMicroUsd =
        ledgerAccountedMicroUsd - bucketSettledMicroUsd;
      const reservedDeltaMicroUsd =
        ledgerOpenReservedMicroUsd - bucketReservedMicroUsd;
      const reconciled =
        settledDeltaMicroUsd === ZERO && reservedDeltaMicroUsd === ZERO;
      return {
        bucketLimitMicroUsd: toBigInt(bucket.limitMicroUsd),
        bucketReservedMicroUsd,
        bucketSettledMicroUsd,
        ledgerAccountedMicroUsd,
        ledgerOpenReservedMicroUsd,
        note: reconciled
          ? null
          : "Ledger and bucket totals differ. Expected only for rows created before this accounting contract or after manual database intervention.",
        period,
        reconciled,
        reservedDeltaMicroUsd,
        settledDeltaMicroUsd,
      } satisfies TryonUsagePeriodReconciliation;
    });
}

export function buildTryonUsageReport(input: {
  buckets: readonly TryonBudgetBucketRow[];
  filters: TryonUsageReportFilters;
  ledgerTotals: readonly TryonPeriodLedgerTotalsRow[];
  rows: readonly TryonUsageLedgerRow[];
}): TryonUsageReport {
  const { groups, totals } = aggregateTryonUsage(input.rows);
  return {
    disclaimer: USAGE_REPORT_COST_DISCLAIMER,
    filters: input.filters,
    groups,
    periods: reconcileTryonPeriods(input.ledgerTotals, input.buckets),
    totals,
  };
}

// ── Command-line options ───────────────────────────────────────────────────

export type TryonUsageReportFormat = "csv" | "json" | "table";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TryonUsageReportOptions = TryonUsageReportFilters & {
  format: TryonUsageReportFormat;
};

export const TRYON_USAGE_REPORT_USAGE = `Drape Room usage report (read-only)

  --from=YYYY-MM-DD        include requests created on or after this UTC date
  --to=YYYY-MM-DD          include requests created on or before this UTC date
  --product-id=<uuid>      restrict to one product
  --format=table|json|csv  output format (default: table)
`;

/** Validates every filter before it can reach a query. Throws on bad input. */
export function parseUsageReportArgs(
  argv: readonly string[],
): TryonUsageReportOptions {
  const options: TryonUsageReportOptions = {
    format: "table",
    from: null,
    productId: null,
    to: null,
  };
  for (const argument of argv) {
    const [rawKey, ...rest] = argument.split("=");
    const value = rest.join("=");
    if (rawKey === "--from" || rawKey === "--to") {
      if (!DATE_PATTERN.test(value)) {
        throw new Error(`${rawKey} expects YYYY-MM-DD, received "${value}"`);
      }
      options[rawKey === "--from" ? "from" : "to"] = value;
      continue;
    }
    if (rawKey === "--product-id") {
      if (!UUID_PATTERN.test(value)) {
        throw new Error(`--product-id expects a UUID, received "${value}"`);
      }
      options.productId = value;
      continue;
    }
    if (rawKey === "--format") {
      if (value !== "table" && value !== "json" && value !== "csv") {
        throw new Error(`--format expects table|json|csv, received "${value}"`);
      }
      options.format = value;
      continue;
    }
    throw new Error(`Unknown argument "${argument}"`);
  }
  if (options.from && options.to && options.from > options.to) {
    throw new Error("--from must not be later than --to");
  }
  return options;
}

// ── Formatting ─────────────────────────────────────────────────────────────

const COLUMNS = [
  "period",
  "product_id",
  "product_name",
  "product_slug",
  "background",
  "provider",
  "requested_model",
  "served_model",
  "reference_mode",
  "reference_count",
  "attempts",
  "succeeded",
  "failed_pre_provider",
  "potentially_billable_failures",
  "in_flight",
  "other_outcomes",
  "avg_latency_ms",
  "output_bytes",
  "reserved_micro_usd",
  "actual_micro_usd",
  "accounted_micro_usd",
  "accounted_usd",
] as const;

function groupCells(group: TryonUsageGroup): string[] {
  return [
    group.period,
    group.productId ?? "",
    group.productName,
    group.productSlug ?? "",
    group.background,
    group.provider,
    group.requestedModel,
    group.servedModel ?? "",
    group.referenceMode ?? "",
    group.referenceCount === null ? "" : String(group.referenceCount),
    String(group.attempts),
    String(group.succeeded),
    String(group.failedPreProvider),
    String(group.potentiallyBillableFailures),
    String(group.inFlight),
    String(group.otherOutcomes),
    group.averageLatencyMs === null ? "" : String(group.averageLatencyMs),
    group.outputByteTotal.toString(),
    group.reservedMicroUsd.toString(),
    group.actualMicroUsd.toString(),
    group.accountedMicroUsd.toString(),
    microUsdToUsd(group.accountedMicroUsd),
  ];
}

function totalsCells(totals: TryonUsageTotals): string[] {
  return [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    String(totals.attempts),
    String(totals.succeeded),
    String(totals.failedPreProvider),
    String(totals.potentiallyBillableFailures),
    String(totals.inFlight),
    String(totals.otherOutcomes),
    totals.averageLatencyMs === null ? "" : String(totals.averageLatencyMs),
    totals.outputByteTotal.toString(),
    totals.reservedMicroUsd.toString(),
    totals.actualMicroUsd.toString(),
    totals.accountedMicroUsd.toString(),
    microUsdToUsd(totals.accountedMicroUsd),
  ];
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function padRow(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
    .join("  ")
    .trimEnd();
}

function renderTable(report: TryonUsageReport): string {
  const header = [...COLUMNS];
  const body = report.groups.map(groupCells);
  const footer = totalsCells(report.totals);
  const widths = header.map((_, index) =>
    Math.max(
      header[index].length,
      footer[index]?.length ?? 0,
      ...body.map((cells) => cells[index]?.length ?? 0),
    ),
  );
  const lines = [
    `Drape Room usage report — ${report.disclaimer}`,
    `Filters: from=${report.filters.from ?? "-"} to=${report.filters.to ?? "-"} product-id=${report.filters.productId ?? "-"}`,
    "",
    padRow(header, widths),
    padRow(
      header.map((_, index) => "-".repeat(widths[index] ?? 0)),
      widths,
    ),
    ...body.map((cells) => padRow(cells, widths)),
  ];
  if (body.length > 0) {
    lines.push(
      padRow(
        header.map((_, index) => "-".repeat(widths[index] ?? 0)),
        widths,
      ),
    );
  }
  lines.push(padRow(footer, widths));
  lines.push("", "Monthly budget reconciliation (unfiltered, per period)");
  if (report.periods.length === 0) {
    lines.push("  (no periods in range)");
  }
  for (const period of report.periods) {
    lines.push(
      `  ${period.period}  ledger_accounted=${period.ledgerAccountedMicroUsd} bucket_settled=${period.bucketSettledMicroUsd ?? "-"} settled_delta=${period.settledDeltaMicroUsd ?? "-"} ledger_open_reserved=${period.ledgerOpenReservedMicroUsd} bucket_reserved=${period.bucketReservedMicroUsd ?? "-"} reserved_delta=${period.reservedDeltaMicroUsd ?? "-"} reconciled=${period.reconciled}`,
    );
    if (period.note) lines.push(`    note: ${period.note}`);
  }
  lines.push(
    "",
    `All currency figures are integer micro-USD. ${report.disclaimer}`,
  );
  return `${lines.join("\n")}\n`;
}

function renderCsv(report: TryonUsageReport): string {
  const lines = [
    `# ${report.disclaimer}`,
    [...COLUMNS].map(csvCell).join(","),
    ...report.groups.map((group) => groupCells(group).map(csvCell).join(",")),
    totalsCells(report.totals).map(csvCell).join(","),
  ];
  return `${lines.join("\n")}\n`;
}

function renderJson(report: TryonUsageReport): string {
  return `${JSON.stringify(
    report,
    (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    2,
  )}\n`;
}

export function formatTryonUsageReport(
  report: TryonUsageReport,
  format: TryonUsageReportFormat,
): string {
  if (format === "json") return renderJson(report);
  if (format === "csv") return renderCsv(report);
  return renderTable(report);
}
