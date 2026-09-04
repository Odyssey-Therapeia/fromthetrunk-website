import { timingSafeEqual } from "node:crypto";

// Compatibility value for the legacy database column. Regeneration is not an
// application or API operation and cannot be supplied by a caller.
const LEGACY_REGENERATION = false as const;

export type TryonLedgerStatus =
  | "reserved"
  | "in_progress"
  | "succeeded"
  | "failed_pre_provider"
  | "ambiguous_provider"
  | "failed_post_provider";

export type BudgetReservationOutcome =
  | "reserved"
  | "duplicate"
  | "budget_exhausted"
  | "configuration_mismatch"
  | "invalid_amount";

export type BudgetReservation = {
  outcome: BudgetReservationOutcome;
  requestId: string | null;
  requestStatus: TryonLedgerStatus | null;
};

export type ReserveTryonBudgetInput = {
  period: string;
  limitMicroUsd: number;
  requestId: string;
  idempotencyHash: string;
  sessionTag: string;
  background: string;
  provider: string;
  requestedModel: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  forecastMicroUsd: number;
};

export type FinalizeTryonBudgetInput = {
  requestId: string;
  status: Extract<
    TryonLedgerStatus,
    | "succeeded"
    | "failed_pre_provider"
    | "ambiguous_provider"
    | "failed_post_provider"
  >;
  actualMicroUsd: number | null;
  servedModel: string | null;
  latencyMs: number | null;
  outputByteSize: number | null;
  errorCode: string | null;
};

export type BindTryonRequestProductInput = {
  productId: string;
  productReferenceVersion: string;
  referenceContractVersion: "gallery-v2";
  referenceCount: 2 | 3;
  referenceMode: "dual" | "single";
  requestId: string;
};

type ReserveRow = {
  outcome: BudgetReservationOutcome;
  request_id: string | null;
  request_status: TryonLedgerStatus | null;
};

const safeInteger = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;

/**
 * Calls the migration-defined reservation function. The bucket row is locked
 * before idempotency and spend are checked, so two Vercel instances cannot
 * both reserve the same remaining budget or the same deliberate action.
 */
export async function reserveTryonBudget(
  input: ReserveTryonBudgetInput,
): Promise<BudgetReservation> {
  if (
    !/^\d{4}-\d{2}$/.test(input.period) ||
    !safeInteger(input.limitMicroUsd) ||
    !safeInteger(input.forecastMicroUsd) ||
    input.forecastMicroUsd === 0
  ) {
    return { outcome: "invalid_amount", requestId: null, requestStatus: null };
  }

  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    SELECT outcome, request_id, request_status
    FROM public.ftt_ai_tryon_reserve(
      ${input.period},
      ${input.limitMicroUsd},
      ${input.requestId}::uuid,
      ${input.idempotencyHash},
      ${input.sessionTag},
      ${input.background},
      ${input.provider},
      ${input.requestedModel},
      ${input.promptVersion},
      ${input.engineVersion},
      ${input.outputVersion},
      ${LEGACY_REGENERATION},
      ${input.forecastMicroUsd}
    )
  `) as ReserveRow[];
  const row = rows[0];
  if (!row) throw new Error("TRYON_BUDGET_RESERVATION_FAILED");
  return {
    outcome: row.outcome,
    requestId: row.request_id,
    requestStatus: row.request_status,
  };
}

/** Atomically attach only authoritative product/reference metadata. */
export async function bindTryonRequestProduct(
  input: BindTryonRequestProductInput,
): Promise<boolean> {
  if (
    input.referenceContractVersion !== "gallery-v2" ||
    input.productReferenceVersion.length < 1 ||
    input.productReferenceVersion.length > 256 ||
    /[^\x20-\x7e]/.test(input.productReferenceVersion) ||
    (input.referenceMode !== "single" && input.referenceMode !== "dual") ||
    (input.referenceCount !== 2 && input.referenceCount !== 3) ||
    (input.referenceMode === "single" && input.referenceCount !== 2) ||
    (input.referenceMode === "dual" && input.referenceCount !== 3)
  ) {
    return false;
  }
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    UPDATE public.ai_tryon_requests
    SET product_id = ${input.productId}::uuid,
        reference_contract_version = ${input.referenceContractVersion},
        product_reference_version = ${input.productReferenceVersion},
        reference_mode = ${input.referenceMode},
        reference_count = ${input.referenceCount}
    WHERE request_id = ${input.requestId}::uuid
      AND status = 'reserved'
      AND product_id IS NULL
      AND reference_contract_version IS NULL
      AND product_reference_version IS NULL
      AND reference_mode IS NULL
      AND reference_count IS NULL
    RETURNING request_id
  `) as Array<{ request_id: string }>;
  return rows.length === 1;
}

/**
 * Records the final application-side dispatch attempt. The legacy Postgres
 * enum value `in_progress` is retained for migration compatibility; it means
 * dispatch was attempted, not that the provider acknowledged the request.
 */
export async function markTryonProviderDispatchAttempted(
  requestId: string,
): Promise<boolean> {
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    UPDATE public.ai_tryon_requests
    SET status = 'in_progress'
    WHERE request_id = ${requestId}::uuid
      AND status = 'reserved'
      AND product_id IS NOT NULL
      AND reference_contract_version IS NOT NULL
      AND product_reference_version IS NOT NULL
      AND reference_mode IS NOT NULL
      AND reference_count IS NOT NULL
    RETURNING request_id
  `) as Array<{ request_id: string }>;
  return rows.length === 1;
}

/** Settle or release the reservation exactly once. */
export async function finalizeTryonBudget(
  input: FinalizeTryonBudgetInput,
): Promise<boolean> {
  if (input.actualMicroUsd !== null && !safeInteger(input.actualMicroUsd)) {
    throw new Error("TRYON_INVALID_ACTUAL_COST");
  }
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    SELECT public.ftt_ai_tryon_finalize(
      ${input.requestId}::uuid,
      ${input.status}::public.ai_tryon_request_status,
      ${input.actualMicroUsd},
      ${input.servedModel},
      ${input.latencyMs},
      ${input.outputByteSize},
      ${input.errorCode}
    ) AS finalized
  `) as Array<{ finalized: boolean }>;
  return rows[0]?.finalized === true;
}

export type ReconcileStaleTryonBudgetResult = {
  periods: string[];
  processedPeriods: number;
};

/**
 * Runs the migration-defined recovery independently of customer traffic.
 * Periods come only from metadata rows already in Postgres; no customer image,
 * IP, prompt, provider payload, or result data is selected.
 */
export async function reconcileStaleTryonBudgets(): Promise<ReconcileStaleTryonBudgetResult> {
  const { rawSql } = await import("@/db");
  const candidates = (await rawSql`
    SELECT DISTINCT budget_period
    FROM public.ai_tryon_requests
    WHERE status IN ('reserved', 'in_progress')
      AND created_at < now() - INTERVAL '10 minutes'
    ORDER BY budget_period
    LIMIT 24
  `) as Array<{ budget_period: string }>;
  const periods = candidates
    .map((row) => row.budget_period)
    .filter((period) => /^\d{4}-\d{2}$/.test(period));
  for (const period of periods) {
    await rawSql`
      SELECT public.ftt_ai_tryon_reconcile_stale(${period})
    `;
  }
  return { periods, processedPeriods: periods.length };
}

/** Constant-time comparison helper for opaque ledger identities in tests/tools. */
export function sameOpaqueIdentity(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
