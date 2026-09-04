import {
  reconcileStaleTryonBudgets,
  type ReconcileStaleTryonBudgetResult,
} from "@/lib/drape-room/ledger/budget";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { createLogger } from "@/lib/log";

const log = createLogger("drape-room:reconciliation");
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export type TryonReconciliationDependencies = {
  cronSecret?: string;
  now?: () => number;
  reconcile?: () => Promise<ReconcileStaleTryonBudgetResult>;
};

/** CRON_SECRET-protected recovery for invocations terminated before settlement. */
export async function handleTryonReconciliationRequest(
  request: Request,
  dependencies: TryonReconciliationDependencies = {},
): Promise<Response> {
  const cronSecret = dependencies.cronSecret ?? process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { code: "CRON_SECRET_MISSING", message: "Cron authentication is unavailable." },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
  if (!verifyBearerSecret(request.headers.get("authorization"), cronSecret)) {
    return Response.json(
      { code: "UNAUTHORIZED", message: "Invalid cron credentials." },
      { headers: NO_STORE_HEADERS, status: 401 },
    );
  }

  try {
    const result = await (
      dependencies.reconcile ?? reconcileStaleTryonBudgets
    )();
    const completedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
    log.info("Try-on stale ledger reconciliation completed", {
      processedPeriods: result.processedPeriods,
    });
    return Response.json(
      {
        completedAt,
        ok: true,
        processedPeriods: result.processedPeriods,
      },
      { headers: NO_STORE_HEADERS, status: 200 },
    );
  } catch (error) {
    log.error("Try-on stale ledger reconciliation failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return Response.json(
      { code: "RECONCILIATION_FAILED", message: "Try-on reconciliation failed." },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
}
