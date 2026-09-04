import { handleTryonGenerateRequest } from "@/lib/drape-room/server/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: Request): Promise<Response> {
  return handleTryonGenerateRequest(request);
}
