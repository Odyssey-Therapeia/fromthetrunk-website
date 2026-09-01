import {
  createGoogleGenAiImageProvider,
  type GoogleGenAiClientLike,
} from "@/lib/drape-room/providers/google-genai";
import {
  createOpenAiImageProvider,
  type OpenAiClientLike,
} from "@/lib/drape-room/providers/openai";
import type { DrapeRoomConfig } from "@/lib/drape-room/server/config";
import {
  isAllowedProviderModelPair,
  type TryOnImageProvider,
} from "@/lib/drape-room/server/provider";

export type ProviderRegistryDependencies = {
  createGoogleClient?: (
    apiKey: string,
    requestTimeoutMs: number,
  ) => GoogleGenAiClientLike | Promise<GoogleGenAiClientLike>;
  createOpenAiClient?: (
    apiKey: string,
    requestTimeoutMs: number,
  ) => OpenAiClientLike | Promise<OpenAiClientLike>;
};

export type ProviderRegistryErrorCode =
  | "drape_room_disabled"
  | "invalid_provider_model_pair"
  | "provider_client_unavailable";

export class ProviderRegistryError extends Error {
  constructor(readonly code: ProviderRegistryErrorCode) {
    super(code);
    this.name = "ProviderRegistryError";
  }
}

async function productionGoogleClient(
  apiKey: string,
  requestTimeoutMs: number,
): Promise<GoogleGenAiClientLike> {
  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      retryOptions: { attempts: 1 },
      timeout: requestTimeoutMs,
    },
  }) as unknown as GoogleGenAiClientLike;
}

async function productionOpenAiClient(
  apiKey: string,
  requestTimeoutMs: number,
): Promise<OpenAiClientLike> {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: requestTimeoutMs,
  }) as unknown as OpenAiClientLike;
}

/** Resolves exactly one configured official SDK adapter; never falls back. */
export async function createConfiguredImageProvider(
  config: DrapeRoomConfig,
  dependencies: ProviderRegistryDependencies = {},
): Promise<TryOnImageProvider> {
  if (!config.enabled) {
    throw new ProviderRegistryError("drape_room_disabled");
  }
  if (!isAllowedProviderModelPair(config.provider, config.model)) {
    throw new ProviderRegistryError("invalid_provider_model_pair");
  }

  try {
    if (config.provider === "google") {
      const createClient =
        dependencies.createGoogleClient ?? productionGoogleClient;
      const client = await createClient(config.apiKey, config.requestTimeoutMs);
      return createGoogleGenAiImageProvider({
        client,
        disclosureVersion: config.disclosureVersion,
        requestTimeoutMs: config.requestTimeoutMs,
      });
    }

    const createClient =
      dependencies.createOpenAiClient ?? productionOpenAiClient;
    const client = await createClient(config.apiKey, config.requestTimeoutMs);
    return createOpenAiImageProvider({
      client,
      disclosureVersion: config.disclosureVersion,
      requestTimeoutMs: config.requestTimeoutMs,
    });
  } catch (error) {
    if (error instanceof ProviderRegistryError) throw error;
    throw new ProviderRegistryError("provider_client_unavailable");
  }
}
