"use client";

/** Stable public facade for the single Drape Room browser-storage engine. */
export { DrapeRoomClientStorage, drapeRoomStorage } from "./storage-engine";
export {
  createRenderCacheKey,
  isRenderCacheKey,
  sha256Hex,
} from "./storage-policy";
export {
  DRAPE_ROOM_DB_NAME,
  DRAPE_ROOM_DB_VERSION,
  MAX_CACHED_RENDER_BYTES,
  MAX_CACHED_RENDERS,
  USER_PHOTO_KEY,
} from "./storage-schema";
export type {
  DrapeRoomMetadataValue,
  DrapeRoomRenderStats,
  DrapeRoomStorageMode,
  RenderCacheKeyInput,
  SaveDrapeRenderInput,
  SaveUserPhotoInput,
  StoredPhotoReadiness,
  StoredDrapeRender,
  StoredUserPhoto,
} from "./storage-schema";
export {
  closeDrapeRoomStorageNotifications,
  subscribeToDrapeRoomStorageChanges,
} from "./storage-events";
export type {
  DrapeRoomStorageChange,
  DrapeRoomStorageChangeType,
} from "./storage-events";
export {
  CONSENT_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  clearDrapeRoomConsent,
  clearDrapeRoomOnboarding,
  completeDrapeRoomOnboarding,
  getDrapeRoomConsent,
  getDrapeRoomOnboarding,
  hasCurrentDrapeRoomConsent,
  setDrapeRoomConsent,
} from "./preferences";
export type {
  DrapeRoomConsentDecision,
  DrapeRoomConsentIdentity,
  DrapeRoomOnboardingState,
} from "./preferences";
