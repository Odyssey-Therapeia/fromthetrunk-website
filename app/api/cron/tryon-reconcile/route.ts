import { handleTryonReconciliationRequest } from "@/lib/drape-room/server/reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;

export function GET(request: Request): Promise<Response> {
  return handleTryonReconciliationRequest(request);
}
