"use client";

import type { DBSchema } from "idb";

import {
  DRAPE_ROOM_STYLE,
  type DrapeRoomBackground,
  type DrapeRoomProviderId,
} from "./types";
import type { PhotoReadinessFailureCode } from "./photo-readiness-policy";

export const DRAPE_ROOM_DB_NAME = "ftt_drape_room_v1";
export const DRAPE_ROOM_DB_VERSION = 1;
export const USER_PHOTO_KEY = "user_photo" as const;
export const MAX_CACHED_RENDERS = 8;
export const MAX_CACHED_RENDER_BYTES = 40 * 1024 * 1024;

export type DrapeRoomStorageMode = "indexeddb" | "memory";

export type StoredPhotoReadiness =
  | {
      state: "ready";
      policyVersion: string;
      checkedAt: number;
    }
  | {
      state: "blocked";
      policyVersion: string;
      checkedAt: number;
      reason: PhotoReadinessFailureCode;
    };

export type DrapeRoomMetadataValue =
  | boolean
  | number
  | string
  | null
  | DrapeRoomMetadataValue[]
  | { [key: string]: DrapeRoomMetadataValue };

export interface StoredUserPhoto {
  key: typeof USER_PHOTO_KEY;
  blob: Blob;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteSize: number;
  digest: string;
  createdAt: number;
  updatedAt: number;
  /** Missing only on legacy records written before local photo preflight. */
  readiness?: StoredPhotoReadiness;
}

export interface SaveUserPhotoInput {
  blob: Blob;
  width: number;
  height: number;
  digest: string;
  readiness: Extract<StoredPhotoReadiness, { state: "ready" }>;
}

export interface StoredDrapeRender {
  cacheKey: string;
  blob: Blob;
  mimeType: "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byteSize: number;
  userPhotoDigest: string;
  productId: string;
  productSlug: string;
  productName: string;
  productReferenceVersion: string;
  referenceContractVersion: "gallery-v2";
  drape: typeof DRAPE_ROOM_STYLE;
  background: DrapeRoomBackground;
  provider: DrapeRoomProviderId;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  createdAt: number;
  lastViewedAt: number;
}

export interface SaveDrapeRenderInput {
  cacheKey: string;
  blob: Blob;
  width: number;
  height: number;
  userPhotoDigest: string;
  productId: string;
  productSlug: string;
  productName: string;
  productReferenceVersion: string;
  referenceContractVersion: "gallery-v2";
  background: DrapeRoomBackground;
  provider: DrapeRoomProviderId;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
}

export interface StoredMetadata {
  key: string;
  value: DrapeRoomMetadataValue;
  updatedAt: number;
}

export interface DrapeRoomDatabase extends DBSchema {
  photos: {
    key: typeof USER_PHOTO_KEY;
    value: StoredUserPhoto;
  };
  renders: {
    key: string;
    value: StoredDrapeRender;
    indexes: {
      userPhotoDigest: string;
      productId: string;
      lastViewedAt: number;
      createdAt: number;
    };
  };
  metadata: {
    key: string;
    value: StoredMetadata;
  };
}

export interface RenderStoreForPruning {
  getAll: () => Promise<StoredDrapeRender[]>;
  getAllKeys: () => Promise<string[]>;
  delete: (key: string) => Promise<unknown>;
}

export interface DrapeRoomRenderStats {
  count: number;
  bytes: number;
  maximumCount: typeof MAX_CACHED_RENDERS;
  maximumBytes: typeof MAX_CACHED_RENDER_BYTES;
}

export interface RenderCacheKeyInput {
  userPhotoDigest: string;
  productId: string;
  productReferenceVersion: string;
  referenceContractVersion: "gallery-v2";
  background: DrapeRoomBackground;
  provider: string;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
}
