import {
  IMAGE_PROVIDER_MODELS,
  PROVIDER_DISCLOSURES,
  isAllowedProviderModelPair,
  isImageModelId,
  isImageProviderId,
  type ImageModelId,
  type ImageProviderId,
  type ProviderDisclosure,
} from "@/lib/drape-room/server/provider";
import { parseTryonAllowedOrigins } from "@/lib/drape-room/security/origin";
import {
  DRAPE_REFERENCE_CONTRACT_VERSION,
  type DrapeReferenceContractVersion,
} from "@/lib/drape-room/reference-contract";
import { z } from "zod";

const MIN_PROVIDER_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_TIMEOUT_MS = 210_000;
const MAX_API_KEY_LENGTH = 512;
const MAX_VERSION_LENGTH = 128;
const SECRET_MIN_BYTES = 32;

const ENV_RECORD_SCHEMA = z.record(
  z.string(),
  z.union([z.string(), z.undefined()]),
);
const ENABLED_SCHEMA = z.union([
  z.literal(""),
  z.literal("true"),
  z.literal("false"),
  z.undefined(),
]);
const PROVIDER_SCHEMA = z.enum(["google", "openai"]);
const MODEL_SCHEMA = z.enum(["gemini-3.1-flash-image", "gpt-image-2"]);
const POSITIVE_INTEGER_SCHEMA = z.string().regex(/^[1-9]\d*$/);
const VERSION_SCHEMA = z
  .string()
  .min(1)
  .max(MAX_VERSION_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const SECRET_SCHEMA = z
  .string()
  .min(SECRET_MIN_BYTES)
  .max(4_096)
  .refine((value) => !/[\r\n\0]/.test(value));
const API_KEY_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(MAX_API_KEY_LENGTH)
  .refine((value) => !/[\r\n\0]/.test(value));

const ENV = Object.freeze({
  allowedOrigins: "FTT_TRYON_ALLOWED_ORIGINS",
  disclosureVersion: "FTT_TRYON_DISCLOSURE_VERSION",
  enabled: "FTT_TRYON_ENABLED",
  engineVersion: "FTT_TRYON_ENGINE_VERSION",
  googleApiKey: "FTT_TRYON_GOOGLE_API_KEY",
  hmacSecret: "FTT_TRYON_HMAC_SECRET",
  ipHashSecret: "FTT_TRYON_IP_HASH_SECRET",
  model: "FTT_TRYON_MODEL",
  monthlyLimitMicroUsd: "FTT_TRYON_MONTHLY_LIMIT_MICRO_USD",
  openAiApiKey: "FTT_TRYON_OPENAI_API_KEY",
  outputVersion: "FTT_TRYON_OUTPUT_VERSION",
  privacyPolicyVersion: "FTT_PRIVACY_POLICY_VERSION",
  promptVersion: "FTT_TRYON_PROMPT_VERSION",
  provider: "FTT_TRYON_PROVIDER",
  providerTimeoutMs: "FTT_TRYON_PROVIDER_TIMEOUT_MS",
  sessionSecret: "FTT_TRYON_SESSION_SECRET",
} as const);

export type PublicTryOnConfig = {
  enabled: boolean;
  provider: ImageProviderId;
  providerDisplayName: string;
  model: string;
  promptVersion: string;
  referenceContractVersion: DrapeReferenceContractVersion;
  engineVersion: string;
  outputVersion: string;
  outputMimeType: "image/jpeg";
  aspectRatio: "3:4";
  imageSize: "1K";
  disclosureVersion: string;
  privacyPolicyVersion: string;
  providerPolicyUrl: string;
  providerRetentionSummary: string;
};

export type DisabledDrapeRoomConfig = {
  enabled: false;
  publicConfig: PublicTryOnConfig;
};

export type EnabledDrapeRoomConfig = {
  enabled: true;
  provider: ImageProviderId;
  model: ImageModelId;
  apiKey: string;
  requestTimeoutMs: number;
  allowedOrigins: ReadonlySet<string>;
  promptVersion: "nivi-v4";
  referenceContractVersion: DrapeReferenceContractVersion;
  engineVersion: string;
  outputVersion: string;
  disclosureVersion: string;
  privacyPolicyVersion: string;
  sessionSecret: string;
  hmacSecret: string;
  ipHashSecret: string;
  monthlyLimitMicroUsd: number;
  disclosure: ProviderDisclosure;
  publicConfig: PublicTryOnConfig;
};

export type DrapeRoomConfig = DisabledDrapeRoomConfig | EnabledDrapeRoomConfig;

export type DrapeRoomEnvironment = Readonly<
  Record<string, string | undefined> & {
    NODE_ENV?: "development" | "production" | "test";
  }
>;

export type DrapeRoomConfigErrorCode =
  | "incomplete_redis_configuration"
  | "invalid_api_key"
  | "invalid_enabled_flag"
  | "invalid_environment"
  | "invalid_infrastructure"
  | "invalid_model"
  | "invalid_monthly_limit"
  | "invalid_origins"
  | "invalid_provider"
  | "invalid_provider_model_pair"
  | "invalid_secret"
  | "invalid_timeout"
  | "invalid_version"
  | "missing_api_key"
  | "missing_model"
  | "missing_provider"
  | "missing_secret"
  | "missing_version"
  | "public_secret_forbidden"
  | "server_only";

export class DrapeRoomConfigError extends Error {
  constructor(readonly code: DrapeRoomConfigErrorCode) {
    super(code);
    this.name = "DrapeRoomConfigError";
  }
}

function rejectPublicSecrets(env: DrapeRoomEnvironment): void {
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      name.startsWith("NEXT_PUBLIC_") &&
      (name.includes("FTT_TRYON") ||
        name.includes("TRYON_GOOGLE_API_KEY") ||
        name.includes("TRYON_OPENAI_API_KEY"))
    ) {
      throw new DrapeRoomConfigError("public_secret_forbidden");
    }
  }
}

function parseEnabled(value: string | undefined): boolean {
  const result = ENABLED_SCHEMA.safeParse(value);
  if (!result.success) throw new DrapeRoomConfigError("invalid_enabled_flag");
  return result.data === "true";
}

function parsePositiveInteger(
  value: string | undefined,
  errorCode: "invalid_monthly_limit" | "invalid_timeout",
): number {
  const result = POSITIVE_INTEGER_SCHEMA.safeParse(value);
  if (!result.success) throw new DrapeRoomConfigError(errorCode);
  const parsed = Number(result.data);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new DrapeRoomConfigError(errorCode);
  }
  return parsed;
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value === "") {
    throw new DrapeRoomConfigError("invalid_timeout");
  }
  const parsed = parsePositiveInteger(value, "invalid_timeout");
  if (parsed < MIN_PROVIDER_TIMEOUT_MS || parsed > MAX_PROVIDER_TIMEOUT_MS) {
    throw new DrapeRoomConfigError("invalid_timeout");
  }
  return parsed;
}

function readApiKey(
  provider: ImageProviderId,
  env: DrapeRoomEnvironment,
): string {
  const value =
    provider === "google" ? env[ENV.googleApiKey] : env[ENV.openAiApiKey];
  if (!value?.trim()) throw new DrapeRoomConfigError("missing_api_key");
  const result = API_KEY_SCHEMA.safeParse(value);
  if (!result.success) throw new DrapeRoomConfigError("invalid_api_key");
  return result.data;
}

function readSecret(value: string | undefined): string {
  if (!value) throw new DrapeRoomConfigError("missing_secret");
  const result = SECRET_SCHEMA.safeParse(value);
  if (
    !result.success ||
    Buffer.byteLength(result.data, "utf8") < SECRET_MIN_BYTES ||
    Buffer.byteLength(result.data, "utf8") > 4_096
  ) {
    throw new DrapeRoomConfigError("invalid_secret");
  }
  return result.data;
}

function readVersion(value: string | undefined): string {
  if (!value) throw new DrapeRoomConfigError("missing_version");
  const result = VERSION_SCHEMA.safeParse(value);
  if (!result.success) throw new DrapeRoomConfigError("invalid_version");
  return result.data;
}

function providerFromEnvironment(env: DrapeRoomEnvironment): ImageProviderId {
  const value = env[ENV.provider];
  if (!value) throw new DrapeRoomConfigError("missing_provider");
  const result = PROVIDER_SCHEMA.safeParse(value);
  if (!result.success || !isImageProviderId(result.data)) {
    throw new DrapeRoomConfigError("invalid_provider");
  }
  return result.data;
}

function modelFromEnvironment(env: DrapeRoomEnvironment): ImageModelId {
  const value = env[ENV.model];
  if (!value) throw new DrapeRoomConfigError("missing_model");
  const result = MODEL_SCHEMA.safeParse(value);
  if (!result.success || !isImageModelId(result.data)) {
    throw new DrapeRoomConfigError("invalid_model");
  }
  return result.data;
}

function parsedEnvironment(
  env: DrapeRoomEnvironment,
  failClosed: boolean,
): DrapeRoomEnvironment {
  // `process.env` is a host object rather than an ordinary object on supported
  // Node runtimes. Zod's record parser deliberately rejects that prototype, so
  // normalise the enumerable values before validation. Values are still
  // validated below; this is not a coercion boundary.
  const plainEnvironment = Object.fromEntries(Object.entries(env));
  const result = ENV_RECORD_SCHEMA.safeParse(plainEnvironment);
  if (result.success) return result.data as DrapeRoomEnvironment;
  if (failClosed) throw new DrapeRoomConfigError("invalid_environment");
  return {};
}

function publicConfig(input: {
  enabled: boolean;
  provider: ImageProviderId;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  disclosureVersion: string;
  privacyPolicyVersion: string;
}): PublicTryOnConfig {
  const disclosure = PROVIDER_DISCLOSURES[input.provider];
  return {
    aspectRatio: "3:4",
    disclosureVersion: input.disclosureVersion,
    enabled: input.enabled,
    engineVersion: input.engineVersion,
    imageSize: "1K",
    model: input.model,
    outputMimeType: "image/jpeg",
    outputVersion: input.outputVersion,
    privacyPolicyVersion: input.privacyPolicyVersion,
    promptVersion: input.promptVersion,
    referenceContractVersion: DRAPE_REFERENCE_CONTRACT_VERSION,
    provider: input.provider,
    providerDisplayName: disclosure.providerDisplayName,
    providerPolicyUrl: disclosure.policyUrl,
    providerRetentionSummary: disclosure.retentionSummary,
  };
}

/** A redacted, disabled shape for config errors and the default-off state. */
export function disabledPublicTryOnConfig(
  env: DrapeRoomEnvironment = process.env,
): PublicTryOnConfig {
  env = parsedEnvironment(env, false);
  const providerValue = env[ENV.provider];
  const provider: ImageProviderId = isImageProviderId(providerValue)
    ? providerValue
    : "google";
  const configuredModel = env[ENV.model];
  const model =
    isImageModelId(configuredModel) &&
    isAllowedProviderModelPair(provider, configuredModel)
      ? configuredModel
      : IMAGE_PROVIDER_MODELS[provider].model;
  const safeVersion = (value: string | undefined, fallback: string) =>
    value &&
    value.length <= MAX_VERSION_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
      ? value
      : fallback;
  return publicConfig({
    disclosureVersion: safeVersion(
      env[ENV.disclosureVersion],
      "provider-disclosure-v1",
    ),
    enabled: false,
    engineVersion: safeVersion(env[ENV.engineVersion], "storefront-v1"),
    model,
    outputVersion: safeVersion(env[ENV.outputVersion], "jpeg-1k-v1"),
    privacyPolicyVersion: safeVersion(
      env[ENV.privacyPolicyVersion],
      "2026-08-ai-v1",
    ),
    promptVersion: "nivi-v4",
    provider,
  });
}

function assertProductionInfrastructure(env: DrapeRoomEnvironment): void {
  if (env.NODE_ENV !== "production") return;
  const redisUrl = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const redisToken =
    env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (Boolean(redisUrl) !== Boolean(redisToken)) {
    throw new DrapeRoomConfigError("incomplete_redis_configuration");
  }
  if (!redisUrl || !redisToken || !env.DATABASE_URL) {
    throw new DrapeRoomConfigError("invalid_infrastructure");
  }
}

/**
 * Reads the server-only paid-generation contract. Provider/model selection and
 * every secret come exclusively from exact server environment names.
 */
export function readDrapeRoomConfig(
  env: DrapeRoomEnvironment = process.env,
): DrapeRoomConfig {
  if (typeof window !== "undefined") {
    throw new DrapeRoomConfigError("server_only");
  }
  env = parsedEnvironment(env, true);
  rejectPublicSecrets(env);
  if (!parseEnabled(env[ENV.enabled])) {
    return { enabled: false, publicConfig: disabledPublicTryOnConfig(env) };
  }

  const provider = providerFromEnvironment(env);
  const model = modelFromEnvironment(env);
  if (!isAllowedProviderModelPair(provider, model)) {
    throw new DrapeRoomConfigError("invalid_provider_model_pair");
  }
  const originResult = parseTryonAllowedOrigins(
    env[ENV.allowedOrigins],
    env.NODE_ENV,
  );
  if (!originResult.ok) throw new DrapeRoomConfigError("invalid_origins");

  const promptVersion = readVersion(env[ENV.promptVersion]);
  if (promptVersion !== "nivi-v4") {
    throw new DrapeRoomConfigError("invalid_version");
  }
  const engineVersion = readVersion(env[ENV.engineVersion]);
  const outputVersion = readVersion(env[ENV.outputVersion]);
  const disclosureVersion = readVersion(env[ENV.disclosureVersion]);
  const privacyPolicyVersion = readVersion(env[ENV.privacyPolicyVersion]);
  const monthlyLimitMicroUsd = parsePositiveInteger(
    env[ENV.monthlyLimitMicroUsd],
    "invalid_monthly_limit",
  );
  assertProductionInfrastructure(env);

  const disclosure = {
    ...PROVIDER_DISCLOSURES[provider],
    disclosureVersion,
  };
  const clientConfig = publicConfig({
    disclosureVersion,
    enabled: true,
    engineVersion,
    model,
    outputVersion,
    privacyPolicyVersion,
    promptVersion,
    provider,
  });

  return {
    allowedOrigins: originResult.origins,
    apiKey: readApiKey(provider, env),
    disclosure,
    disclosureVersion,
    enabled: true,
    engineVersion,
    hmacSecret: readSecret(env[ENV.hmacSecret]),
    ipHashSecret: readSecret(env[ENV.ipHashSecret]),
    model,
    monthlyLimitMicroUsd,
    outputVersion,
    privacyPolicyVersion,
    promptVersion,
    referenceContractVersion: DRAPE_REFERENCE_CONTRACT_VERSION,
    provider,
    publicConfig: clientConfig,
    requestTimeoutMs: parseTimeout(env[ENV.providerTimeoutMs]),
    sessionSecret: readSecret(env[ENV.sessionSecret]),
  };
}

export const FTT_TRYON_ENV_NAMES = Object.freeze(Object.values(ENV));
