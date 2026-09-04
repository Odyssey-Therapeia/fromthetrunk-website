"use client";

import { z } from "zod";

import type {
  DrapeRoomConfigSnapshot,
  DrapeRoomDailyQuota,
  DrapeRoomGeneratedImage,
  DrapeRoomGenerateInput,
  DrapeRoomGenerationIdentity,
} from "./types";

const MAX_GENERATED_BYTES = 3_800_000;
export const DRAPE_ROOM_CONSENT_TOKEN_HEADER =
  "X-FTT-Tryon-Consent-Token" as const;
const CONSENT_TOKEN_PATTERN =
  /^v1\.\d{13}\.\d{13}\.[A-Za-z0-9_-]{43}$/;
const publicConfigSchema = z
  .object({
    enabled: z.literal(true),
    provider: z.enum(["google", "openai"]),
    providerDisplayName: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).max(200),
    promptVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    referenceContractVersion: z.literal("gallery-v2"),
    engineVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    outputVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    outputMimeType: z.literal("image/jpeg"),
    aspectRatio: z.literal("3:4"),
    imageSize: z.literal("1K"),
    disclosureVersion: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    privacyPolicyVersion: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    providerPolicyUrl: z.string().url().refine((value) => value.startsWith("https://")),
    providerRetentionSummary: z.string().trim().min(1).max(500),
  })
  .strict();
const publicErrorSchema = z
  .object({
    code: z.string().max(80),
    message: z.string().max(240).optional(),
  })
  .strict();
const generationIdentitySchema = z
  .object({
    requestId: z.string().trim().min(1).max(200),
    provider: z.enum(["google", "openai"]),
    model: z.string().trim().min(1).max(200),
    promptVersion: z.string().trim().min(1).max(200),
    referenceContractVersion: z.literal("gallery-v2"),
    engineVersion: z.string().trim().min(1).max(200),
    outputVersion: z.string().trim().min(1).max(200),
    productReferenceVersion: z.string().trim().min(1).max(200),
  })
  .strict();
const PUBLIC_ERROR_CODES = new Set([
  "TRYON_DISABLED",
  "TRYON_CONFIGURATION_INVALID",
  "TRYON_SESSION_REQUIRED",
  "TRYON_FORBIDDEN_ORIGIN",
  "PHOTO_REQUIRED",
  "PHOTO_INVALID",
  "PHOTO_TOO_LARGE",
  "CONSENT_REQUIRED",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_NOT_ELIGIBLE",
  "REFERENCE_UNAVAILABLE",
  "TRYON_RATE_LIMITED",
  "TRYON_PRODUCT_DAILY_LIMIT",
  "TRYON_ALREADY_PROCESSING",
  "TRYON_ALREADY_COMPLETED",
  "TRYON_BUDGET_PAUSED",
  "PROVIDER_REJECTED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "OUTPUT_INVALID",
  "LOCAL_STORAGE_UNAVAILABLE",
  "UNKNOWN",
]);

export class DrapeRoomClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly dailyQuota: DrapeRoomDailyQuota | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "DrapeRoomClientError";
  }
}

export interface DrapeRoomClientTransport {
  loadConfig: () => Promise<DrapeRoomConfigSnapshot | null>;
  generate: (input: DrapeRoomGenerateInput) => Promise<DrapeRoomGeneratedImage>;
}

export const browserDrapeRoomTransport: DrapeRoomClientTransport = {
  loadConfig: fetchPublicTryOnConfig,
  generate: generateDrapeRoomImage,
};

export async function fetchPublicTryOnConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<DrapeRoomConfigSnapshot | null> {
  const response = await fetchImpl("/api/tryon/config", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  const parsed = publicConfigSchema.safeParse(value);
  const consentToken = response.headers.get(DRAPE_ROOM_CONSENT_TOKEN_HEADER);
  if (
    !parsed.success ||
    !consentToken ||
    !CONSENT_TOKEN_PATTERN.test(consentToken)
  ) {
    return null;
  }
  return { config: parsed.data, consentToken };
}

/** Called only from an explicit Create or confirmed-background handler. */
export async function generateDrapeRoomImage(
  input: DrapeRoomGenerateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DrapeRoomGeneratedImage> {
  if (!CONSENT_TOKEN_PATTERN.test(input.consentToken)) {
    throw new DrapeRoomClientError(
      "CONSENT_REQUIRED",
      "Refresh the Drape Room disclosure before generating.",
    );
  }
  const form = new FormData();
  form.set("photo", input.photo, "photo.jpg");
  form.set("productId", input.product.productId);
  form.set("background", input.background);
  form.set("idempotencyKey", input.idempotencyKey);

  const response = await fetchImpl("/api/tryon/generate", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    body: form,
    headers: {
      Accept: "image/jpeg, application/json",
      [DRAPE_ROOM_CONSENT_TOKEN_HEADER]: input.consentToken,
    },
  });

  if (!response.ok) {
    const parsedError = publicErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    const payload = parsedError.success ? parsedError.data : null;
    const code =
      typeof payload?.code === "string" && PUBLIC_ERROR_CODES.has(payload.code)
        ? payload.code
        : "UNKNOWN";
    const defaultMessage =
      code === "PROVIDER_TIMEOUT"
        ? "The provider response was uncertain, so the system did not retry automatically."
        : "The Drape Room could not create this preview.";
    const dailyQuota = readDailyQuotaHeaders(
      response.headers,
      code === "TRYON_PRODUCT_DAILY_LIMIT",
    );
    const retryAfterSeconds = readRetryAfterSeconds(
      response.headers,
      code === "TRYON_PRODUCT_DAILY_LIMIT",
    );
    if (process.env.NODE_ENV !== "test") {
      console.error("[FTT Drape Room] generation request failed", {
        code,
        httpStatus: response.status,
        retryAfter: response.headers.get("retry-after"),
        traceId: response.headers.get("x-ftt-tryon-trace-id"),
      });
    }
    throw new DrapeRoomClientError(
      code,
      typeof payload?.message === "string" && payload.message.length <= 240
        ? payload.message
        : defaultMessage,
      dailyQuota,
      retryAfterSeconds,
    );
  }

  if (response.headers.get("content-type")?.split(";", 1)[0] !== "image/jpeg") {
    throw new DrapeRoomClientError("OUTPUT_INVALID", "The generated image was invalid.");
  }
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > MAX_GENERATED_BYTES) {
    throw new DrapeRoomClientError("OUTPUT_INVALID", "The generated image was invalid.");
  }
  const signature = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (
    signature.length !== 3 ||
    signature[0] !== 0xff ||
    signature[1] !== 0xd8 ||
    signature[2] !== 0xff
  ) {
    throw new DrapeRoomClientError("OUTPUT_INVALID", "The generated image was invalid.");
  }

  const identity = readGenerationIdentity(response.headers);
  const dailyQuota = readDailyQuotaHeaders(response.headers, true);
  if (!dailyQuota) {
    throw new DrapeRoomClientError(
      "OUTPUT_INVALID",
      "The generated image quota metadata was invalid.",
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[FTT Drape Room] generation request succeeded", {
      httpStatus: response.status,
      model: identity.model,
      outputBytes: blob.size,
      provider: identity.provider,
      remainingToday: dailyQuota.remaining,
      requestId: identity.requestId,
      traceId: response.headers.get("x-ftt-tryon-trace-id"),
    });
  }
  return { blob, dailyQuota, identity };
}

export function createDrapeRoomIdempotencyKey(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new DrapeRoomClientError("UNKNOWN", "Secure request identity is unavailable.");
  return value;
}

function readGenerationIdentity(headers: Headers): DrapeRoomGenerationIdentity {
  const parsed = generationIdentitySchema.safeParse({
    requestId: requiredHeader(headers, "X-FTT-Tryon-Request-Id"),
    provider: requiredHeader(headers, "X-FTT-Tryon-Provider"),
    model: requiredHeader(headers, "X-FTT-Tryon-Model"),
    promptVersion: requiredHeader(headers, "X-FTT-Tryon-Prompt-Version"),
    referenceContractVersion: requiredHeader(
      headers,
      "X-FTT-Tryon-Reference-Contract-Version",
    ),
    engineVersion: requiredHeader(headers, "X-FTT-Tryon-Engine-Version"),
    outputVersion: requiredHeader(headers, "X-FTT-Tryon-Output-Version"),
    productReferenceVersion: requiredHeader(
      headers,
      "X-FTT-Tryon-Product-Reference-Version",
    ),
  });
  if (!parsed.success) {
    throw new DrapeRoomClientError("OUTPUT_INVALID", "The generated image identity was invalid.");
  }
  return parsed.data;
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value || value.length > 200 || /[\r\n\0]/.test(value)) {
    throw new DrapeRoomClientError("OUTPUT_INVALID", "The generated image identity was invalid.");
  }
  return value;
}

function readDailyQuotaHeaders(
  headers: Headers,
  required: boolean,
): DrapeRoomDailyQuota | null {
  const raw = {
    limit: headers.get("X-FTT-Tryon-Daily-Limit"),
    remaining: headers.get("X-FTT-Tryon-Daily-Remaining"),
    resetAt: headers.get("X-FTT-Tryon-Daily-Reset-At"),
    used: headers.get("X-FTT-Tryon-Daily-Used"),
  };
  const present = Object.values(raw).filter((value) => value !== null).length;
  if (present === 0 && !required) return null;
  if (present !== 4) return invalidDailyQuota();

  const limit = strictHeaderInteger(raw.limit);
  const used = strictHeaderInteger(raw.used);
  const remaining = strictHeaderInteger(raw.remaining);
  const resetAt = Date.parse(raw.resetAt ?? "");
  if (
    limit !== 3 ||
    used === null ||
    used < 0 ||
    used > 3 ||
    remaining === null ||
    remaining < 0 ||
    remaining > 3 ||
    remaining !== limit - used ||
    !Number.isSafeInteger(resetAt) ||
    resetAt <= 0 ||
    new Date(resetAt).toISOString() !== raw.resetAt
  ) {
    return invalidDailyQuota();
  }
  return {
    limit: 3,
    remaining: remaining as 0 | 1 | 2 | 3,
    resetAt,
    used: used as 0 | 1 | 2 | 3,
  };
}

function readRetryAfterSeconds(headers: Headers, required: boolean): number | null {
  const value = headers.get("Retry-After");
  if (value === null && !required) return null;
  const seconds = strictHeaderInteger(value);
  if (seconds === null || seconds < 1) {
    throw new DrapeRoomClientError(
      "OUTPUT_INVALID",
      "The generated image quota metadata was invalid.",
    );
  }
  return seconds;
}

function strictHeaderInteger(value: string | null): number | null {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function invalidDailyQuota(): never {
  throw new DrapeRoomClientError(
    "OUTPUT_INVALID",
    "The generated image quota metadata was invalid.",
  );
}
