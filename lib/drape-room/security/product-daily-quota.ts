import type { TryonRedisClient } from "@/lib/drape-room/security/redis-guard";

export const TRYON_PRODUCT_DAILY_LIMIT = 3 as const;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1_000;
const PROVISIONAL_CLAIM_MS = 5 * 60 * 1_000;
const IP_TAG_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLAIM_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
  local provisional = redis.call('ZSCORE', KEYS[1], ARGV[5])
  local committed = redis.call('ZSCORE', KEYS[1], ARGV[6])
  local used = redis.call('ZCARD', KEYS[1])
  if provisional or committed then return {1, used} end
  if used >= tonumber(ARGV[1]) then return {0, used} end

  redis.call('ZADD', KEYS[1], ARGV[4], ARGV[5])
  redis.call('PEXPIREAT', KEYS[1], ARGV[2])
  used = redis.call('ZCARD', KEYS[1])
  return {1, used}
`;

const RELEASE_SCRIPT = `
  redis.call('ZREM', KEYS[1], ARGV[1])
  return redis.call('ZCARD', KEYS[1])
`;

const COMMIT_SCRIPT = `
  if redis.call('ZSCORE', KEYS[1], ARGV[2]) then return 1 end
  if redis.call('ZREM', KEYS[1], ARGV[1]) ~= 1 then return 0 end
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
  redis.call('PEXPIREAT', KEYS[1], ARGV[3])
  return 1
`;

type QuotaCount = 0 | 1 | 2 | 3;

export type ProductDailyQuota = {
  limit: 3;
  used: QuotaCount;
  remaining: QuotaCount;
  resetAt: number;
  dayKey: string;
};

export type ProductDailyQuotaClaim =
  | {
      allowed: true;
      quota: ProductDailyQuota;
      releaseBeforeProvider(): Promise<void>;
      commitProviderDispatchAttempted(): Promise<void>;
    }
  | {
      allowed: false;
      quota: ProductDailyQuota;
      retryAfterSeconds: number;
    };

export type ProductDailyQuotaWindow = {
  dayKey: string;
  resetAt: number;
};

/** Returns the fixed Asia/Kolkata calendar day and its next midnight. */
export function productDailyQuotaWindow(
  now = Date.now(),
): ProductDailyQuotaWindow {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_TIME");
  }
  const shifted = new Date(now + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const resetAt = Date.UTC(year, month, day + 1) - IST_OFFSET_MS;
  if (!Number.isSafeInteger(resetAt) || resetAt <= now) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_TIME");
  }
  return {
    dayKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    resetAt,
  };
}

function quotaFor(
  usedValue: unknown,
  window: ProductDailyQuotaWindow,
): ProductDailyQuota {
  const numeric = Number(usedValue);
  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0 ||
    numeric > TRYON_PRODUCT_DAILY_LIMIT
  ) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_RESULT");
  }
  const used = numeric as QuotaCount;
  return {
    dayKey: window.dayKey,
    limit: TRYON_PRODUCT_DAILY_LIMIT,
    remaining: (TRYON_PRODUCT_DAILY_LIMIT - used) as QuotaCount,
    resetAt: window.resetAt,
    used,
  };
}

function parseClaimResult(value: unknown): [allowed: boolean, used: unknown] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_RESULT");
  }
  const allowed = Number(value[0]);
  if (allowed !== 0 && allowed !== 1) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_RESULT");
  }
  return [allowed === 1, value[1]];
}

/**
 * Atomically claims one of three provider-started generations for the
 * HMAC(IP) + product + India calendar day. No raw IP or image data is stored.
 */
export async function claimProductDailyQuota(
  redis: TryonRedisClient,
  ipTag: string,
  productId: string,
  ledgerRequestId: string,
  now = Date.now(),
): Promise<ProductDailyQuotaClaim> {
  if (
    !IP_TAG_PATTERN.test(ipTag) ||
    !UUID_PATTERN.test(productId) ||
    !UUID_PATTERN.test(ledgerRequestId)
  ) {
    throw new Error("TRYON_INVALID_PRODUCT_DAILY_QUOTA_INPUT");
  }

  const window = productDailyQuotaWindow(now);
  const quotaKey =
    `ftt:tryon:v3:product-day:${window.dayKey}:${ipTag}:${productId}`;
  const provisionalMember = `p:${ledgerRequestId}`;
  const committedMember = `c:${ledgerRequestId}`;
  const [allowed, usedValue] = parseClaimResult(
    await redis.eval(
      CLAIM_SCRIPT,
      [quotaKey],
      [
        TRYON_PRODUCT_DAILY_LIMIT,
        window.resetAt,
        now,
        Math.min(window.resetAt, now + PROVISIONAL_CLAIM_MS),
        provisionalMember,
        committedMember,
      ],
    ),
  );
  const quota = quotaFor(usedValue, window);
  if (!allowed) {
    return {
      allowed: false,
      quota,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((window.resetAt - now) / 1_000),
      ),
    };
  }

  let committed = false;
  let released = false;
  return {
    allowed: true,
    quota,
    async commitProviderDispatchAttempted() {
      if (committed) return;
      if (released) {
        throw new Error("TRYON_PRODUCT_DAILY_QUOTA_ALREADY_RELEASED");
      }
      const result = Number(
        await redis.eval(
          COMMIT_SCRIPT,
          [quotaKey],
          [provisionalMember, committedMember, window.resetAt],
        ),
      );
      if (result !== 1) {
        throw new Error("TRYON_PRODUCT_DAILY_QUOTA_COMMIT_FAILED");
      }
      committed = true;
    },
    async releaseBeforeProvider() {
      if (committed || released) return;
      await redis.eval(RELEASE_SCRIPT, [quotaKey], [provisionalMember]);
      released = true;
    },
  };
}

export const TRYON_PRODUCT_DAILY_QUOTA_SCRIPTS_FOR_TESTS = Object.freeze({
  claim: CLAIM_SCRIPT,
  commit: COMMIT_SCRIPT,
  release: RELEASE_SCRIPT,
});

export const TRYON_PRODUCT_DAILY_QUOTA_POLICY = Object.freeze({
  provisionalClaimMs: PROVISIONAL_CLAIM_MS,
});
