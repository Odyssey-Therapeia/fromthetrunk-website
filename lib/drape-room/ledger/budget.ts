import { timingSafeEqual } from "node:crypto";

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
  regeneration: boolean;
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
      ${input.regeneration},
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

/** Attach only the product ID that the authoritative server lookup verified. */
export async function bindTryonRequestProduct(
  requestId: string,
  productId: string,
): Promise<boolean> {
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    UPDATE public.ai_tryon_requests
    SET product_id = ${productId}::uuid
    WHERE request_id = ${requestId}::uuid
      AND status = 'reserved'
      AND product_id IS NULL
    RETURNING request_id
  `) as Array<{ request_id: string }>;
  return rows.length === 1;
}

export async function markTryonProviderStarted(requestId: string): Promise<boolean> {
  const { rawSql } = await import("@/db");
  const rows = (await rawSql`
    UPDATE public.ai_tryon_requests
    SET status = 'in_progress'
    WHERE request_id = ${requestId}::uuid AND status = 'reserved'
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

/** Constant-time comparison helper for opaque ledger identities in tests/tools. */
export function sameOpaqueIdentity(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
