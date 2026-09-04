import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveTryonIdempotencyHash,
  deriveTryonIpTag,
} from "@/lib/drape-room/security/identities";
import {
  isStrictTryonOrigin,
  parseTryonAllowedOrigins,
} from "@/lib/drape-room/security/origin";
import {
  checkTryonGlobalRateAdmission,
  checkTryonRateAdmission,
  TRYON_RATE_LIMITS,
  tryonRateLimitsReady,
} from "@/lib/drape-room/security/rate-admission";
import {
  acquireTryonGenerationLeaseDetailed,
  TRYON_REDIS_SCRIPTS_FOR_TESTS,
  type TryonRedisClient,
} from "@/lib/drape-room/security/redis-guard";
import {
  deriveTryonSessionTag,
  issueTryonSession,
  serializeTryonSessionCookie,
  verifyTryonSession,
} from "@/lib/drape-room/security/session";
import { createTryonInvocationDeadline } from "@/lib/drape-room/server/deadline";
import { releaseTryonLeaseObserved } from "@/lib/drape-room/server/lease-cleanup";
import type { RateLimiterPort } from "@/lib/ports/rate-limiter";

const secret = (label: string) => `${label}-${"x".repeat(40)}`;

describe("Drape Room paid-route security", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires an exact configured Origin and same-origin fetch metadata", () => {
    const parsed = parseTryonAllowedOrigins(
      "https://fromthetrunk.shop,https://www.fromthetrunk.shop",
      "production",
    );
    if (!parsed.ok) throw new Error("expected valid origins");
    const request = (headers: HeadersInit) =>
      new Request("https://www.fromthetrunk.shop/api/tryon/generate", {
        headers,
        method: "POST",
      });
    expect(
      isStrictTryonOrigin(
        request({ Origin: "https://www.fromthetrunk.shop" }),
        parsed.origins,
      ),
    ).toBe(true);
    expect(isStrictTryonOrigin(request({}), parsed.origins)).toBe(false);
    expect(
      isStrictTryonOrigin(request({ Origin: "null" }), parsed.origins),
    ).toBe(false);
    expect(
      isStrictTryonOrigin(
        request({ Origin: "https://evil.example" }),
        parsed.origins,
      ),
    ).toBe(false);
    expect(
      isStrictTryonOrigin(
        request({
          Origin: "https://www.fromthetrunk.shop",
          "Sec-Fetch-Site": "cross-site",
        }),
        parsed.origins,
      ),
    ).toBe(false);
  });

  it("rejects signed-cookie tampering and uses a strict __Host production cookie", () => {
    const sessionSecret = secret("session");
    const session = issueTryonSession(sessionSecret, undefined, 1_800_000_000_000);
    if (!session) throw new Error("expected session");
    expect(
      verifyTryonSession(sessionSecret, session.value, 1_800_000_001_000),
    ).toMatchObject({ nonce: session.nonce });
    expect(
      verifyTryonSession(
        sessionSecret,
        `${session.value.slice(0, -1)}x`,
        1_800_000_001_000,
      ),
    ).toBeNull();
    const cookie = serializeTryonSessionCookie(session.value, "production");
    expect(cookie).toContain("__Host-ftt-tryon-session=");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Domain=");
  });

  it("derives stable HMAC identities without retaining raw session, IP, or UUID", () => {
    const hmacSecret = secret("hmac");
    const ipSecret = secret("ip");
    const session = issueTryonSession(secret("session"));
    if (!session) throw new Error("expected session");
    const sessionTag = deriveTryonSessionTag(hmacSecret, session.nonce);
    if (!sessionTag) throw new Error("expected tag");
    const request = new Request("https://example.invalid", {
      headers: { "X-Real-IP": "203.0.113.10" },
    });
    const ipTag = deriveTryonIpTag(request, ipSecret, "production");
    const idempotency = "33333333-3333-4333-8333-333333333333";
    const hash = deriveTryonIdempotencyHash(
      hmacSecret,
      sessionTag,
      idempotency,
    );
    expect(sessionTag).toHaveLength(43);
    expect(ipTag).toHaveLength(43);
    expect(hash).toHaveLength(43);
    expect(ipTag).not.toContain("203.0.113.10");
    expect(hash).not.toContain(idempotency);
  });

  it("prefers Vercel's trusted forwarded IP and limits generic XFF to non-production", () => {
    const ipSecret = secret("ip-source");
    const preferred = deriveTryonIpTag(
      new Request("https://example.invalid", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.20, 10.0.0.1",
          "x-real-ip": "203.0.113.10",
        },
      }),
      ipSecret,
      "production",
    );
    const expected = deriveTryonIpTag(
      new Request("https://example.invalid", {
        headers: { "x-vercel-forwarded-for": "203.0.113.20" },
      }),
      ipSecret,
      "production",
    );
    expect(preferred).toBe(expected);

    const genericForwarded = new Request("https://example.invalid", {
      headers: { "x-forwarded-for": "203.0.113.30" },
    });
    expect(deriveTryonIpTag(genericForwarded, ipSecret, "production")).toBeNull();
    expect(deriveTryonIpTag(genericForwarded, ipSecret, "development")).toHaveLength(
      43,
    );
  });

  it("fails the production rate gate closed without durable Redis", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    expect(tryonRateLimitsReady("production")).toBe(false);
    expect(tryonRateLimitsReady("test")).toBe(true);
  });

  it("charges the global rate limit only for requests accepted by narrower gates", async () => {
    const counts = new Map<string, number>();
    const now = 1_800_000_000_000;
    const limiter: RateLimiterPort = {
      async check(key, options) {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return {
          success: count <= options.limit,
          remaining: Math.max(0, options.limit - count),
          resetAt: now + options.windowSeconds * 1_000,
        };
      },
    };

    let accepted = 0;
    for (
      let attempt = 0;
      attempt < TRYON_RATE_LIMITS.globalHour.limit;
      attempt += 1
    ) {
      const admission = await checkTryonRateAdmission(
        "same-session",
        "same-ip",
        limiter,
        now,
      );
      if (admission.allowed) {
        accepted += 1;
        await checkTryonGlobalRateAdmission(limiter, now);
      }
    }

    expect(accepted).toBe(TRYON_RATE_LIMITS.sessionTenMinutes.limit);
    expect(accepted).toBe(3);
    expect(counts.get("ftt:tryon:v1:rate:global:1h")).toBe(3);
  });

  it("distinguishes a held session lock from a saturated global semaphore", async () => {
    const sessionBlocked: TryonRedisClient = {
      eval: vi.fn(async (script) =>
        script === TRYON_REDIS_SCRIPTS_FOR_TESTS.sessionLock ? 0 : 1,
      ),
    };
    await expect(
      acquireTryonGenerationLeaseDetailed(
        sessionBlocked,
        "a".repeat(43),
        30_000,
        1_800_000_000_000,
      ),
    ).resolves.toEqual({ acquired: false, reason: "session" });

    const globalBlocked: TryonRedisClient = {
      eval: vi.fn(async (script) =>
        script === TRYON_REDIS_SCRIPTS_FOR_TESTS.semaphoreAcquire ? 0 : 1,
      ),
    };
    await expect(
      acquireTryonGenerationLeaseDetailed(
        globalBlocked,
        "b".repeat(43),
        30_000,
        1_800_000_000_000,
      ),
    ).resolves.toEqual({ acquired: false, reason: "global" });
  });

  it("atomically caps global provider concurrency at three and releases leases", async () => {
    const locks = new Map<string, string>();
    const semaphore = new Set<string>();
    const redis: TryonRedisClient = {
      eval: vi.fn(async (script, keys, args) => {
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.sessionLock) {
          if (locks.has(keys[0])) return 0;
          locks.set(keys[0], String(args[0]));
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.semaphoreAcquire) {
          if (semaphore.size >= Number(args[2])) return 0;
          semaphore.add(String(args[3]));
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseLock) {
          if (locks.get(keys[0]) === String(args[0])) locks.delete(keys[0]);
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseSemaphore) {
          semaphore.delete(String(args[0]));
          return 1;
        }
        throw new Error("unexpected script");
      }),
    };
    const admissions = [];
    for (const tag of ["a", "b", "c", "d"]) {
      admissions.push(
        await acquireTryonGenerationLeaseDetailed(
          redis,
          tag.repeat(43),
          30_000,
          1_800_000_000_000,
        ),
      );
    }
    expect(admissions.slice(0, 3).every((item) => item.acquired)).toBe(true);
    expect(admissions[3]).toEqual({ acquired: false, reason: "global" });
    const first = admissions[0];
    if (!first.acquired) throw new Error("expected acquired lease");
    await expect(first.lease.release()).resolves.toEqual({
      complete: true,
      global: "released",
      session: "released",
    });
    await expect(first.lease.release()).resolves.toEqual({
      complete: true,
      global: "released",
      session: "released",
    });
    const replacement = await acquireTryonGenerationLeaseDetailed(
      redis,
      "e".repeat(43),
      30_000,
      1_800_000_000_000,
    );
    expect(replacement.acquired).toBe(true);
  });

  it("reports a partial Redis lease release and permits an idempotent retry", async () => {
    const locks = new Map<string, string>();
    const semaphore = new Set<string>();
    let failGlobalRelease = true;
    const redis: TryonRedisClient = {
      eval: vi.fn(async (script, keys, args) => {
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.sessionLock) {
          locks.set(keys[0], String(args[0]));
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.semaphoreAcquire) {
          semaphore.add(String(args[3]));
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseLock) {
          if (!locks.has(keys[0])) return -1;
          if (locks.get(keys[0]) !== String(args[0])) return 0;
          locks.delete(keys[0]);
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseSemaphore) {
          if (failGlobalRelease) {
            failGlobalRelease = false;
            throw new Error("redis unavailable");
          }
          return semaphore.delete(String(args[0])) ? 1 : 0;
        }
        throw new Error("unexpected script");
      }),
    };
    const admission = await acquireTryonGenerationLeaseDetailed(
      redis,
      "z".repeat(43),
      30_000,
      1_800_000_000_000,
    );
    if (!admission.acquired) throw new Error("expected acquired lease");
    await expect(admission.lease.release()).resolves.toEqual({
      complete: false,
      global: "failed",
      session: "released",
    });
    await expect(admission.lease.release()).resolves.toEqual({
      complete: true,
      global: "released",
      session: "already_absent",
    });
  });

  it("distinguishes a session lease now owned by another invocation", async () => {
    const locks = new Map<string, string>();
    const redis: TryonRedisClient = {
      eval: vi.fn(async (script, keys, args) => {
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.sessionLock) {
          locks.set(keys[0], String(args[0]));
          return 1;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.semaphoreAcquire) return 1;
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseLock) {
          if (!locks.has(keys[0])) return -1;
          return locks.get(keys[0]) === String(args[0]) ? 1 : 0;
        }
        if (script === TRYON_REDIS_SCRIPTS_FOR_TESTS.releaseSemaphore) return 1;
        throw new Error("unexpected script");
      }),
    };
    const admission = await acquireTryonGenerationLeaseDetailed(
      redis,
      "y".repeat(43),
      30_000,
      1_800_000_000_000,
    );
    if (!admission.acquired) throw new Error("expected acquired lease");
    locks.set(
      `ftt:tryon:v1:active:session:${"y".repeat(43)}`,
      "new-owner",
    );

    await expect(admission.lease.release()).resolves.toEqual({
      complete: true,
      global: "released",
      session: "not_owned",
    });
  });

  it("observes not-owned cleanup separately from a successful release", async () => {
    vi.stubEnv("FTT_TRYON_TEST_OBSERVABILITY", "true");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const deadline = createTryonInvocationDeadline({
      now: () => 1_800_000_000_000,
    });
    try {
      await releaseTryonLeaseObserved(
        deadline,
        {
          release: async () => ({
            complete: true,
            global: "already_absent",
            session: "not_owned",
          }),
        },
        { releaseContext: "test" },
      );
      const output = stdout.mock.calls.map(([value]) => String(value)).join("\n");
      expect(output).toContain('"stage":"redis_lease_not_owned"');
      expect(output).not.toContain('"stage":"redis_lease_released"');
    } finally {
      deadline.dispose();
    }
  });
});
