import { handleTryonConfigRequest } from "@/lib/drape-room/server/config-response";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  return handleTryonConfigRequest(request);
}
