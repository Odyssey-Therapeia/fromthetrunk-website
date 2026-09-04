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
  type TryOnCostReservation,
  type TryOnGarmentReferences,
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
  products: TryOnGarmentReferences;
  model: string;
  signal?: AbortSignal;
  beforeProviderCall?: (context: {
    costReservation: GenerateClassicNiviResult["costReservation"];
    referenceCount: 2 | 3;
  }) => void | Promise<void>;
};

export type GenerateClassicNiviResult = {
  image: ValidatedBinaryImage;
  promptVersion: typeof CLASSIC_NIVI_PROMPT_VERSION;
  usage: TryOnProviderUsage;
  costReservation: TryOnCostReservation;
  servedModel: string;
  latencyMs: number;
};

/**
 * Provider rejections the application already classifies into a public 4xx.
 * These are ordinary outcomes, not faults to page anyone about.
 */
const EXPECTED_PROVIDER_REJECTIONS = new Set(["invalid_request", "safety_rejected"]);

function expectedRejectionCode(error: unknown): string | null {
  if (error instanceof ImageValidationError) return error.code;
  if (error instanceof DrapeReferenceValidationError) return error.validationCode;
  if (
    error instanceof DrapeProviderError &&
    EXPECTED_PROVIDER_REJECTIONS.has(error.code)
  ) {
    return error.code;
  }
  return null;
}

/**
 * Records a generation failure once. An expected rejection is traced with its
 * bounded code only — the terminal outcome line already reports it — while an
 * unclassified fault keeps the error-level line and the error-tracker capture.
 */
function observeGenerationFailure(
  stage: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const rejectionCode = expectedRejectionCode(error);
  if (rejectionCode === null) {
    observeTryonFailure(stage, error, meta);
    return;
  }
  observeTryonStage(stage, {
    ...meta,
    errorCode: rejectionCode,
    errorName: error instanceof Error ? error.name : typeof error,
    expectedRejection: true,
  });
}

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
    observeGenerationFailure("reference_normalization", error, { role });
    if (error instanceof ImageValidationError) {
      throw new DrapeReferenceValidationError(role, error.code);
    }
    throw error;
  }
}

/** Validates the person and one/two product references, then calls the provider once. */
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
      productDetailSourceBytes: input.products[1]?.bytes.byteLength ?? null,
      productPrimarySourceBytes: input.products[0].bytes.byteLength,
      productReferenceMode: input.products.length === 1 ? "single" : "dual",
      referenceCount: input.products.length + 1,
      subjectSourceBytes: input.subject.bytes.byteLength,
    },
  );
  if (signal.aborted) throw signalFailure(signal);
  if (!provider.supportsModel(input.model)) {
    throw new DrapeProviderError("model_not_found", 503);
  }

  let subject: ValidatedBinaryImage | null = null;
  let productPrimary: ValidatedBinaryImage | null = null;
  let productDetail: ValidatedBinaryImage | null = null;
  let providerOutputBytes: Uint8Array | null = null;

  try {
    subject = await validateReference("subject", input.subject);
    productPrimary = await validateReference(
      "product-primary",
      input.products[0],
    );
    productDetail = input.products[1]
      ? await validateReference("product-detail", input.products[1])
      : null;
    const referenceMode = productDetail ? "dual" : "single";
    const referenceCount = productDetail ? 3 : 2;
    const prompt = buildClassicNiviPrompt(input.background, referenceMode);
    observeTryonStage("prompt_contract_ready", {
      promptVersion: CLASSIC_NIVI_PROMPT_VERSION,
      referenceCount,
      referenceMode,
    });
    const costReservation = provider.estimateCostReservation({
      imageSize: "1K",
      model: input.model,
      referenceCount,
    });
    const garments: TryOnGarmentReferences = productDetail
      ? [
          { bytes: productPrimary.bytes, mimeType: productPrimary.mimeType },
          { bytes: productDetail.bytes, mimeType: productDetail.mimeType },
        ]
      : [{ bytes: productPrimary.bytes, mimeType: productPrimary.mimeType }];
    if (signal.aborted) {
      throw signalFailure(signal);
    }
    await input.beforeProviderCall?.({ costReservation, referenceCount });
    // Do not add an abort branch between dispatch accounting and invoking the
    // adapter. Once the hook commits conservative quota/ledger state, the
    // adapter invocation is the very next operation and owns signal handling.
    const providerRequest = provider.generate({
      aspectRatio: "3:4",
      garments,
      imageSize: "1K",
      model: input.model,
      person: {
        bytes: subject.bytes,
        mimeType: subject.mimeType,
      },
      prompt,
      signal,
    });
    observeTryonStage("provider_adapter_invoked", {
      garmentDetailBytes: productDetail?.bytes.byteLength ?? null,
      garmentDetailMimeType: productDetail?.mimeType ?? null,
      garmentPrimaryBytes: productPrimary.bytes.byteLength,
      garmentPrimaryMimeType: productPrimary.mimeType,
      model: input.model,
      personBytes: subject.bytes.byteLength,
      personMimeType: subject.mimeType,
      provider: provider.id,
      referenceCount,
      referenceMode,
    });
    const generated = await providerRequest;
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
      costReservation,
      image: normalizedOutput,
      latencyMs: generated.latencyMs,
      promptVersion: CLASSIC_NIVI_PROMPT_VERSION,
      servedModel: generated.servedModel,
      usage: generated.usage,
    };
  } catch (error) {
    observeGenerationFailure("generation_pipeline", error, {
      model: input.model,
      provider: provider.id,
    });
    throw error;
  } finally {
    subject?.bytes.fill(0);
    productPrimary?.bytes.fill(0);
    productDetail?.bytes.fill(0);
    providerOutputBytes?.fill(0);
    observeTryonStage("generation_buffers_cleared");
  }
}
