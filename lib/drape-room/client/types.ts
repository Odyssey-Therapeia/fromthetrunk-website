import type { DrapeSaree } from "@/lib/drape-room/product";

export const DRAPE_ROOM_STYLE = "nivi" as const;

export const DRAPE_ROOM_BACKGROUNDS = [
  "studio",
  "festival",
  "wedding",
  "party",
  "birthday",
] as const;

export type DrapeRoomBackground = (typeof DRAPE_ROOM_BACKGROUNDS)[number];
export type DrapeRoomProviderId = "google" | "openai";

export interface PublicTryOnConfig {
  enabled: boolean;
  provider: DrapeRoomProviderId;
  providerDisplayName: string;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  outputMimeType: "image/jpeg";
  aspectRatio: "3:4";
  imageSize: "1K";
  disclosureVersion: string;
  privacyPolicyVersion: string;
  providerPolicyUrl: string;
  providerRetentionSummary: string;
}

/** In-memory only. The token is opaque and bound server-side to this config. */
export interface DrapeRoomConfigSnapshot {
  config: PublicTryOnConfig;
  consentToken: string;
}

export type DrapeRoomConfigStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable";

/**
 * Presentation and paid generation are deliberately separate concerns.
 * The complete browser-local Drape Room needs only `uiAvailable`; a new AI
 * request additionally needs the fail-closed generation fields below.
 */
export interface DrapeRoomAvailability {
  uiAvailable: boolean;
  configStatus: DrapeRoomConfigStatus;
  generationAvailable: boolean;
  config: PublicTryOnConfig | null;
  consentToken: string | null;
}

export type DrapeRoomGenerationReason =
  | "first-look"
  | "background-change"
  | "regenerate";

export interface DrapeRoomPhotoView {
  digest: string;
  previewUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface DrapeRoomRenderView {
  cacheKey: string;
  previewUrl: string;
  productId: string;
  background: DrapeRoomBackground;
  createdAt: number;
}

export interface DrapeRoomGenerateInput {
  photo: Blob;
  photoDigest: string;
  consentToken: string;
  product: DrapeSaree;
  background: DrapeRoomBackground;
  idempotencyKey: string;
  regeneration: boolean;
}

export interface DrapeRoomGenerationIdentity {
  requestId: string;
  provider: DrapeRoomProviderId;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  productReferenceVersion: string;
}

export interface DrapeRoomDailyQuota {
  limit: 3;
  used: 0 | 1 | 2 | 3;
  remaining: 0 | 1 | 2 | 3;
  resetAt: number;
}

export interface DrapeRoomGeneratedImage {
  blob: Blob;
  dailyQuota: DrapeRoomDailyQuota;
  identity: DrapeRoomGenerationIdentity;
}

export type DrapeRoomMaybePromise<T> = T | Promise<T>;

export function isDrapeRoomBackground(
  value: unknown,
): value is DrapeRoomBackground {
  return (
    typeof value === "string" &&
    DRAPE_ROOM_BACKGROUNDS.some((background) => background === value)
  );
}

export function buildDrapeRoomConsentIdentity(
  config: Pick<
    PublicTryOnConfig,
    "provider" | "disclosureVersion" | "privacyPolicyVersion"
  >,
): string {
  return [
    "consent",
    config.provider,
    config.disclosureVersion,
    config.privacyPolicyVersion,
  ].join(".");
}
