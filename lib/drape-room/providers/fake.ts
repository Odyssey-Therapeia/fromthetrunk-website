import {
  IMAGE_PROVIDER_MODELS,
  PROVIDER_DISCLOSURES,
  emptyProviderUsage,
  estimateProviderCostReservation,
  type BinaryImage,
  type ImageModelId,
  type ImageProviderId,
  type ProviderDisclosure,
  type TryOnGenerationInput,
  type TryOnGenerationResult,
  type TryOnImageProvider,
  type TryOnProviderUsage,
  type TryOnReferenceCount,
} from "@/lib/drape-room/server/provider";

export type FakeImageProviderOptions = {
  output: BinaryImage;
  provider?: ImageProviderId;
  servedModel?: string;
  usage?: TryOnProviderUsage;
  latencyMs?: number;
  disclosureVersion?: string;
  onGenerate?: (
    input: TryOnGenerationInput,
  ) => void | Promise<void>;
  estimateMicroUsd?: (referenceCount: TryOnReferenceCount) => number;
};

/** Test-only deterministic provider with no transport or network fallback. */
export class FakeImageProvider implements TryOnImageProvider {
  readonly id: ImageProviderId;
  readonly model: ImageModelId;
  readonly disclosure: ProviderDisclosure;
  readonly requests: TryOnGenerationInput[] = [];
  readonly estimatedReferenceCounts: TryOnReferenceCount[] = [];

  constructor(private readonly options: FakeImageProviderOptions) {
    this.id = options.provider ?? "google";
    this.model = IMAGE_PROVIDER_MODELS[this.id].model;
    this.disclosure = {
      ...PROVIDER_DISCLOSURES[this.id],
      disclosureVersion:
        options.disclosureVersion ?? "provider-disclosure-v1",
    };
  }

  supportsModel(model: string): boolean {
    return model === this.model;
  }

  estimateCostReservation(input: {
    model: string;
    referenceCount: TryOnReferenceCount;
    imageSize: "1K";
  }) {
    this.estimatedReferenceCounts.push(input.referenceCount);
    const estimate = estimateProviderCostReservation(
      this.id,
      input.model,
      input.referenceCount,
    );
    return this.options.estimateMicroUsd
      ? { ...estimate, microUsd: this.options.estimateMicroUsd(input.referenceCount) }
      : estimate;
  }

  async generate(input: TryOnGenerationInput): Promise<TryOnGenerationResult> {
    this.requests.push(input);
    await this.options.onGenerate?.(input);
    return {
      image: {
        bytes: Uint8Array.from(this.options.output.bytes),
        mimeType: this.options.output.mimeType,
      },
      latencyMs: this.options.latencyMs ?? 1,
      servedModel: this.options.servedModel ?? this.model,
      usage: this.options.usage ?? emptyProviderUsage("fake-v1"),
    };
  }
}

export function createFakeImageProvider(
  options: FakeImageProviderOptions,
): FakeImageProvider {
  return new FakeImageProvider(options);
}
