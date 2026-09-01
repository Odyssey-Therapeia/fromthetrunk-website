"use client";

import {
  DRAPE_ROOM_STYLE,
  isDrapeRoomBackground,
  type DrapeRoomProviderId,
} from "./types";
import {
  MAX_CACHED_RENDER_BYTES,
  MAX_CACHED_RENDERS,
  USER_PHOTO_KEY,
  type DrapeRoomMetadataValue,
  type DrapeRoomRenderStats,
  type RenderCacheKeyInput,
  type RenderStoreForPruning,
  type SaveDrapeRenderInput,
  type SaveUserPhotoInput,
  type StoredDrapeRender,
  type StoredUserPhoto,
} from "./storage-schema";

const MAX_METADATA_BYTES = 32 * 1024;
const MAX_DIMENSION = 16_384;
const RENDER_CACHE_KEY_PATTERN = /^tryon:[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIME_TYPES = new Set(["image/jpeg", "image/webp"]);

export async function sha256Hex(
  input: Blob | ArrayBuffer | Uint8Array | string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 is unavailable in this browser.");

  let bytes: ArrayBuffer;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input).buffer as ArrayBuffer;
  } else if (input instanceof Blob) {
    bytes = await input.arrayBuffer();
  } else if (input instanceof Uint8Array) {
    bytes = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    ) as ArrayBuffer;
  } else {
    bytes = input;
  }

  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createRenderCacheKey(
  input: RenderCacheKeyInput,
): Promise<string> {
  const photoDigest = normalizeSha256(input.userPhotoDigest);
  if (!isDrapeRoomBackground(input.background)) {
    throw new Error("The Drape Room background is invalid.");
  }
  const parts = [
    photoDigest,
    normalizeCacheKeyPart(input.productId, "product id"),
    normalizeCacheKeyPart(
      input.productReferenceVersion,
      "product reference version",
    ),
    DRAPE_ROOM_STYLE,
    input.background,
    normalizeCacheKeyPart(input.provider, "provider"),
    normalizeCacheKeyPart(input.model, "model"),
    normalizeCacheKeyPart(input.promptVersion, "prompt version"),
    normalizeCacheKeyPart(input.engineVersion, "engine version"),
    normalizeCacheKeyPart(input.outputVersion, "output version"),
  ];
  return `tryon:${await sha256Hex(JSON.stringify(parts))}`;
}

export function isRenderCacheKey(value: unknown): value is string {
  return typeof value === "string" && RENDER_CACHE_KEY_PATTERN.test(value);
}

export function createUserPhotoRecord(
  input: SaveUserPhotoInput,
  updatedAt: number,
  createdAt: number,
): StoredUserPhoto {
  return {
    key: USER_PHOTO_KEY,
    blob: input.blob,
    mimeType: "image/jpeg",
    width: input.width,
    height: input.height,
    byteSize: input.blob.size,
    digest: normalizeSha256(input.digest),
    readiness: { ...input.readiness },
    createdAt,
    updatedAt,
  };
}

export function createRenderRecord(
  input: SaveDrapeRenderInput,
  lastViewedAt: number,
  createdAt: number,
): StoredDrapeRender {
  return {
    cacheKey: input.cacheKey,
    blob: input.blob,
    mimeType: input.blob.type as StoredDrapeRender["mimeType"],
    width: input.width,
    height: input.height,
    byteSize: input.blob.size,
    userPhotoDigest: normalizeSha256(input.userPhotoDigest),
    productId: normalizeCacheKeyPart(input.productId, "product id"),
    productSlug: normalizeCacheKeyPart(input.productSlug, "product slug"),
    productName: normalizeCacheKeyPart(input.productName, "product name"),
    productReferenceVersion: normalizeCacheKeyPart(
      input.productReferenceVersion,
      "product reference version",
    ),
    drape: DRAPE_ROOM_STYLE,
    background: input.background,
    provider: normalizeProvider(input.provider),
    model: normalizeCacheKeyPart(input.model, "model"),
    promptVersion: normalizeCacheKeyPart(input.promptVersion, "prompt version"),
    engineVersion: normalizeCacheKeyPart(input.engineVersion, "engine version"),
    outputVersion: normalizeCacheKeyPart(input.outputVersion, "output version"),
    createdAt,
    lastViewedAt,
  };
}

export function assertUserPhotoInput(input: SaveUserPhotoInput): void {
  if (!(input.blob instanceof Blob) || input.blob.size <= 0) {
    throw new Error("The user photo must contain image bytes.");
  }
  if (input.blob.type !== "image/jpeg") {
    throw new Error("The stored user photo must be a JPEG.");
  }
  assertDimensions(input.width, input.height);
  normalizeSha256(input.digest);
  if (
    input.readiness?.state !== "ready" ||
    typeof input.readiness.policyVersion !== "string" ||
    input.readiness.policyVersion.length === 0 ||
    !isSafeTimestamp(input.readiness.checkedAt)
  ) {
    throw new Error("The user photo readiness marker is invalid.");
  }
}

export function assertRenderInput(input: SaveDrapeRenderInput): void {
  assertRenderCacheKey(input.cacheKey);
  if (!(input.blob instanceof Blob) || input.blob.size <= 0) {
    throw new Error("The generated render must contain image bytes.");
  }
  if (!MIME_TYPES.has(input.blob.type)) {
    throw new Error("The generated render has an unsupported image type.");
  }
  if (input.blob.size > MAX_CACHED_RENDER_BYTES) {
    throw new Error("The generated render exceeds the browser cache limit.");
  }
  assertDimensions(input.width, input.height);
  normalizeSha256(input.userPhotoDigest);
  normalizeCacheKeyPart(input.productId, "product id");
  normalizeCacheKeyPart(input.productSlug, "product slug");
  normalizeCacheKeyPart(input.productName, "product name");
  normalizeCacheKeyPart(
    input.productReferenceVersion,
    "product reference version",
  );
  if (!isDrapeRoomBackground(input.background)) {
    throw new Error("The render background is invalid.");
  }
  normalizeProvider(input.provider);
  normalizeCacheKeyPart(input.model, "model");
  normalizeCacheKeyPart(input.promptVersion, "prompt version");
  normalizeCacheKeyPart(input.engineVersion, "engine version");
  normalizeCacheKeyPart(input.outputVersion, "output version");
}

export function assertRenderCacheKey(
  value: unknown,
): asserts value is string {
  if (!isRenderCacheKey(value)) {
    throw new Error("The render cache key is invalid.");
  }
}

function assertDimensions(width: number, height: number): void {
  if (!hasValidDimensions(width, height)) {
    throw new Error("The stored image dimensions are invalid.");
  }
}

export function isStoredUserPhoto(value: unknown): value is StoredUserPhoto {
  if (!value || typeof value !== "object") return false;
  const record = value as StoredUserPhoto;
  return (
    record.key === USER_PHOTO_KEY &&
    record.blob instanceof Blob &&
    record.blob.type === "image/jpeg" &&
    record.byteSize === record.blob.size &&
    SHA256_PATTERN.test(record.digest) &&
    isSafeTimestamp(record.createdAt) &&
    isSafeTimestamp(record.updatedAt) &&
    hasValidDimensions(record.width, record.height) &&
    (record.readiness === undefined || isStoredPhotoReadiness(record.readiness))
  );
}

function isStoredPhotoReadiness(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const readiness = value as StoredUserPhoto["readiness"];
  return Boolean(
    readiness &&
      (readiness.state === "ready" || readiness.state === "blocked") &&
      typeof readiness.policyVersion === "string" &&
      readiness.policyVersion.length > 0 &&
      isSafeTimestamp(readiness.checkedAt) &&
      (readiness.state !== "blocked" || typeof readiness.reason === "string"),
  );
}

export function isStoredRender(value: unknown): value is StoredDrapeRender {
  if (!value || typeof value !== "object") return false;
  const record = value as StoredDrapeRender;
  return (
    RENDER_CACHE_KEY_PATTERN.test(record.cacheKey) &&
    record.blob instanceof Blob &&
    MIME_TYPES.has(record.blob.type) &&
    record.mimeType === record.blob.type &&
    record.byteSize === record.blob.size &&
    record.byteSize > 0 &&
    record.byteSize <= MAX_CACHED_RENDER_BYTES &&
    SHA256_PATTERN.test(record.userPhotoDigest) &&
    typeof record.productId === "string" &&
    record.productId.length > 0 &&
    typeof record.productSlug === "string" &&
    record.productSlug.length > 0 &&
    typeof record.productName === "string" &&
    record.productName.length > 0 &&
    typeof record.productReferenceVersion === "string" &&
    record.productReferenceVersion.length > 0 &&
    record.drape === DRAPE_ROOM_STYLE &&
    isDrapeRoomBackground(record.background) &&
    (record.provider === "google" || record.provider === "openai") &&
    typeof record.model === "string" &&
    record.model.length > 0 &&
    typeof record.promptVersion === "string" &&
    record.promptVersion.length > 0 &&
    typeof record.engineVersion === "string" &&
    record.engineVersion.length > 0 &&
    typeof record.outputVersion === "string" &&
    record.outputVersion.length > 0 &&
    isSafeTimestamp(record.createdAt) &&
    isSafeTimestamp(record.lastViewedAt) &&
    hasValidDimensions(record.width, record.height)
  );
}

export function sortRendersMostRecent(
  records: readonly StoredDrapeRender[],
): StoredDrapeRender[] {
  return [...records].sort(
    (left, right) =>
      right.lastViewedAt - left.lastViewedAt ||
      right.createdAt - left.createdAt ||
      left.cacheKey.localeCompare(right.cacheKey),
  );
}

function hasValidDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export async function pruneIndexedDbRenders(
  store: RenderStoreForPruning,
): Promise<string[]> {
  const [records, keys] = await Promise.all([
    store.getAll(),
    store.getAllKeys(),
  ]);
  const evicted: string[] = [];
  const valid: StoredDrapeRender[] = [];
  for (const [index, record] of records.entries()) {
    if (isStoredRender(record)) valid.push(record);
    else {
      const key = keys[index];
      if (key !== undefined) {
        await store.delete(key);
        evicted.push(key);
      }
    }
  }
  valid.sort(compareRenderAge);
  let bytes = valid.reduce((total, record) => total + record.byteSize, 0);
  while (
    valid.length > MAX_CACHED_RENDERS ||
    bytes > MAX_CACHED_RENDER_BYTES
  ) {
    const oldest = valid.shift();
    if (!oldest) break;
    await store.delete(oldest.cacheKey);
    bytes -= oldest.byteSize;
    evicted.push(oldest.cacheKey);
  }
  return evicted;
}

export function pruneMemoryRenders(
  renders: Map<string, StoredDrapeRender>,
): string[] {
  const ordered = [...renders.values()].sort(compareRenderAge);
  let bytes = ordered.reduce((total, record) => total + record.byteSize, 0);
  const evicted: string[] = [];
  while (
    ordered.length > MAX_CACHED_RENDERS ||
    bytes > MAX_CACHED_RENDER_BYTES
  ) {
    const oldest = ordered.shift();
    if (!oldest) break;
    renders.delete(oldest.cacheKey);
    bytes -= oldest.byteSize;
    evicted.push(oldest.cacheKey);
  }
  return evicted;
}

function compareRenderAge(
  left: StoredDrapeRender,
  right: StoredDrapeRender,
): number {
  return (
    left.lastViewedAt - right.lastViewedAt ||
    left.createdAt - right.createdAt ||
    left.cacheKey.localeCompare(right.cacheKey)
  );
}

export function renderStats(
  renders: readonly StoredDrapeRender[],
): DrapeRoomRenderStats {
  return {
    count: renders.length,
    bytes: renders.reduce((total, record) => total + record.byteSize, 0),
    maximumCount: MAX_CACHED_RENDERS,
    maximumBytes: MAX_CACHED_RENDER_BYTES,
  };
}

export function cloneUserPhoto(record: StoredUserPhoto): StoredUserPhoto {
  return {
    ...record,
    ...(record.readiness ? { readiness: { ...record.readiness } } : {}),
  };
}

export function cloneRender(record: StoredDrapeRender): StoredDrapeRender {
  return { ...record };
}

export function normalizeSha256(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, "");
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error("The image SHA-256 digest is invalid.");
  }
  return normalized;
}

function normalizeCacheKeyPart(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`The ${label} is invalid.`);
  }
  const normalized = value.normalize("NFC").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(`The ${label} is invalid.`);
  }
  return normalized;
}

function normalizeProvider(value: DrapeRoomProviderId): DrapeRoomProviderId {
  if (value !== "google" && value !== "openai") {
    throw new Error("Provider is invalid.");
  }
  return value;
}

export function normalizeMetadataKey(value: string): string {
  if (typeof value !== "string") throw new Error("Metadata key is invalid.");
  const normalized = value.normalize("NFC").trim();
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(normalized)) {
    throw new Error("Metadata key is invalid.");
  }
  return normalized;
}

export function cloneMetadataValue(
  value: DrapeRoomMetadataValue,
): DrapeRoomMetadataValue {
  const serialized = JSON.stringify(value);
  if (
    serialized === undefined ||
    new TextEncoder().encode(serialized).byteLength > MAX_METADATA_BYTES
  ) {
    throw new Error("Metadata value is invalid or too large.");
  }
  const parsed: unknown = JSON.parse(serialized);
  if (!isMetadataValue(parsed)) throw new Error("Metadata value is invalid.");
  return parsed;
}

function isMetadataValue(
  value: unknown,
  depth = 0,
): value is DrapeRoomMetadataValue {
  if (depth > 8) return false;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((item) => isMetadataValue(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((item) =>
    isMetadataValue(item, depth + 1),
  );
}
