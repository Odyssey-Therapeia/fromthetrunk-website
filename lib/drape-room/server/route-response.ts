import { TryonRouteError } from "@/lib/drape-room/server/route-errors";
import { safeTryonHeaderValue } from "@/lib/drape-room/server/route-contract";
import type { ProductDailyQuota } from "@/lib/drape-room/security/product-daily-quota";

export function tryonDailyQuotaHeaders(quota: ProductDailyQuota): Headers {
  if (
    quota.limit !== 3 ||
    !Number.isInteger(quota.used) ||
    quota.used < 0 ||
    quota.used > quota.limit ||
    !Number.isInteger(quota.remaining) ||
    quota.remaining !== quota.limit - quota.used ||
    !Number.isSafeInteger(quota.resetAt) ||
    quota.resetAt <= 0
  ) {
    throw new TryonRouteError("OUTPUT_INVALID", 502);
  }
  const resetAt = new Date(quota.resetAt).toISOString();
  return new Headers({
    "X-FTT-Tryon-Daily-Limit": String(quota.limit),
    "X-FTT-Tryon-Daily-Remaining": String(quota.remaining),
    "X-FTT-Tryon-Daily-Reset-At": resetAt,
    "X-FTT-Tryon-Daily-Used": String(quota.used),
  });
}

export function rawTryonImageResponse(input: {
  bytes: Uint8Array;
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  productReferenceVersion: string;
  dailyQuota: ProductDailyQuota;
}): Response {
  const metadata = [
    input.requestId,
    input.provider,
    input.model,
    input.promptVersion,
    input.engineVersion,
    input.outputVersion,
    input.productReferenceVersion,
  ];
  if (metadata.some((value) => !safeTryonHeaderValue(value))) {
    throw new TryonRouteError("OUTPUT_INVALID", 502);
  }
  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": "image/jpeg",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-FTT-Tryon-Engine-Version": input.engineVersion,
      "X-FTT-Tryon-Model": input.model,
      "X-FTT-Tryon-Output-Version": input.outputVersion,
      "X-FTT-Tryon-Product-Reference-Version":
        input.productReferenceVersion,
      "X-FTT-Tryon-Prompt-Version": input.promptVersion,
      "X-FTT-Tryon-Provider": input.provider,
      "X-FTT-Tryon-Request-Id": input.requestId,
  });
  tryonDailyQuotaHeaders(input.dailyQuota).forEach((value, key) =>
    headers.set(key, value),
  );
  return new Response(body, {
    headers,
    status: 200,
  });
}
