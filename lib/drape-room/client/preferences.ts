"use client";

import type { DrapeRoomProviderId } from "./types";
import { notifyDrapeRoomStorageChange } from "./storage-events";

export const ONBOARDING_STORAGE_KEY = "ftt.drape.onboarding.seen:v1";
export const CONSENT_STORAGE_KEY = "ftt.drape.consent:v1";
const MAX_PREFERENCE_BYTES = 2 * 1024;

export interface DrapeRoomConsentDecision {
  accepted: boolean;
  provider: DrapeRoomProviderId;
  disclosureVersion: string;
  privacyPolicyVersion: string;
  decidedAt: number;
}

export type DrapeRoomConsentIdentity = Pick<
  DrapeRoomConsentDecision,
  "provider" | "disclosureVersion" | "privacyPolicyVersion"
>;

export interface DrapeRoomOnboardingState {
  completed: true;
  completedAt: number;
}

let memoryConsent: DrapeRoomConsentDecision | null = null;
let memoryOnboarding: DrapeRoomOnboardingState | null = null;
let consentMemoryOverride = false;
let onboardingMemoryOverride = false;

export function getDrapeRoomConsent(): DrapeRoomConsentDecision | null {
  if (consentMemoryOverride) return memoryConsent;
  const result = readPreference(CONSENT_STORAGE_KEY, isConsentDecision);
  if (!result.available) return memoryConsent;
  memoryConsent = result.value;
  return result.value;
}

export function setDrapeRoomConsent(
  accepted: boolean,
  identity: DrapeRoomConsentIdentity,
  decidedAt = Date.now(),
): DrapeRoomConsentDecision {
  const decision: DrapeRoomConsentDecision = {
    accepted,
    provider: normalizeProvider(identity.provider),
    disclosureVersion: normalizeVersion(identity.disclosureVersion),
    privacyPolicyVersion: normalizeVersion(identity.privacyPolicyVersion),
    decidedAt: normalizeTimestamp(decidedAt),
  };
  memoryConsent = decision;
  consentMemoryOverride = !writePreference(CONSENT_STORAGE_KEY, decision);
  notifyDrapeRoomStorageChange("preferences-updated", "consent");
  return decision;
}

export function hasCurrentDrapeRoomConsent(
  identity: DrapeRoomConsentIdentity,
): boolean {
  const decision = getDrapeRoomConsent();
  return (
    decision?.accepted === true &&
    decision.provider === normalizeProvider(identity.provider) &&
    decision.disclosureVersion === normalizeVersion(identity.disclosureVersion) &&
    decision.privacyPolicyVersion ===
      normalizeVersion(identity.privacyPolicyVersion)
  );
}

export function clearDrapeRoomConsent(): void {
  memoryConsent = null;
  consentMemoryOverride = !removePreference(CONSENT_STORAGE_KEY);
  notifyDrapeRoomStorageChange("preferences-updated", "consent");
}

export function getDrapeRoomOnboarding(): DrapeRoomOnboardingState | null {
  if (onboardingMemoryOverride) return memoryOnboarding;
  const result = readPreference(ONBOARDING_STORAGE_KEY, isOnboardingState);
  if (!result.available) return memoryOnboarding;
  memoryOnboarding = result.value;
  return result.value;
}

export function completeDrapeRoomOnboarding(
  completedAt = Date.now(),
): DrapeRoomOnboardingState {
  const state: DrapeRoomOnboardingState = {
    completed: true,
    completedAt: normalizeTimestamp(completedAt),
  };
  memoryOnboarding = state;
  onboardingMemoryOverride = !writePreference(ONBOARDING_STORAGE_KEY, state);
  notifyDrapeRoomStorageChange("preferences-updated", "onboarding");
  return state;
}

export function clearDrapeRoomOnboarding(): void {
  memoryOnboarding = null;
  onboardingMemoryOverride = !removePreference(ONBOARDING_STORAGE_KEY);
  notifyDrapeRoomStorageChange("preferences-updated", "onboarding");
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPreference<T>(
  key: string,
  guard: (value: unknown) => value is T,
): { available: boolean; value: T | null } {
  const storage = getLocalStorage();
  if (!storage) return { available: false, value: null };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { available: true, value: null };
    if (new TextEncoder().encode(raw).byteLength > MAX_PREFERENCE_BYTES) {
      storage.removeItem(key);
      return { available: true, value: null };
    }
    const value: unknown = JSON.parse(raw);
    if (guard(value)) return { available: true, value };
    storage.removeItem(key);
    return { available: true, value: null };
  } catch {
    return { available: false, value: null };
  }
}

function writePreference(key: string, value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > MAX_PREFERENCE_BYTES) {
      return false;
    }
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

function removePreference(key: string): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function normalizeVersion(value: string): string {
  if (typeof value !== "string") throw new Error("Policy version is invalid.");
  const normalized = value.normalize("NFC").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error("Policy version is invalid.");
  }
  return normalized;
}

function normalizeProvider(value: DrapeRoomProviderId): DrapeRoomProviderId {
  if (value !== "google" && value !== "openai") {
    throw new Error("Provider is invalid.");
  }
  return value;
}

function normalizeTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Preference timestamp is invalid.");
  }
  return value;
}

function isConsentDecision(value: unknown): value is DrapeRoomConsentDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<DrapeRoomConsentDecision>;
  return (
    hasOnlyKeys(value, [
      "accepted",
      "provider",
      "disclosureVersion",
      "privacyPolicyVersion",
      "decidedAt",
    ]) &&
    typeof decision.accepted === "boolean" &&
    (decision.provider === "google" || decision.provider === "openai") &&
    typeof decision.disclosureVersion === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(decision.disclosureVersion) &&
    typeof decision.privacyPolicyVersion === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(
      decision.privacyPolicyVersion,
    ) &&
    typeof decision.decidedAt === "number" &&
    Number.isSafeInteger(decision.decidedAt) &&
    decision.decidedAt >= 0
  );
}

function isOnboardingState(value: unknown): value is DrapeRoomOnboardingState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DrapeRoomOnboardingState>;
  return (
    hasOnlyKeys(value, ["completed", "completedAt"]) &&
    state.completed === true &&
    typeof state.completedAt === "number" &&
    Number.isSafeInteger(state.completedAt) &&
    state.completedAt >= 0
  );
}

function hasOnlyKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}
