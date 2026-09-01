export const IMAGE_PROVIDER_MODELS = {
  google: {
    model: "gemini-3.1-flash-image",
    conservativeEstimateMicroUsd: 100_000,
    pricingVersion: "google-1k-ceiling-2026-08-v2",
  },
  openai: {
    model: "gpt-image-2",
    conservativeEstimateMicroUsd: 200_000,
    pricingVersion: "openai-1k-ceiling-2026-08-v1",
  },
} as const;

export type ImageProviderId = keyof typeof IMAGE_PROVIDER_MODELS;
export type DrapeProviderId = ImageProviderId;
export type GoogleImageModelId =
  (typeof IMAGE_PROVIDER_MODELS)["google"]["model"];
export type OpenAiImageModelId =
  (typeof IMAGE_PROVIDER_MODELS)["openai"]["model"];
export type ImageModelId = GoogleImageModelId | OpenAiImageModelId;

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export type BinaryImage = {
  bytes: Uint8Array;
  mimeType: SupportedImageMimeType;
};

export type TryOnGenerationInput = {
  model: string;
  prompt: string;
  person: BinaryImage;
  /** IMAGE 2 full-look reference, then IMAGE 3 complementary textile detail. */
  garments: [BinaryImage, BinaryImage];
  aspectRatio: "3:4";
  imageSize: "1K";
  signal: AbortSignal;
};

export type TryOnProviderUsage = {
  providerReported: boolean;
  inputUnits: number | null;
  outputUnits: number | null;
  actualMicroUsd: number | null;
  usageVersion: string;
};

export type TryOnGenerationResult = {
  image: BinaryImage;
  servedModel: string;
  usage: TryOnProviderUsage;
  latencyMs: number;
};

export type ProviderDisclosure = {
  providerDisplayName: string;
  policyUrl: string;
  retentionSummary: string;
  disclosureVersion: string;
};

export const PROVIDER_DISCLOSURES: Record<
  ImageProviderId,
  Omit<ProviderDisclosure, "disclosureVersion">
> = Object.freeze({
  google: {
    policyUrl: "https://ai.google.dev/gemini-api/terms",
    providerDisplayName: "Google Gemini",
    retentionSummary:
      "Google processes the submitted images under the Gemini API terms and the data-use controls applicable to From the Trunk's configured API account.",
  },
  openai: {
    policyUrl: "https://openai.com/policies/api-data-usage-policies/",
    providerDisplayName: "OpenAI",
    retentionSummary:
      "OpenAI processes the submitted images under its API data-usage policy and the retention controls applicable to From the Trunk's configured API account.",
  },
});

export interface TryOnImageProvider {
  readonly id: DrapeProviderId;
  readonly disclosure: ProviderDisclosure;
  supportsModel(model: string): boolean;
  generate(input: TryOnGenerationInput): Promise<TryOnGenerationResult>;
  estimateMaximumCost(input: {
    model: string;
    referenceCount: 3;
    imageSize: "1K";
  }): {
    microUsd: number;
    conservative: true;
    pricingVersion: string;
  };
}

export type DrapeProviderErrorCode =
  | "authentication_failed"
  | "cancelled"
  | "deadline_exceeded"
  | "invalid_request"
  | "invalid_response"
  | "model_not_found"
  | "rate_limited"
  | "safety_rejected"
  | "upstream_unavailable";

const PUBLIC_ERROR_MESSAGES: Record<DrapeProviderErrorCode, string> = {
  authentication_failed:
    "Try-on is unavailable just now. Please try again shortly.",
  cancelled: "The try-on was cancelled.",
  deadline_exceeded:
    "The try-on took too long. It was not retried automatically.",
  invalid_request:
    "That photo could not be used. Please try a clear, fully clothed photo.",
  invalid_response: "We could not verify this try-on preview.",
  model_not_found:
    "Try-on is unavailable just now. Please try again shortly.",
  rate_limited: "Try-on is busy right now. Please try again in a moment.",
  safety_rejected:
    "That photo could not be used. Please try a clear, fully clothed photo.",
  upstream_unavailable:
    "Try-on is unavailable just now. Please try again shortly.",
};

/** Contains no provider body, request, URL, credential, or prompt. */
export class DrapeProviderError extends Error {
  readonly publicMessage: string;

  constructor(
    readonly code: DrapeProviderErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "DrapeProviderError";
    this.publicMessage = PUBLIC_ERROR_MESSAGES[code];
  }
}

export function isImageProviderId(value: unknown): value is ImageProviderId {
  return value === "google" || value === "openai";
}

export function isImageModelId(value: unknown): value is ImageModelId {
  return (
    value === IMAGE_PROVIDER_MODELS.google.model ||
    value === IMAGE_PROVIDER_MODELS.openai.model
  );
}

export function isAllowedProviderModelPair(
  provider: unknown,
  model: unknown,
): provider is ImageProviderId {
  return (
    isImageProviderId(provider) &&
    model === IMAGE_PROVIDER_MODELS[provider].model
  );
}

export function estimateProviderMaximumCost(
  provider: ImageProviderId,
  model: string,
): { microUsd: number; conservative: true; pricingVersion: string } {
  if (!isAllowedProviderModelPair(provider, model)) {
    throw new DrapeProviderError("model_not_found", 500);
  }
  const entry = IMAGE_PROVIDER_MODELS[provider];
  return {
    conservative: true,
    microUsd: entry.conservativeEstimateMicroUsd,
    pricingVersion: entry.pricingVersion,
  };
}

export function emptyProviderUsage(
  usageVersion = "unreported-v1",
): TryOnProviderUsage {
  return {
    actualMicroUsd: null,
    inputUnits: null,
    outputUnits: null,
    providerReported: false,
    usageVersion,
  };
}

export function normalizedUnitCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function statusToProviderError(status: number): DrapeProviderError {
  if (status === 400 || status === 413 || status === 422) {
    return new DrapeProviderError("invalid_request", 400);
  }
  if (status === 401 || status === 403) {
    return new DrapeProviderError("authentication_failed", 503);
  }
  if (status === 404) {
    return new DrapeProviderError("model_not_found", 503);
  }
  if (status === 429) {
    return new DrapeProviderError("rate_limited", 503);
  }
  return new DrapeProviderError("upstream_unavailable", 503);
}

export function unknownToProviderError(
  error: unknown,
  signal?: AbortSignal,
): DrapeProviderError {
  if (error instanceof DrapeProviderError) return error;
  if (signal?.reason instanceof DrapeProviderError) return signal.reason;
  if (
    signal?.aborted ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new DrapeProviderError("cancelled", 499);
  }
  if (typeof error === "object" && error !== null) {
    const status =
      Reflect.get(error, "status") ?? Reflect.get(error, "statusCode");
    if (typeof status === "number") return statusToProviderError(status);
  }
  return new DrapeProviderError("upstream_unavailable", 503);
}

// Compatibility aliases are server-only types and keep the implementation
// vocabulary concise while the public contract remains the TryOn* interface.
export type ImageGenerationProvider = TryOnImageProvider;
export type ProviderGenerationInput = TryOnGenerationInput;
export type ProviderGenerationResult = TryOnGenerationResult;
export type NormalizedProviderUsage = TryOnProviderUsage;
