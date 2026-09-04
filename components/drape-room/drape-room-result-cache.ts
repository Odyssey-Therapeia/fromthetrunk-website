import { DrapeRoomClientError } from "@/lib/drape-room/client/api";
import {
  createRenderCacheKey,
  drapeRoomStorage,
  type StoredDrapeRender,
  type StoredUserPhoto,
} from "@/lib/drape-room/client/storage";
import {
  DRAPE_ROOM_BACKGROUNDS,
  type DrapeRoomBackground,
  type DrapeRoomGenerationIdentity,
  type PublicTryOnConfig,
} from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import type { DrapeRoomResult } from "./types";

export function createDrapeRoomCacheNamespaceIdentity({
  photo,
  product,
  config,
}: {
  photo: StoredUserPhoto;
  product: DrapeSaree;
  config: PublicTryOnConfig | null;
}): string {
  return JSON.stringify([
    "drape-room-cache-namespace-v1",
    photo.digest,
    product.productId,
    product.productReferenceVersion,
    "nivi",
    ...(config
      ? [
          config.provider,
          config.model,
          config.promptVersion,
          config.referenceContractVersion,
          config.engineVersion,
          config.outputVersion,
        ]
      : ["browser-local"]),
  ]);
}

export function isDrapeRoomCacheLookupSettled(
  expectedIdentity: string | null,
  hydratedIdentity: string | null,
): boolean {
  return expectedIdentity !== null && expectedIdentity === hydratedIdentity;
}

export async function loadCachedDrapeRoomResults({
  photo,
  product,
  config,
}: {
  photo: StoredUserPhoto;
  product: DrapeSaree;
  config: PublicTryOnConfig | null;
}): Promise<StoredDrapeRender[]> {
  if (!config) {
    return selectBrowserLocalDrapeRoomResults(
      await drapeRoomStorage.listRendersForPhoto(photo.digest),
      photo,
      product,
    );
  }

  const records = await Promise.all(
    DRAPE_ROOM_BACKGROUNDS.map(async (background) => {
      const cacheKey = await createRenderCacheKey({
        userPhotoDigest: photo.digest,
        productId: product.productId,
        productReferenceVersion: product.productReferenceVersion,
        referenceContractVersion: config.referenceContractVersion,
        background,
        provider: config.provider,
        model: config.model,
        promptVersion: config.promptVersion,
        engineVersion: config.engineVersion,
        outputVersion: config.outputVersion,
      });
      return drapeRoomStorage.getRender(cacheKey);
    }),
  );
  return records.filter((record): record is StoredDrapeRender => record !== null);
}

/** Selects one newest, coherent stored generation namespace for view-only use. */
export function selectBrowserLocalDrapeRoomResults(
  records: readonly StoredDrapeRender[],
  photo: StoredUserPhoto,
  product: DrapeSaree,
): StoredDrapeRender[] {
  const exactRecords = records
    .filter(
      (record) =>
        record.userPhotoDigest === photo.digest &&
        record.productId === product.productId &&
        record.productReferenceVersion === product.productReferenceVersion &&
        record.referenceContractVersion === "gallery-v2" &&
        record.drape === "nivi",
    )
    .sort(
      (left, right) =>
        right.lastViewedAt - left.lastViewedAt ||
        right.createdAt - left.createdAt,
    );
  const newest = exactRecords[0];
  if (!newest) return [];
  const namespace = renderNamespace(newest);
  const backgrounds = new Set<DrapeRoomBackground>();
  return exactRecords.filter((record) => {
    if (
      renderNamespace(record) !== namespace ||
      backgrounds.has(record.background)
    ) {
      return false;
    }
    backgrounds.add(record.background);
    return true;
  });
}

export function toDrapeRoomResult(
  record: StoredDrapeRender,
  previewUrl: string,
): DrapeRoomResult {
  return {
    cacheKey: record.cacheKey,
    blob: record.blob,
    previewUrl,
    userPhotoDigest: record.userPhotoDigest,
    productId: record.productId,
    productReferenceVersion: record.productReferenceVersion,
    referenceContractVersion: record.referenceContractVersion,
    background: record.background,
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    engineVersion: record.engineVersion,
    outputVersion: record.outputVersion,
    createdAt: record.createdAt,
  };
}

export function isCurrentDrapeRoomResult({
  result,
  photo,
  product,
  config,
  background,
}: {
  result: DrapeRoomResult | undefined;
  photo: StoredUserPhoto | null;
  product: DrapeSaree;
  config: PublicTryOnConfig | null;
  background: DrapeRoomBackground;
}): boolean {
  if (
    !result ||
    !photo ||
    result.userPhotoDigest !== photo.digest ||
    result.productId !== product.productId ||
    result.productReferenceVersion !== product.productReferenceVersion ||
    result.background !== background
  ) {
    return false;
  }
  return config
    ? result.provider === config.provider &&
        result.referenceContractVersion === config.referenceContractVersion &&
        result.model === config.model &&
        result.promptVersion === config.promptVersion &&
        result.engineVersion === config.engineVersion &&
        result.outputVersion === config.outputVersion
    : true;
}

function renderNamespace(record: StoredDrapeRender): string {
  return JSON.stringify([
    record.provider,
    record.model,
    record.promptVersion,
    record.referenceContractVersion,
    record.engineVersion,
    record.outputVersion,
  ]);
}

export function assertAuthoritativeDrapeRoomIdentity(
  config: PublicTryOnConfig,
  identity: DrapeRoomGenerationIdentity,
): void {
  if (
    identity.provider !== config.provider ||
    identity.model !== config.model ||
    identity.promptVersion !== config.promptVersion ||
    identity.referenceContractVersion !== config.referenceContractVersion ||
    identity.engineVersion !== config.engineVersion ||
    identity.outputVersion !== config.outputVersion
  ) {
    throw new DrapeRoomClientError(
      "OUTPUT_INVALID",
      "The generated image identity did not match the active Drape Room configuration.",
    );
  }
}

export function isDrapeRoomRequestContextCurrent({
  expectedRequestId,
  expectedPhotoRevision,
  expectedProductId,
  activeRequestId,
  photoRevision,
  selectedProductId,
}: {
  expectedRequestId: string;
  expectedPhotoRevision: number;
  expectedProductId: string;
  activeRequestId: string | null;
  photoRevision: number;
  selectedProductId: string | null;
}): boolean {
  return (
    activeRequestId === expectedRequestId &&
    photoRevision === expectedPhotoRevision &&
    selectedProductId === expectedProductId
  );
}
