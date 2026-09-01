import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeImageProvider } from "@/lib/drape-room/providers/fake";
import {
  createGoogleGenAiImageProvider,
  type GoogleGenerateContentRequest,
} from "@/lib/drape-room/providers/google-genai";
import {
  createOpenAiImageProvider,
  type OpenAiImageEditRequest,
} from "@/lib/drape-room/providers/openai";
import { readDrapeRoomConfig } from "@/lib/drape-room/server/config";
import { generateClassicNiviDrape } from "@/lib/drape-room/server/generate";
import {
  DrapeProviderError,
  emptyProviderUsage,
  type TryOnGenerationInput,
} from "@/lib/drape-room/server/provider";
import { createConfiguredImageProvider } from "@/lib/drape-room/server/registry";

const serverSecret = (label: string) => `${label}-${"x".repeat(40)}`;
const enabledTryonEnv = () => ({
  FTT_PRIVACY_POLICY_VERSION: "2026-08-ai-v1",
  FTT_TRYON_ALLOWED_ORIGINS: "https://www.fromthetrunk.shop",
  FTT_TRYON_DISCLOSURE_VERSION: "provider-disclosure-v1",
  FTT_TRYON_ENABLED: "true",
  FTT_TRYON_ENGINE_VERSION: "storefront-v1",
  FTT_TRYON_GOOGLE_API_KEY: "server-google-key",
  FTT_TRYON_HMAC_SECRET: serverSecret("hmac"),
  FTT_TRYON_IP_HASH_SECRET: serverSecret("ip"),
  FTT_TRYON_MODEL: "gemini-3.1-flash-image",
  FTT_TRYON_MONTHLY_LIMIT_MICRO_USD: "5000000",
  FTT_TRYON_OUTPUT_VERSION: "jpeg-1k-v1",
  FTT_TRYON_PROMPT_VERSION: "nivi-v3",
  FTT_TRYON_PROVIDER: "google",
  FTT_TRYON_PROVIDER_TIMEOUT_MS: "210000",
  FTT_TRYON_SESSION_SECRET: serverSecret("session"),
  NODE_ENV: "test" as const,
});

async function fixture(
  format: "jpeg" | "webp" = "jpeg",
  width = 640,
  height = 800,
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: {
      background: { b: 80, g: 50, r: 110 },
      channels: 3,
      height,
      width,
    },
  });
  const body =
    format === "jpeg"
      ? await pipeline.jpeg().toBuffer()
      : await pipeline.webp().toBuffer();
  return Uint8Array.from(body);
}

async function providerInput(): Promise<TryOnGenerationInput> {
  const source = await fixture();
  const primary = Uint8Array.from(source);
  const detail = Uint8Array.from(source);
  primary[primary.length - 1] = (primary[primary.length - 1]! + 1) % 256;
  detail[detail.length - 1] = (detail[detail.length - 1]! + 2) % 256;
  return {
    aspectRatio: "3:4",
    garments: [
      { bytes: primary, mimeType: "image/jpeg" },
      { bytes: detail, mimeType: "image/jpeg" },
    ],
    imageSize: "1K",
    model: "gemini-3.1-flash-image",
    person: { bytes: source, mimeType: "image/jpeg" },
    prompt: "fixed server prompt",
    signal: new AbortController().signal,
  };
}

async function largeTrustedProductPng(): Promise<Uint8Array> {
  const width = 1_536;
  const height = 1_536;
  const channels = 3;
  const raw = Buffer.allocUnsafe(width * height * channels);
  let state = 0x87654321;
  for (let index = 0; index < raw.length; index += 1) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    raw[index] = state & 0xff;
  }
  return Uint8Array.from(
    await sharp(raw, { raw: { channels, height, width } })
      .png({ compressionLevel: 0 })
      .toBuffer(),
  );
}

describe("Drape Room provider adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adapts the official Google SDK seam and normalizes its binary result", async () => {
    const output = await fixture("webp", 768, 1_024);
    let request: GoogleGenerateContentRequest | undefined;
    const provider = createGoogleGenAiImageProvider({
      client: {
        models: {
          generateContent: vi.fn(async (input) => {
            request = input;
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          data: Buffer.from(output).toString("base64"),
                          mimeType: "image/webp",
                        },
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                candidatesTokenCount: 1120,
                promptTokenCount: 3000,
              },
            };
          }),
        },
      },
      disclosureVersion: "provider-disclosure-v1",
      now: () => 100,
      requestTimeoutMs: 5_000,
    });

    const input = await providerInput();
    const result = await provider.generate(input);

    expect(result.image.bytes).toEqual(output);
    expect(result).toMatchObject({
      servedModel: "gemini-3.1-flash-image",
      usage: {
        actualMicroUsd: null,
        inputUnits: 3000,
        outputUnits: 1120,
        providerReported: true,
        usageVersion: "google-genai-v1",
      },
    });
    expect(request?.contents).toHaveLength(4);
    expect(request?.contents).toEqual([
      {
        inlineData: {
          data: Buffer.from(input.person.bytes).toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      {
        inlineData: {
          data: Buffer.from(input.garments[0].bytes).toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      {
        inlineData: {
          data: Buffer.from(input.garments[1].bytes).toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      { text: "fixed server prompt" },
    ]);
    expect(request?.config).toMatchObject({
      imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      responseModalities: ["IMAGE"],
    });
  });

  it("uses the injected official OpenAI images.edit seam with three ordered files", async () => {
    const output = await fixture("jpeg", 1_024, 1_536);
    let captured: OpenAiImageEditRequest | undefined;
    const edit = vi.fn(async (input: OpenAiImageEditRequest) => {
      captured = input;
      return {
        data: [{ b64_json: Buffer.from(output).toString("base64") }],
        output_format: "jpeg",
        usage: {
          input_tokens: 900,
          output_tokens: 1200,
        },
      };
    });
    const provider = createOpenAiImageProvider({
      client: { images: { edit } },
      disclosureVersion: "provider-disclosure-v1",
      requestTimeoutMs: 5_000,
    });
    const input = await providerInput();

    const result = await provider.generate({
      ...input,
      model: "gpt-image-2",
    });

    expect(edit).toHaveBeenCalledOnce();
    expect(captured?.image).toHaveLength(3);
    expect(captured?.image.map((file) => file.name)).toEqual([
      "subject.jpg",
      "product-context.jpg",
      "product-detail.jpg",
    ]);
    expect(captured).toMatchObject({
      input_fidelity: "high",
      model: "gpt-image-2",
      output_format: "jpeg",
      size: "1024x1536",
    });
    expect(result).toMatchObject({
      servedModel: "gpt-image-2",
      usage: {
        inputUnits: 900,
        outputUnits: 1200,
        providerReported: true,
      },
    });
  });

  it("never exposes an upstream body or credential through errors", async () => {
    const secret = "openai-server-secret";
    const provider = createOpenAiImageProvider({
      client: {
        images: {
          edit: vi.fn(async () => {
            throw Object.assign(new Error(`raw ${secret}`), { status: 401 });
          }),
        },
      },
      disclosureVersion: "provider-disclosure-v1",
      requestTimeoutMs: 5_000,
    });
    const input = await providerInput();

    try {
      await provider.generate({ ...input, model: "gpt-image-2" });
      throw new Error("expected provider to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DrapeProviderError);
      expect(error).toMatchObject({ code: "authentication_failed" });
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(String(error)).not.toContain("raw");
    }
  });

  it("rejects malformed Google and OpenAI envelopes at their Zod boundaries", async () => {
    const google = createGoogleGenAiImageProvider({
      client: {
        models: {
          generateContent: vi.fn(async () => ({ candidates: "not-an-array" })),
        },
      },
      disclosureVersion: "provider-disclosure-v1",
      requestTimeoutMs: 5_000,
    });
    await expect(google.generate(await providerInput())).rejects.toMatchObject({
      code: "invalid_response",
    });

    const openai = createOpenAiImageProvider({
      client: {
        images: {
          edit: vi.fn(async () => ({ data: [{ b64_json: 123 }] })),
        },
      },
      disclosureVersion: "provider-disclosure-v1",
      requestTimeoutMs: 5_000,
    });
    const input = await providerInput();
    await expect(
      openai.generate({ ...input, model: "gpt-image-2" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("resolves only the configured official SDK client and never falls back", async () => {
    const config = readDrapeRoomConfig(enabledTryonEnv());
    if (!config.enabled) throw new Error("expected enabled configuration");
    const googleClient = {
      models: { generateContent: vi.fn() },
    };
    const openAiFactory = vi.fn();
    const provider = await createConfiguredImageProvider(config, {
      createGoogleClient: vi.fn(async () => googleClient),
      createOpenAiClient: openAiFactory,
    });

    expect(provider.id).toBe("google");
    expect(provider.supportsModel(config.model)).toBe(true);
    expect(openAiFactory).not.toHaveBeenCalled();
  });

  it("runs the provider-neutral Nivi core once and emits exact 3:4 JPEG", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const output = await fixture("webp", 1_024, 1_536);
    const provider = createFakeImageProvider({
      output: { bytes: output, mimeType: "image/webp" },
      usage: emptyProviderUsage("fake-v1"),
    });
    const source = await fixture();

    const result = await generateClassicNiviDrape(provider, {
      background: "birthday",
      model: "gemini-3.1-flash-image",
      products: [
        { bytes: Uint8Array.from(source), mimeType: "image/jpeg" },
        { bytes: Uint8Array.from(source), mimeType: "image/jpeg" },
      ],
      subject: { bytes: source, mimeType: "image/jpeg" },
    });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].person.mimeType).toBe("image/jpeg");
    expect(provider.requests[0].garments).toHaveLength(2);
    expect(provider.requests[0].garments[0].mimeType).toBe("image/jpeg");
    expect(provider.requests[0].garments[1].mimeType).toBe("image/jpeg");
    expect(provider.requests[0].prompt).toContain("CLASSIC NIVI DRAPE");
    expect(result).toMatchObject({
      costEstimate: {
        conservative: true,
        microUsd: 100_000,
        pricingVersion: "google-1k-ceiling-2026-08-v2",
      },
      image: { height: 1_536, mimeType: "image/jpeg", width: 1_152 },
      promptVersion: "nivi-v3",
      servedModel: "gemini-3.1-flash-image",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("normalizes a trusted product source above 2 MB before the single provider call", async () => {
    const subject = await fixture();
    const product = await largeTrustedProductPng();
    expect(product.byteLength).toBeGreaterThan(2_000_000);
    let observed: TryOnGenerationInput | null = null;
    const provider = createFakeImageProvider({
      onGenerate: (input) => {
        observed = {
          ...input,
          garments: input.garments.map((garment) => ({
            bytes: Uint8Array.from(garment.bytes),
            mimeType: garment.mimeType,
          })) as TryOnGenerationInput["garments"],
          person: {
            bytes: Uint8Array.from(input.person.bytes),
            mimeType: input.person.mimeType,
          },
        };
      },
      output: { bytes: await fixture("webp", 768, 1_024), mimeType: "image/webp" },
    });

    await generateClassicNiviDrape(provider, {
      background: "studio",
      model: "gemini-3.1-flash-image",
      products: [
        { bytes: Uint8Array.from(product), mimeType: "image/png" },
        { bytes: Uint8Array.from(product), mimeType: "image/png" },
      ],
      subject: { bytes: subject, mimeType: "image/jpeg" },
    });

    expect(provider.requests).toHaveLength(1);
    expect(observed).not.toBeNull();
    expect(observed!.person.mimeType).toBe("image/jpeg");
    expect(observed!.garments[0].mimeType).toBe("image/jpeg");
    expect(observed!.garments[1].mimeType).toBe("image/jpeg");
    expect(observed!.garments[0].bytes.byteLength).toBeLessThanOrEqual(2_000_000);
    expect(observed!.garments[1].bytes.byteLength).toBeLessThanOrEqual(2_000_000);
  });

  it("contains no test path that contacts a real provider host", async () => {
    const fetchGuard = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (
          url.includes("generativelanguage.googleapis.com") ||
          url.includes("api.openai.com")
        ) {
          throw new Error("REAL_PROVIDER_HOST_FORBIDDEN_IN_TEST");
        }
        return new Response(null, { status: 204 });
      },
    );
    const source = await fixture();
    const provider = createFakeImageProvider({
      output: { bytes: source, mimeType: "image/jpeg" },
    });
    await provider.generate({
      ...(await providerInput()),
      model: "gemini-3.1-flash-image",
    });
    expect(fetchGuard).not.toHaveBeenCalled();
  });
});
