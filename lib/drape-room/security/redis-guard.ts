import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

const SESSION_LOCK_SCRIPT = `
  if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
    return 1
  end
  return 0
`;

const SEMAPHORE_ACQUIRE_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
  if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
    return 0
  end
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return 1
`;

const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

const RELEASE_SEMAPHORE_SCRIPT = `
  return redis.call('ZREM', KEYS[1], ARGV[1])
`;

export interface TryonRedisClient {
  eval(
    script: string,
    keys: string[],
    args: Array<number | string>,
  ): Promise<unknown>;
}

export type TryonGenerationLease = {
  release(): Promise<void>;
};

export type TryonLeaseAdmission =
  | { acquired: true; lease: TryonGenerationLease }
  | { acquired: false; reason: "session" | "global" };

export function readTryonRedisCredentials():
  | { url: string; token: string }
  | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function isTryonDurableRedisConfigured(): boolean {
  return readTryonRedisCredentials() !== null;
}

export function createTryonRedisClient(): TryonRedisClient | null {
  const credentials = readTryonRedisCredentials();
  return credentials ? new Redis(credentials) : null;
}

/**
 * Atomically owns one session slot and one of three global provider slots.
 * No customer data is stored; Redis sees only HMAC tags and random lease IDs.
 */
export async function acquireTryonGenerationLeaseDetailed(
  redis: TryonRedisClient,
  sessionTag: string,
  leaseMs: number,
  now = Date.now(),
): Promise<TryonLeaseAdmission> {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(sessionTag) ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1_000 ||
    leaseMs > 240_000 ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    throw new Error("TRYON_INVALID_REDIS_LEASE_INPUT");
  }
  const leaseId = randomUUID();
  const sessionKey = `ftt:tryon:v1:active:session:${sessionTag}`;
  const globalKey = "ftt:tryon:v1:active:global";
  const sessionAcquired = Number(
    await redis.eval(
      SESSION_LOCK_SCRIPT,
      [sessionKey],
      [leaseId, leaseMs],
    ),
  );
  if (sessionAcquired !== 1) return { acquired: false, reason: "session" };

  const expiresAt = now + leaseMs;
  try {
    const globalAcquired = Number(
      await redis.eval(
        SEMAPHORE_ACQUIRE_SCRIPT,
        [globalKey],
        [now, expiresAt, 3, leaseId, leaseMs],
      ),
    );
    if (globalAcquired !== 1) {
      await redis.eval(RELEASE_LOCK_SCRIPT, [sessionKey], [leaseId]);
      return { acquired: false, reason: "global" };
    }
  } catch (error) {
    await redis
      .eval(RELEASE_LOCK_SCRIPT, [sessionKey], [leaseId])
      .catch(() => undefined);
    throw error;
  }

  let released = false;
  return {
    acquired: true,
    lease: {
      async release() {
        if (released) return;
        released = true;
        await Promise.allSettled([
          redis.eval(RELEASE_LOCK_SCRIPT, [sessionKey], [leaseId]),
          redis.eval(RELEASE_SEMAPHORE_SCRIPT, [globalKey], [leaseId]),
        ]);
      },
    },
  };
}

export async function acquireTryonGenerationLease(
  redis: TryonRedisClient,
  sessionTag: string,
  leaseMs: number,
  now = Date.now(),
): Promise<TryonGenerationLease | null> {
  const admission = await acquireTryonGenerationLeaseDetailed(
    redis,
    sessionTag,
    leaseMs,
    now,
  );
  return admission.acquired ? admission.lease : null;
}

export const TRYON_REDIS_SCRIPTS_FOR_TESTS = Object.freeze({
  releaseLock: RELEASE_LOCK_SCRIPT,
  releaseSemaphore: RELEASE_SEMAPHORE_SCRIPT,
  semaphoreAcquire: SEMAPHORE_ACQUIRE_SCRIPT,
  sessionLock: SESSION_LOCK_SCRIPT,
});
