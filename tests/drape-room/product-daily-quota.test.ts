import { describe, expect, it } from "vitest";

import {
  claimProductDailyQuota,
  productDailyQuotaWindow,
  TRYON_PRODUCT_DAILY_QUOTA_POLICY,
  TRYON_PRODUCT_DAILY_QUOTA_SCRIPTS_FOR_TESTS,
} from "@/lib/drape-room/security/product-daily-quota";
import type { TryonRedisClient } from "@/lib/drape-room/security/redis-guard";

const NOW = Date.parse("2026-08-27T10:00:00.000Z");
const IP_TAG = "a".repeat(43);
const OTHER_IP_TAG = "b".repeat(43);
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const requestId = (digit: number) =>
  `${digit}`.repeat(8) +
  `-${digit}${digit}${digit}${digit}` +
  `-4${digit}${digit}${digit}` +
  `-8${digit}${digit}${digit}` +
  `-${String(digit).repeat(12)}`;

class QuotaRedis implements TryonRedisClient {
  readonly counts = new Map<string, number>();
  readonly calls: Array<{ keys: string[]; args: Array<number | string> }> = [];
  private readonly entries = new Map<string, Map<string, number>>();

  private entryMap(key: string): Map<string, number> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const created = new Map<string, number>();
    this.entries.set(key, created);
    return created;
  }

  private updateCount(key: string, entries: Map<string, number>): number {
    if (entries.size === 0) this.counts.delete(key);
    else this.counts.set(key, entries.size);
    return entries.size;
  }

  async eval(
    script: string,
    keys: string[],
    args: Array<number | string>,
  ): Promise<unknown> {
    this.calls.push({ keys, args });
    const [quotaKey] = keys;
    const entries = this.entryMap(quotaKey);
    if (script === TRYON_PRODUCT_DAILY_QUOTA_SCRIPTS_FOR_TESTS.claim) {
      const now = Number(args[2]);
      for (const [member, score] of entries) {
        if (score <= now) entries.delete(member);
      }
      const provisionalMember = String(args[4]);
      const committedMember = String(args[5]);
      const used = this.updateCount(quotaKey, entries);
      if (entries.has(provisionalMember) || entries.has(committedMember)) {
        return [1, used];
      }
      if (used >= Number(args[0])) return [0, used];
      entries.set(provisionalMember, Number(args[3]));
      return [1, this.updateCount(quotaKey, entries)];
    }
    if (script === TRYON_PRODUCT_DAILY_QUOTA_SCRIPTS_FOR_TESTS.release) {
      entries.delete(String(args[0]));
      return this.updateCount(quotaKey, entries);
    }
    if (script === TRYON_PRODUCT_DAILY_QUOTA_SCRIPTS_FOR_TESTS.commit) {
      const provisionalMember = String(args[0]);
      const committedMember = String(args[1]);
      if (entries.has(committedMember)) return 1;
      if (!entries.delete(provisionalMember)) return 0;
      entries.set(committedMember, Number(args[2]));
      this.updateCount(quotaKey, entries);
      return 1;
    }
    throw new Error("unexpected Redis script");
  }
}

describe("Drape Room product daily quota", () => {
  it("uses a fixed Asia/Kolkata calendar day and exact next-midnight reset", () => {
    expect(
      productDailyQuotaWindow(
        Date.parse("2026-08-27T18:29:59.999Z"),
      ),
    ).toEqual({
      dayKey: "2026-08-27",
      resetAt: Date.parse("2026-08-27T18:30:00.000Z"),
    });
    expect(
      productDailyQuotaWindow(
        Date.parse("2026-08-27T18:30:00.000Z"),
      ),
    ).toEqual({
      dayKey: "2026-08-28",
      resetAt: Date.parse("2026-08-28T18:30:00.000Z"),
    });
  });

  it("allows exactly three atomic claims and rejects the fourth", async () => {
    const redis = new QuotaRedis();
    const claims = await Promise.all(
      [1, 2, 3, 4].map((digit) =>
        claimProductDailyQuota(
          redis,
          IP_TAG,
          PRODUCT_ID,
          requestId(digit),
          NOW,
        ),
      ),
    );

    expect(claims.slice(0, 3).map((claim) => claim.quota)).toEqual([
      expect.objectContaining({ used: 1, remaining: 2 }),
      expect.objectContaining({ used: 2, remaining: 1 }),
      expect.objectContaining({ used: 3, remaining: 0 }),
    ]);
    expect(claims[3]).toMatchObject({
      allowed: false,
      quota: { limit: 3, used: 3, remaining: 0 },
      retryAfterSeconds: Math.ceil(
        (Date.parse("2026-08-27T18:30:00.000Z") - NOW) / 1_000,
      ),
    });
  });

  it("keeps products and HMAC IP tags independent", async () => {
    const redis = new QuotaRedis();
    const first = await claimProductDailyQuota(
      redis,
      IP_TAG,
      PRODUCT_ID,
      requestId(1),
      NOW,
    );
    const otherProduct = await claimProductDailyQuota(
      redis,
      IP_TAG,
      OTHER_PRODUCT_ID,
      requestId(2),
      NOW,
    );
    const otherIp = await claimProductDailyQuota(
      redis,
      OTHER_IP_TAG,
      PRODUCT_ID,
      requestId(3),
      NOW,
    );

    expect(first.quota.used).toBe(1);
    expect(otherProduct.quota.used).toBe(1);
    expect(otherIp.quota.used).toBe(1);
    expect(redis.counts.size).toBe(3);
  });

  it("does not double-count the same ledger request claim", async () => {
    const redis = new QuotaRedis();
    const first = await claimProductDailyQuota(
      redis,
      IP_TAG,
      PRODUCT_ID,
      requestId(1),
      NOW,
    );
    const duplicate = await claimProductDailyQuota(
      redis,
      IP_TAG,
      PRODUCT_ID,
      requestId(1),
      NOW,
    );

    expect(first.quota.used).toBe(1);
    expect(duplicate.quota.used).toBe(1);
    expect([...redis.counts.values()]).toEqual([1]);
  });

  it("releases only before provider start and makes both transitions idempotent", async () => {
    const releasableRedis = new QuotaRedis();
    const releasable = await claimProductDailyQuota(
      releasableRedis,
      IP_TAG,
      PRODUCT_ID,
      requestId(1),
      NOW,
    );
    if (!releasable.allowed) throw new Error("expected allowed claim");
    await releasable.releaseBeforeProvider();
    await releasable.releaseBeforeProvider();
    expect([...releasableRedis.counts.values()]).toEqual([]);

    const committedRedis = new QuotaRedis();
    const committed = await claimProductDailyQuota(
      committedRedis,
      IP_TAG,
      PRODUCT_ID,
      requestId(2),
      NOW,
    );
    if (!committed.allowed) throw new Error("expected allowed claim");
    await committed.commitProviderDispatchAttempted();
    await committed.commitProviderDispatchAttempted();
    await committed.releaseBeforeProvider();
    expect([...committedRedis.counts.values()]).toEqual([1]);
  });

  it("uses only opaque identifiers and an absolute reset timestamp in Redis", async () => {
    const redis = new QuotaRedis();
    await claimProductDailyQuota(
      redis,
      IP_TAG,
      PRODUCT_ID,
      requestId(1),
      NOW,
    );
    const call = redis.calls[0];
    const serialized = JSON.stringify(call);

    expect(call.keys[0]).toBe(
      `ftt:tryon:v3:product-day:2026-08-27:${IP_TAG}:${PRODUCT_ID}`,
    );
    expect(call.args[1]).toBe(Date.parse("2026-08-27T18:30:00.000Z"));
    expect(call.args[3]).toBe(
      NOW + TRYON_PRODUCT_DAILY_QUOTA_POLICY.provisionalClaimMs,
    );
    expect(serialized).not.toContain("203.0.113.10");
  });

  it("automatically evicts an abandoned provisional claim before the next attempt", async () => {
    const redis = new QuotaRedis();
    for (const digit of [1, 2, 3]) {
      await claimProductDailyQuota(
        redis,
        IP_TAG,
        PRODUCT_ID,
        requestId(digit),
        NOW,
      );
    }
    const afterExpiry = await claimProductDailyQuota(
      redis,
      IP_TAG,
      PRODUCT_ID,
      requestId(4),
      NOW + TRYON_PRODUCT_DAILY_QUOTA_POLICY.provisionalClaimMs + 1,
    );

    expect(afterExpiry).toMatchObject({
      allowed: true,
      quota: { used: 1, remaining: 2 },
    });
  });

  it("rejects a raw IP or malformed opaque identity before Redis", async () => {
    const redis = new QuotaRedis();
    await expect(
      claimProductDailyQuota(
        redis,
        "203.0.113.10",
        PRODUCT_ID,
        requestId(1),
        NOW,
      ),
    ).rejects.toThrow("TRYON_INVALID_PRODUCT_DAILY_QUOTA_INPUT");
    expect(redis.calls).toHaveLength(0);
  });
});
