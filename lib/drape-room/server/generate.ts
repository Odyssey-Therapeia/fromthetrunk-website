import {
  ImageValidationError,
  MAX_CUSTOMER_SOURCE_BYTES,
  MAX_PRODUCT_SOURCE_BYTES,
  validateAndNormalizeProviderImage,
  validateAndNormalizeReferenceImage,
  type ValidatedBinaryImage,
} from "@/lib/drape-room/server/image-validation";
import {
  buildClassicNiviPrompt,
  CLASSIC_NIVI_PROMPT_VERSION,
  type DrapeBackground,
} from "@/lib/drape-room/server/prompt";
import {
  DrapeProviderError,
  type BinaryImage,
  type TryOnImageProvider,
  type TryOnProviderUsage,
} from "@/lib/drape-room/server/provider";
import {
  observeTryonFailure,
  observeTryonStage,
} from "@/lib/drape-room/server/observability";

export type GenerateClassicNiviInput = {
  background: DrapeBackground;
  subject: BinaryImage;
  products: [BinaryImage, BinaryImage];
  model: string;
  signal?: AbortSignal;
  beforeProviderCall?: () => void | Promise<void>;
};

export type GenerateClassicNiviResult = {
  image: ValidatedBinaryImage;
  promptVersion: typeof CLASSIC_NIVI_PROMPT_VERSION;
  usage: TryOnProviderUsage;
  costEstimate: {
    microUsd: number;
    conservative: true;
    pricingVersion: string;
  };
  servedModel: string;
  latencyMs: number;
};

export class DrapeReferenceValidationError extends Error {
  constructor(
    readonly role: "subject" | "product-primary" | "product-detail",
    readonly validationCode: ImageValidationError["code"],
  ) {
    super(`invalid_${role}_reference`);
    this.name = "DrapeReferenceValidationError";
  }
}

function signalFailure(signal: AbortSignal): DrapeProviderError {
  return signal.reason instanceof DrapeProviderError
    ? signal.reason
    : new DrapeProviderError("cancelled", 499);
}

async function validateReference(
  role: "subject" | "product-primary" | "product-detail",
  image: BinaryImage,
): Promise<ValidatedBinaryImage> {
  observeTryonStage("reference_normalization_started", {
    role,
    sourceBytes: image.bytes.byteLength,
    sourceMimeType: image.mimeType,
  });
  try {
    const normalized = await validateAndNormalizeReferenceImage(image, {
      maxSourceBytes:
        role === "subject"
          ? MAX_CUSTOMER_SOURCE_BYTES
          : MAX_PRODUCT_SOURCE_BYTES,
    });
    observeTryonStage("reference_normalized", {
      height: normalized.height,
      normalizedBytes: normalized.bytes.byteLength,
      normalizedMimeType: normalized.mimeType,
      role,
      width: normalized.width,
    });
    return normalized;
  } catch (error) {
    observeTryonFailure("reference_normalization", error, { role });
    if (error instanceof ImageValidationError) {
      throw new DrapeReferenceValidationError(role, error.code);
    }
    throw error;
  }
}

/** Validates both references, then performs exactly one provider call. */
export async function generateClassicNiviDrape(
  provider: TryOnImageProvider,
  input: GenerateClassicNiviInput,
): Promise<GenerateClassicNiviResult> {
  const signal = input.signal ?? new AbortController().signal;
  observeTryonStage(
    "generation_pipeline_started",
    {
      background: input.background,
      model: input.model,
      productDetailSourceBytes: input.products[1].bytes.byteLength,
      productPrimarySourceBytes: input.products[0].bytes.byteLength,
      subjectSourceBytes: input.subject.bytes.byteLength,
    },
    "info",
  );
  if (signal.aborted) throw signalFailure(signal);
  if (!provider.supportsModel(input.model)) {
    throw new DrapeProviderError("model_not_found", 503);
  }

  const subject = await validateReference("subject", input.subject);
  const productPrimary = await validateReference(
    "product-primary",
    input.products[0],
  );
  const productDetail = await validateReference(
    "product-detail",
    input.products[1],
  );
  const prompt = buildClassicNiviPrompt(input.background);
  observeTryonStage("prompt_contract_ready", {
    promptVersion: CLASSIC_NIVI_PROMPT_VERSION,
  });
  const costEstimate = provider.estimateMaximumCost({
    imageSize: "1K",
    model: input.model,
    referenceCount: 3,
  });
  let providerOutputBytes: Uint8Array | null = null;

  try {
    if (signal.aborted) {
      throw signalFailure(signal);
    }
    await input.beforeProviderCall?.();
    observeTryonStage("provider_request_dispatched", {
      garmentDetailBytes: productDetail.bytes.byteLength,
      garmentDetailMimeType: productDetail.mimeType,
      garmentPrimaryBytes: productPrimary.bytes.byteLength,
      garmentPrimaryMimeType: productPrimary.mimeType,
      model: input.model,
      personBytes: subject.bytes.byteLength,
      personMimeType: subject.mimeType,
      provider: provider.id,
    });
    const generated = await provider.generate({
      aspectRatio: "3:4",
      garments: [
        {
          bytes: productPrimary.bytes,
          mimeType: productPrimary.mimeType,
        },
        {
          bytes: productDetail.bytes,
          mimeType: productDetail.mimeType,
        },
      ],
      imageSize: "1K",
      model: input.model,
      person: {
        bytes: subject.bytes,
        mimeType: subject.mimeType,
      },
      prompt,
      signal,
    });
    providerOutputBytes = generated.image.bytes;
    observeTryonStage(
      "provider_response_received",
      {
        latencyMs: generated.latencyMs,
        outputBytes: generated.image.bytes.byteLength,
        outputMimeType: generated.image.mimeType,
        providerReportedUsage: generated.usage.providerReported,
        servedModel: generated.servedModel,
      },
      "info",
    );
    if (
      !generated.servedModel ||
      generated.servedModel.length > 128 ||
      /[\r\n\0]/.test(generated.servedModel)
    ) {
      throw new DrapeProviderError("invalid_response", 502);
    }

    const normalizedOutput = await validateAndNormalizeProviderImage(
      generated.image,
    );
    observeTryonStage("provider_output_normalized", {
      height: normalizedOutput.height,
      normalizedBytes: normalizedOutput.bytes.byteLength,
      normalizedMimeType: normalizedOutput.mimeType,
      width: normalizedOutput.width,
    });

    return {
      costEstimate,
      image: normalizedOutput,
      latencyMs: generated.latencyMs,
      promptVersion: CLASSIC_NIVI_PROMPT_VERSION,
      servedModel: generated.servedModel,
      usage: generated.usage,
    };
  } catch (error) {
    observeTryonFailure("generation_pipeline", error, {
      model: input.model,
      provider: provider.id,
    });
    throw error;
  } finally {
    subject.bytes.fill(0);
    productPrimary.bytes.fill(0);
    productDetail.bytes.fill(0);
    providerOutputBytes?.fill(0);
    observeTryonStage("generation_buffers_cleared");
  }
}
