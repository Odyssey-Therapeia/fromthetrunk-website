import { MAX_PROVIDER_IMAGE_BYTES } from "@/lib/drape-room/server/image-validation";
import {
  DrapeProviderError,
  IMAGE_PROVIDER_MODELS,
  PROVIDER_DISCLOSURES,
  estimateProviderMaximumCost,
  normalizedUnitCount,
  unknownToProviderError,
  type ProviderDisclosure,
  type SupportedImageMimeType,
  type TryOnGenerationInput,
  type TryOnGenerationResult,
  type TryOnImageProvider,
  type TryOnProviderUsage,
} from "@/lib/drape-room/server/provider";
import { z } from "zod";

export type OpenAiImageEditRequest = {
  image: File[];
  model: "gpt-image-2";
  prompt: string;
  n: 1;
  size: "1024x1536";
  quality: "medium";
  input_fidelity: "high";
  background: "opaque";
  output_format: "jpeg";
  output_compression: 90;
};

/** Structural server-only seam backed by the official openai client. */
export interface OpenAiClientLike {
  images: {
    edit(
      input: OpenAiImageEditRequest,
      options: { signal: AbortSignal },
    ): Promise<unknown>;
  };
}

export type OpenAiImageProviderOptions = {
  client: OpenAiClientLike;
  requestTimeoutMs: number;
  disclosureVersion: string;
  now?: () => number;
};

const OPENAI_RESPONSE_SCHEMA = z
  .object({
    data: z
      .array(
        z.object({ b64_json: z.string() }).passthrough(),
      )
      .min(1),
    output_format: z.enum(["png", "webp", "jpeg"]).optional(),
    usage: z
      .object({
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
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
      usageVersion: "openai-images-v1",
    };
  }
  return {
    actualMicroUsd: null,
    inputUnits: normalizedUnitCount(usage.input_tokens),
    outputUnits: normalizedUnitCount(usage.output_tokens),
    providerReported: true,
    usageVersion: "openai-images-v1",
  };
}

type InputImageRole = "subject" | "product-context" | "product-detail";

function filenameFor(role: InputImageRole, mimeType: string): string {
  if (mimeType === "image/png") return `${role}.png`;
  if (mimeType === "image/webp") return `${role}.webp`;
  return `${role}.jpg`;
}

function imageFile(
  role: InputImageRole,
  image: TryOnGenerationInput["person"],
): File {
  const body = image.bytes.buffer.slice(
    image.bytes.byteOffset,
    image.bytes.byteOffset + image.bytes.byteLength,
  ) as ArrayBuffer;
  return new File([body], filenameFor(role, image.mimeType), {
    type: image.mimeType,
  });
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

function mimeFromResponse(value: unknown): SupportedImageMimeType {
  if (value === "png") return "image/png";
  if (value === "webp") return "image/webp";
  if (value === "jpeg" || value === undefined) return "image/jpeg";
  throw new DrapeProviderError("invalid_response", 502);
}

function parseResponse(
  value: unknown,
  latencyMs: number,
): TryOnGenerationResult {
  const envelope = OPENAI_RESPONSE_SCHEMA.safeParse(value);
  if (!envelope.success) {
    throw new DrapeProviderError("invalid_response", 502);
  }
  const response = envelope.data;
  const first = response.data[0];
  return {
    image: {
      bytes: decodeCanonicalBase64(first.b64_json),
      mimeType: mimeFromResponse(response.output_format),
    },
    latencyMs,
    servedModel: IMAGE_PROVIDER_MODELS.openai.model,
    usage: normalizeUsage(response.usage),
  };
}

export class OpenAiImageProvider implements TryOnImageProvider {
  readonly id = "openai" as const;
  readonly disclosure: ProviderDisclosure;

  constructor(private readonly options: OpenAiImageProviderOptions) {
    this.disclosure = {
      ...PROVIDER_DISCLOSURES.openai,
      disclosureVersion: options.disclosureVersion,
    };
  }

  supportsModel(model: string): boolean {
    return model === IMAGE_PROVIDER_MODELS.openai.model;
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
      const response = await this.options.client.images.edit(
        {
          background: "opaque",
          image: [
            imageFile("subject", input.person),
            imageFile("product-context", input.garments[0]),
            imageFile("product-detail", input.garments[1]),
          ],
          input_fidelity: "high",
          model: IMAGE_PROVIDER_MODELS.openai.model,
          n: 1,
          output_compression: 90,
          output_format: "jpeg",
          prompt: input.prompt,
          quality: "medium",
          size: "1024x1536",
        },
        { signal: controller.signal },
      );
      return parseResponse(response, Math.max(0, now() - startedAt));
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

export function createOpenAiImageProvider(
  options: OpenAiImageProviderOptions,
): TryOnImageProvider {
  return new OpenAiImageProvider(options);
}
