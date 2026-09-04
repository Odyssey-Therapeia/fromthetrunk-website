import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentProductDailyQuotaResetAt,
  mergeProductDailyQuotaHint,
  readProductDailyQuotaHint,
  storeProductDailyQuotaHint,
} from "@/lib/drape-room/client/daily-quota";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Drape Room client quota hint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the next Asia/Kolkata midnight instead of a rolling day", () => {
    const beforeMidnight = Date.parse("2026-08-27T18:20:00.000Z");
    expect(currentProductDailyQuotaResetAt(beforeMidnight)).toBe(
      Date.parse("2026-08-27T18:30:00.000Z"),
    );
  });

  it("stores only the current product/reset window and merges monotonically", () => {
    const now = Date.parse("2026-08-27T10:00:00.000Z");
    const resetAt = currentProductDailyQuotaResetAt(now);
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    storeProductDailyQuotaHint(
      "product-a",
      { limit: 3, used: 2, remaining: 1, resetAt },
      now,
    );
    storeProductDailyQuotaHint(
      "product-a",
      { limit: 3, used: 1, remaining: 2, resetAt },
      now,
    );
    expect(readProductDailyQuotaHint("product-a", now)).toEqual({
      limit: 3,
      used: 2,
      remaining: 1,
      resetAt,
    });
    expect(readProductDailyQuotaHint("product-b", now)).toBeNull();
  });

  it("discards an expired hint and accepts the next authoritative window", () => {
    const now = Date.parse("2026-08-27T10:00:00.000Z");
    const resetAt = currentProductDailyQuotaResetAt(now);
    const current = { limit: 3 as const, used: 3 as const, remaining: 0 as const, resetAt };
    const tomorrow = resetAt + 1;
    const nextReset = currentProductDailyQuotaResetAt(tomorrow);
    expect(
      mergeProductDailyQuotaHint(
        current,
        { limit: 3, used: 1, remaining: 2, resetAt: nextReset },
        tomorrow,
      ),
    ).toEqual({ limit: 3, used: 1, remaining: 2, resetAt: nextReset });
  });
});
