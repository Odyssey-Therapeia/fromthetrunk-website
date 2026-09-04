"use client";

import type { DrapeRoomDailyQuota } from "./types";

const STORAGE_PREFIX = "ftt.tryon.daily-quota:v1";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1_000;

export function currentProductDailyQuotaResetAt(now = Date.now()): number {
  const shifted = new Date(now + IST_OFFSET_MS);
  return (
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1,
    ) - IST_OFFSET_MS
  );
}

function quotaKey(productId: string, resetAt: number): string {
  return `${STORAGE_PREFIX}:${productId}:${resetAt}`;
}

function isQuota(value: unknown, now: number): value is DrapeRoomDailyQuota {
  if (!value || typeof value !== "object") return false;
  const quota = value as DrapeRoomDailyQuota;
  return (
    quota.limit === 3 &&
    Number.isInteger(quota.used) &&
    quota.used >= 0 &&
    quota.used <= 3 &&
    Number.isInteger(quota.remaining) &&
    quota.remaining >= 0 &&
    quota.remaining <= 3 &&
    quota.used + quota.remaining === 3 &&
    Number.isSafeInteger(quota.resetAt) &&
    quota.resetAt > now
  );
}

export function readProductDailyQuotaHint(
  productId: string,
  now = Date.now(),
): DrapeRoomDailyQuota | null {
  if (typeof window === "undefined") return null;
  const resetAt = currentProductDailyQuotaResetAt(now);
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(quotaKey(productId, resetAt)) ?? "null",
    );
    return isQuota(parsed, now) && parsed.resetAt === resetAt ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeProductDailyQuotaHint(
  current: DrapeRoomDailyQuota | null,
  incoming: DrapeRoomDailyQuota,
  now = Date.now(),
): DrapeRoomDailyQuota {
  if (!isQuota(incoming, now)) return current ?? incoming;
  if (!current || current.resetAt !== incoming.resetAt || current.resetAt <= now) {
    return incoming;
  }
  return incoming.used >= current.used ? incoming : current;
}

export function storeProductDailyQuotaHint(
  productId: string,
  quota: DrapeRoomDailyQuota,
  now = Date.now(),
): void {
  if (typeof window === "undefined" || !isQuota(quota, now)) return;
  const current = readProductDailyQuotaHint(productId, now);
  const merged = mergeProductDailyQuotaHint(current, quota, now);
  try {
    window.localStorage.setItem(
      quotaKey(productId, merged.resetAt),
      JSON.stringify(merged),
    );
  } catch {
    // The hint is optional. The server remains authoritative.
  }
}
