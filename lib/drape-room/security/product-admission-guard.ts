import type { TryonRedisClient } from "@/lib/drape-room/security/redis-guard";

const IP_TAG_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 10 * 60 * 1_000;
const BLOCK_MS = 10 * 60 * 1_000;

const CHECK_SCRIPT = `
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl > 0 then return ttl end
  return 0
`;

const RECORD_INVALID_PRODUCT_SCRIPT = `
  local failures = redis.call('INCR', KEYS[2])
  local ttl = redis.call('PTTL', KEYS[2])
  if failures == 1 or ttl < 0 then
    redis.call('PEXPIRE', KEYS[2], ARGV[1])
  end
  if failures >= tonumber(ARGV[2]) then
    redis.call('SET', KEYS[1], '1', 'PX', ARGV[3])
    redis.call('DEL', KEYS[2])
    return tonumber(ARGV[3])
  end
  return 0
`;

export type ProductAdmissionGuard =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

function keys(ipTag: string): [string, string] {
  if (!IP_TAG_PATTERN.test(ipTag)) {
    throw new Error("TRYON_INVALID_PRODUCT_ADMISSION_GUARD_INPUT");
  }
  const namespace = `ftt:tryon:v1:invalid-product:${ipTag}`;
  return [`${namespace}:blocked`, `${namespace}:failures`];
}

function toRetryAfter(value: unknown): number {
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) return 0;
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}

export async function checkProductAdmissionGuard(
  redis: TryonRedisClient,
  ipTag: string,
): Promise<ProductAdmissionGuard> {
  const [blockKey] = keys(ipTag);
  const retryAfterSeconds = toRetryAfter(
    await redis.eval(CHECK_SCRIPT, [blockKey], []),
  );
  return retryAfterSeconds > 0
    ? { allowed: false, retryAfterSeconds }
    : { allowed: true, retryAfterSeconds: 0 };
}

export async function recordInvalidProductAdmission(
  redis: TryonRedisClient,
  ipTag: string,
): Promise<number> {
  const [blockKey, failuresKey] = keys(ipTag);
  return toRetryAfter(
    await redis.eval(
      RECORD_INVALID_PRODUCT_SCRIPT,
      [blockKey, failuresKey],
      [FAILURE_WINDOW_MS, FAILURE_THRESHOLD, BLOCK_MS],
    ),
  );
}

export const TRYON_PRODUCT_ADMISSION_GUARD_SCRIPTS_FOR_TESTS = Object.freeze({
  check: CHECK_SCRIPT,
  recordInvalidProduct: RECORD_INVALID_PRODUCT_SCRIPT,
});

export const TRYON_PRODUCT_ADMISSION_GUARD_POLICY = Object.freeze({
  blockMs: BLOCK_MS,
  failureThreshold: FAILURE_THRESHOLD,
  failureWindowMs: FAILURE_WINDOW_MS,
});
