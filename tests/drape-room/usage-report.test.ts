import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { TryonLedgerStatus } from "@/lib/drape-room/ledger/budget";
import {
  aggregateTryonUsage,
  buildTryonUsageReport,
  formatTryonUsageReport,
  microUsdToUsd,
  PRODUCT_NO_LONGER_AVAILABLE,
  reconcileTryonPeriods,
  parseUsageReportArgs,
  USAGE_REPORT_COST_DISCLAIMER,
  type TryonUsageLedgerRow,
} from "@/lib/drape-room/reporting/usage-report";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT_ID = "99999999-9999-4999-8999-999999999999";

function row(
  status: TryonLedgerStatus,
  overrides: Partial<TryonUsageLedgerRow> = {},
): TryonUsageLedgerRow {
  return {
    actualMicroUsd: null,
    background: "studio",
    budgetPeriod: "2026-09",
    completedAt: "2026-09-04T10:00:05.000Z",
    createdAt: "2026-09-04T10:00:00.000Z",
    latencyMs: null,
    outputByteSize: null,
    productId: PRODUCT_ID,
    productName: "Kanjivaram in Rust",
    productSlug: "kanjivaram-in-rust",
    provider: "google",
    referenceCount: 3,
    referenceMode: "dual",
    requestedModel: "gemini-3.1-flash-image",
    reservedMicroUsd: 300_000,
    servedModel: "gemini-3.1-flash-image",
    status,
    ...overrides,
  };
}

describe("Drape Room usage report arithmetic", () => {
  it("converts micro-USD to USD by integer division only", () => {
    expect(microUsdToUsd(BigInt(0))).toBe("0.000000");
    expect(microUsdToUsd(BigInt(1))).toBe("0.000001");
    expect(microUsdToUsd(BigInt(300_000))).toBe("0.300000");
    expect(microUsdToUsd(BigInt(1_000_000))).toBe("1.000000");
    expect(microUsdToUsd(BigInt(12_345_678))).toBe("12.345678");
    expect(microUsdToUsd(BigInt(-450_000))).toBe("-0.450000");
  });

  it("stays exact past the safe-integer range that a float would round", () => {
    // 9007199254740993 is the first odd integer a JS number cannot represent.
    const beyondSafe = BigInt("9007199254740993");
    expect(Number(beyondSafe).toString()).toBe("9007199254740992");
    expect(microUsdToUsd(beyondSafe)).toBe("9007199254.740993");
    expect((beyondSafe + BigInt(1)).toString()).toBe("9007199254740994");
  });

  it("classifies every terminal and in-flight status", () => {
    const { groups, totals } = aggregateTryonUsage([
      row("succeeded", { actualMicroUsd: 150_000, latencyMs: 20_000, outputByteSize: 229_082 }),
      row("succeeded", { actualMicroUsd: 300_000, latencyMs: 22_000, outputByteSize: 210_000 }),
      row("failed_pre_provider", { actualMicroUsd: 0 }),
      row("ambiguous_provider", { actualMicroUsd: 300_000 }),
      row("failed_post_provider", { actualMicroUsd: 300_000 }),
      row("reserved"),
      row("in_progress"),
    ]);

    expect(groups).toHaveLength(1);
    expect(totals).toMatchObject({
      attempts: 7,
      failedPreProvider: 1,
      inFlight: 2,
      otherOutcomes: 0,
      potentiallyBillableFailures: 2,
      succeeded: 2,
    });
    expect(totals.reservedMicroUsd).toBe(BigInt(2_100_000));
    // Only settled rows are charged against the monthly budget.
    expect(totals.accountedMicroUsd).toBe(BigInt(1_050_000));
    expect(totals.actualMicroUsd).toBe(BigInt(1_050_000));
    expect(totals.openReservedMicroUsd).toBe(BigInt(600_000));
    expect(totals.outputByteTotal).toBe(BigInt(439_082));
    expect(totals.averageLatencyMs).toBe(21_000);
  });

  it("groups by period, product, background, provider, model and reference mode", () => {
    // Two identical rows collapse; each following row differs in exactly one
    // key field, so every component of the group key is exercised.
    const { groups } = aggregateTryonUsage([
      row("succeeded", { actualMicroUsd: 100_000 }),
      row("succeeded", { actualMicroUsd: 100_000 }),
      row("succeeded", { actualMicroUsd: 100_000, background: "wedding" }),
      row("succeeded", { actualMicroUsd: 100_000, budgetPeriod: "2026-10" }),
      row("succeeded", { actualMicroUsd: 100_000, provider: "openai" }),
      row("succeeded", {
        actualMicroUsd: 100_000,
        requestedModel: "gpt-image-1",
      }),
      row("succeeded", {
        actualMicroUsd: 100_000,
        servedModel: "gemini-3.1-flash-image-002",
      }),
      row("succeeded", {
        actualMicroUsd: 200_000,
        productId: OTHER_PRODUCT_ID,
        productName: "Banarasi in Ivory",
        productSlug: "banarasi-in-ivory",
        referenceCount: 2,
        referenceMode: "single",
      }),
    ]);

    // 8 rows, one collapsed pair, 7 distinct key combinations.
    expect(groups).toHaveLength(7);
    expect(groups.reduce((sum, group) => sum + group.attempts, 0)).toBe(8);
    const collapsed = groups.filter((group) => group.attempts === 2);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      background: "studio",
      period: "2026-09",
      provider: "google",
      requestedModel: "gemini-3.1-flash-image",
      servedModel: "gemini-3.1-flash-image",
    });

    // Each varied field really did open a group of its own.
    expect(groups.filter((group) => group.provider === "openai")).toHaveLength(1);
    expect(
      groups.filter((group) => group.requestedModel === "gpt-image-1"),
    ).toHaveLength(1);
    expect(
      groups.filter(
        (group) => group.servedModel === "gemini-3.1-flash-image-002",
      ),
    ).toHaveLength(1);
    expect(groups.filter((group) => group.background === "wedding")).toHaveLength(1);
    expect(groups.filter((group) => group.period === "2026-10")).toHaveLength(1);

    const single = groups.find((group) => group.referenceMode === "single");
    expect(single).toMatchObject({
      productName: "Banarasi in Ivory",
      productSlug: "banarasi-in-ivory",
      referenceCount: 2,
      succeeded: 1,
    });
  });

  it("quotes a value carrying a bare carriage return so the CSV record stays whole", () => {
    const csv = formatTryonUsageReport(
      buildTryonUsageReport({
        buckets: [],
        filters: { from: null, productId: null, to: null },
        ledgerTotals: [],
        rows: [
          row("succeeded", {
            actualMicroUsd: 100_000,
            productName: "Kanjivaram\rin Rust",
          }),
        ],
      }),
      "csv",
    );

    expect(csv).toContain('"Kanjivaram\rin Rust"');
    // Header comment, column header, one data row, TOTAL — nothing torn in two.
    expect(csv.trim().split("\n")).toHaveLength(4);
  });

  it("labels a deleted product while preserving the surviving UUID", () => {
    const { groups } = aggregateTryonUsage([
      row("succeeded", { actualMicroUsd: 100_000, productName: null, productSlug: null }),
    ]);

    expect(groups[0]?.productName).toBe(PRODUCT_NO_LONGER_AVAILABLE);
    expect(groups[0]?.productId).toBe(PRODUCT_ID);
    expect(groups[0]?.productSlug).toBeNull();
  });

  it("labels a row that never bound a product at all", () => {
    const { groups } = aggregateTryonUsage([
      row("failed_pre_provider", {
        actualMicroUsd: 0,
        productId: null,
        productName: null,
        productSlug: null,
        referenceCount: null,
        referenceMode: null,
      }),
    ]);

    expect(groups[0]?.productId).toBeNull();
    expect(groups[0]?.productName).toBe(PRODUCT_NO_LONGER_AVAILABLE);
    expect(groups[0]?.failedPreProvider).toBe(1);
  });

  it("rejects a ledger value that is not a safe integer", () => {
    expect(() =>
      aggregateTryonUsage([row("succeeded", { actualMicroUsd: 1.5 })]),
    ).toThrow(/not a safe integer/);
  });
});

describe("Drape Room monthly budget reconciliation", () => {
  it("reconciles when the ledger and the bucket agree", () => {
    const [period] = reconcileTryonPeriods(
      [{ accountedMicroUsd: 1_050_000, openReservedMicroUsd: 600_000, period: "2026-09" }],
      [
        {
          limitMicroUsd: 50_000_000,
          period: "2026-09",
          reservedMicroUsd: 600_000,
          settledMicroUsd: 1_050_000,
        },
      ],
    );

    expect(period).toMatchObject({ period: "2026-09", reconciled: true, note: null });
    expect(period?.settledDeltaMicroUsd).toBe(BigInt(0));
    expect(period?.reservedDeltaMicroUsd).toBe(BigInt(0));
  });

  it("reports the exact divergence rather than smoothing it over", () => {
    const [period] = reconcileTryonPeriods(
      [{ accountedMicroUsd: 1_050_000, openReservedMicroUsd: 0, period: "2026-09" }],
      [
        {
          limitMicroUsd: 50_000_000,
          period: "2026-09",
          reservedMicroUsd: 0,
          settledMicroUsd: 900_000,
        },
      ],
    );

    expect(period?.reconciled).toBe(false);
    expect(period?.settledDeltaMicroUsd).toBe(BigInt(150_000));
    expect(period?.note).toMatch(/before this accounting contract/);
  });

  it("flags a period with ledger rows but no bucket row", () => {
    const [period] = reconcileTryonPeriods(
      [{ accountedMicroUsd: 10, openReservedMicroUsd: 0, period: "2026-09" }],
      [],
    );

    expect(period?.reconciled).toBe(false);
    expect(period?.bucketSettledMicroUsd).toBeNull();
    expect(period?.note).toMatch(/No budget bucket row/);
  });
});

describe("Drape Room usage report output", () => {
  const report = buildTryonUsageReport({
    buckets: [
      {
        limitMicroUsd: 50_000_000,
        period: "2026-09",
        reservedMicroUsd: 0,
        settledMicroUsd: 450_000,
      },
    ],
    filters: { from: "2026-09-01", productId: null, to: "2026-09-30" },
    ledgerTotals: [
      { accountedMicroUsd: 450_000, openReservedMicroUsd: 0, period: "2026-09" },
    ],
    rows: [
      row("succeeded", { actualMicroUsd: 150_000, latencyMs: 20_000, outputByteSize: 229_082 }),
      row("ambiguous_provider", { actualMicroUsd: 300_000 }),
    ],
  });

  it("totals the accounted cost and reconciles the period", () => {
    expect(report.totals.accountedMicroUsd).toBe(BigInt(450_000));
    expect(report.periods[0]?.reconciled).toBe(true);
  });

  it("labels internal accounting separately from provider billing in every format", () => {
    for (const format of ["table", "json", "csv"] as const) {
      const output = formatTryonUsageReport(report, format);
      expect(output).toContain(USAGE_REPORT_COST_DISCLAIMER);
      expect(output).toContain("not the provider invoice");
      expect(output).not.toMatch(/invoice from (Google|OpenAI)/i);
    }
  });

  it("renders the accounted USD figure from the integer micro-USD total", () => {
    const table = formatTryonUsageReport(report, "table");
    expect(table).toContain("0.450000");
    expect(table).toContain("reconciled=true");
    const parsed = JSON.parse(formatTryonUsageReport(report, "json")) as {
      totals: { accountedMicroUsd: string };
    };
    expect(parsed.totals.accountedMicroUsd).toBe("450000");
  });

  it("escapes CSV values and ends with a TOTAL row", () => {
    const csv = formatTryonUsageReport(
      buildTryonUsageReport({
        buckets: [],
        filters: { from: null, productId: null, to: null },
        ledgerTotals: [],
        rows: [
          row("succeeded", {
            actualMicroUsd: 150_000,
            productName: 'Kanjivaram, "Rust"',
          }),
        ],
      }),
      "csv",
    );

    expect(csv).toContain('"Kanjivaram, ""Rust"""');
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(`# ${USAGE_REPORT_COST_DISCLAIMER}`);
    expect(lines[1]).toContain("accounted_micro_usd");
    expect(lines.at(-1)?.startsWith("TOTAL,")).toBe(true);
  });

  it("never emits a pseudonymous identity column", () => {
    const output = [
      formatTryonUsageReport(report, "table"),
      formatTryonUsageReport(report, "json"),
      formatTryonUsageReport(report, "csv"),
    ].join("\n");

    for (const prohibited of [
      "session_tag",
      "sessionTag",
      "idempotency",
      "ip_tag",
      "photo",
      "prompt",
    ]) {
      expect(output.toLowerCase()).not.toContain(prohibited.toLowerCase());
    }
  });
});

describe("Drape Room usage report CLI", () => {
  it("defaults to an unfiltered table", () => {
    expect(parseUsageReportArgs([])).toEqual({
      format: "table",
      from: null,
      productId: null,
      to: null,
    });
  });

  it("accepts the documented filters", () => {
    expect(
      parseUsageReportArgs([
        "--from=2026-09-01",
        "--to=2026-09-30",
        `--product-id=${PRODUCT_ID}`,
        "--format=csv",
      ]),
    ).toEqual({
      format: "csv",
      from: "2026-09-01",
      productId: PRODUCT_ID,
      to: "2026-09-30",
    });
  });

  it("rejects malformed input instead of querying with it", () => {
    expect(() => parseUsageReportArgs(["--from=September"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseUsageReportArgs(["--product-id=1"])).toThrow(/UUID/);
    expect(() => parseUsageReportArgs(["--format=xml"])).toThrow(/table\|json\|csv/);
    expect(() => parseUsageReportArgs(["--limit=5"])).toThrow(/Unknown argument/);
    expect(() =>
      parseUsageReportArgs(["--from=2026-09-30", "--to=2026-09-01"]),
    ).toThrow(/must not be later/);
  });
});

describe("Drape Room usage report source safety", () => {
  const source = readFileSync(
    join(process.cwd(), "scripts/drape-room/report-usage.ts"),
    "utf8",
  );

  it("selects no pseudonymous identity column", () => {
    for (const column of ["session_tag", "idempotency_hash", "ip_tag"]) {
      expect(source).not.toContain(column);
    }
  });

  it("issues read-only SQL and joins products for the display name", () => {
    expect(source).toContain("LEFT JOIN public.products AS product");
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\s/);
  });

  it("introduces no new environment variable", () => {
    expect(source).not.toMatch(/process\.env\.(?!NODE_ENV)/);
  });
});
