import { MAX_PROVIDER_IMAGE_BYTES } from "@/lib/drape-room/server/image-validation";
import {
  DrapeProviderError,
  IMAGE_PROVIDER_MODELS,
  PROVIDER_DISCLOSURES,
  estimateProviderMaximumCost,
  normalizedUnitCount,
  unknownToProviderError,
  type GoogleImageModelId,
  type ProviderDisclosure,
  type SupportedImageMimeType,
  type TryOnGenerationInput,
  type TryOnGenerationResult,
  type TryOnImageProvider,
  type TryOnProviderUsage,
} from "@/lib/drape-room/server/provider";
import { z } from "zod";

type GoogleInlineData = { data: string; mimeType: string };

export type GoogleGenerateContentRequest = {
  model: GoogleImageModelId;
  contents: Array<{ inlineData: GoogleInlineData } | { text: string }>;
  config: {
    abortSignal: AbortSignal;
    imageConfig: { aspectRatio: "3:4"; imageSize: "1K" };
    responseModalities: ["IMAGE"];
  };
};

/** Structural server-only seam backed by the official @google/genai client. */
export interface GoogleGenAiClientLike {
  models: {
    generateContent(input: GoogleGenerateContentRequest): Promise<unknown>;
  };
}

export type GoogleGenAiProviderOptions = {
  client: GoogleGenAiClientLike;
  requestTimeoutMs: number;
  disclosureVersion: string;
  now?: () => number;
};

const SUPPORTED_MIME = new Set<SupportedImageMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const GOOGLE_RESPONSE_SCHEMA = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z
                  .array(
                    z
                      .object({
                        inlineData: z
                          .object({
                            data: z.string(),
                            mimeType: z.string(),
                          })
                          .passthrough()
                          .optional(),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .passthrough()
              .optional(),
            finishReason: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    modelVersion: z.string().max(128).optional(),
    promptFeedback: z
      .object({ blockReason: z.string().optional() })
      .passthrough()
      .optional(),
    usageMetadata: z.unknown().optional(),
  })
  .passthrough();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeUsage(value: unknown): TryOnProviderUsage {
  const usage = asRecord(value);
  if (!usage) {
    return {
      actualMicroUsd: null,
      inputUnits: null,
      outputUnits: null,
      providerReported: false,
      usageVersion: "google-genai-v1",
    };
  }
  return {
    actualMicroUsd: null,
    inputUnits: normalizedUnitCount(usage.promptTokenCount),
    outputUnits: normalizedUnitCount(usage.candidatesTokenCount),
    providerReported: true,
    usageVersion: "google-genai-v1",
  };
}

function toCanonicalBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function decodeCanonicalBase64(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    !value ||
    value.length % 4 !== 0 ||
    value.length > Math.ceil(MAX_PROVIDER_IMAGE_BYTES / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new DrapeProviderError("invalid_response", 502);
  }
  const decoded = Buffer.from(value, "base64");
  if (!decoded.byteLength || decoded.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new DrapeProviderError("invalid_response", 502);
  }
  return Uint8Array.from(decoded);
}

function parseResponse(
  response: unknown,
  requestedModel: GoogleImageModelId,
  latencyMs: number,
): TryOnGenerationResult {
  const envelope = GOOGLE_RESPONSE_SCHEMA.safeParse(response);
  if (!envelope.success) {
    throw new DrapeProviderError("invalid_response", 502);
  }
  const root = envelope.data;
  if (typeof root.promptFeedback?.blockReason === "string") {
    throw new DrapeProviderError("safety_rejected", 422);
  }

  const candidate = root.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new DrapeProviderError("safety_rejected", 422);
  }
  const inlineData = candidate?.content?.parts
    ?.map((part) => part.inlineData)
    .find((part) => part?.data);
  if (
    !inlineData ||
    !SUPPORTED_MIME.has(inlineData.mimeType as SupportedImageMimeType)
  ) {
    throw new DrapeProviderError("invalid_response", 502);
  }

  return {
    image: {
      bytes: decodeCanonicalBase64(inlineData.data),
      mimeType: inlineData.mimeType as SupportedImageMimeType,
    },
    latencyMs,
    servedModel:
      typeof root.modelVersion === "string"
        ? root.modelVersion
        : requestedModel,
    usage: normalizeUsage(root.usageMetadata),
  };
}

export class GoogleGenAiImageProvider implements TryOnImageProvider {
  readonly id = "google" as const;
  readonly disclosure: ProviderDisclosure;

  constructor(private readonly options: GoogleGenAiProviderOptions) {
    this.disclosure = {
      ...PROVIDER_DISCLOSURES.google,
      disclosureVersion: options.disclosureVersion,
    };
  }

  supportsModel(model: string): boolean {
    return model === IMAGE_PROVIDER_MODELS.google.model;
  }

  estimateMaximumCost(input: {
    model: string;
    referenceCount: 3;
    imageSize: "1K";
  }) {
    if (input.referenceCount !== 3 || input.imageSize !== "1K") {
      throw new DrapeProviderError("invalid_request", 500);
    }
    return estimateProviderMaximumCost(this.id, input.model);
  }

  async generate(input: TryOnGenerationInput): Promise<TryOnGenerationResult> {
    if (!this.supportsModel(input.model)) {
      throw new DrapeProviderError("model_not_found", 503);
    }
    if (input.signal.aborted) {
      throw new DrapeProviderError("cancelled", 499);
    }

    const now = this.options.now ?? Date.now;
    const startedAt = now();
    const controller = new AbortController();
    let deadlineExceeded = false;
    const cancel = () => controller.abort();
    input.signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => {
      deadlineExceeded = true;
      controller.abort();
    }, this.options.requestTimeoutMs);

    try {
      const response = await this.options.client.models.generateContent({
        model: IMAGE_PROVIDER_MODELS.google.model,
        contents: [
          {
            inlineData: {
              data: toCanonicalBase64(input.person.bytes),
              mimeType: input.person.mimeType,
            },
          },
          {
            inlineData: {
              data: toCanonicalBase64(input.garments[0].bytes),
              mimeType: input.garments[0].mimeType,
            },
          },
          {
            inlineData: {
              data: toCanonicalBase64(input.garments[1].bytes),
              mimeType: input.garments[1].mimeType,
            },
          },
          { text: input.prompt },
        ],
        config: {
          abortSignal: controller.signal,
          imageConfig: {
            aspectRatio: input.aspectRatio,
            imageSize: input.imageSize,
          },
          responseModalities: ["IMAGE"],
        },
      });
      return parseResponse(
        response,
        IMAGE_PROVIDER_MODELS.google.model,
        Math.max(0, now() - startedAt),
      );
    } catch (error) {
      if (deadlineExceeded) {
        throw new DrapeProviderError("deadline_exceeded", 504);
      }
      throw unknownToProviderError(error, input.signal);
    } finally {
      clearTimeout(timeout);
      input.signal.removeEventListener("abort", cancel);
    }
  }
}

export function createGoogleGenAiImageProvider(
  options: GoogleGenAiProviderOptions,
): TryOnImageProvider {
  return new GoogleGenAiImageProvider(options);
}
