import { describe, expect, it, vi } from "vitest";

import {
  checkProductAdmissionGuard,
  recordInvalidProductAdmission,
  TRYON_PRODUCT_ADMISSION_GUARD_POLICY,
  TRYON_PRODUCT_ADMISSION_GUARD_SCRIPTS_FOR_TESTS,
} from "@/lib/drape-room/security/product-admission-guard";
import {
  checkProviderCircuit,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
  TRYON_PROVIDER_CIRCUIT_POLICY,
  TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS,
} from "@/lib/drape-room/security/provider-circuit-breaker";
import type { TryonRedisClient } from "@/lib/drape-room/security/redis-guard";

class FakeControlRedis implements TryonRedisClient {
  readonly calls: Array<{ args: Array<number | string>; keys: string[] }> = [];
  private readonly counters = new Map<string, number>();
  private readonly openTtls = new Map<string, number>();
  private readonly probes = new Map<string, string>();
  private circuitExpired = false;
  private stateVersion = 0;

  expireCircuit(): void {
    this.circuitExpired = true;
  }

  async eval(
    script: string,
    keys: string[],
    args: Array<number | string>,
  ): Promise<unknown> {
    this.calls.push({ args, keys });
    if (
      script === TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS.check ||
      script === TRYON_PRODUCT_ADMISSION_GUARD_SCRIPTS_FOR_TESTS.check
    ) {
      const ttl = this.openTtls.get(keys[0]) ?? 0;
      if (script === TRYON_PRODUCT_ADMISSION_GUARD_SCRIPTS_FOR_TESTS.check) {
        return ttl;
      }
      if (ttl === 0) return [1, 0, ""];
      if (!this.circuitExpired) return [0, ttl, ""];
      if (this.probes.has(keys[1])) return [0, Number(args[1]), ""];
      this.probes.set(keys[1], String(args[0]));
      return [1, 0, String(this.stateVersion)];
    }
    if (script === TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS.recordSuccess) {
      if (!args[0]) {
        this.counters.delete(keys[2]);
        return 0;
      }
      if (
        this.probes.get(keys[1]) === args[0] &&
        String(this.stateVersion) === args[1]
      ) {
        this.openTtls.delete(keys[0]);
        this.probes.delete(keys[1]);
        this.counters.delete(keys[2]);
        this.circuitExpired = false;
        return 1;
      }
      return 0;
    }
    if (script === TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS.releaseProbe) {
      if (this.probes.get(keys[0]) !== args[0]) return 0;
      this.probes.delete(keys[0]);
      return 1;
    }
    if (script === TRYON_PROVIDER_CIRCUIT_SCRIPTS_FOR_TESTS.recordFailure) {
      const existingOpenTtl = this.openTtls.get(keys[0]) ?? 0;
      if (args[0] === "immediate") {
        const openTtl = Math.max(existingOpenTtl, Number(args[3]));
        this.openTtls.set(keys[0], openTtl);
        this.stateVersion += 1;
        this.circuitExpired = false;
        this.counters.delete(keys[1]);
        return openTtl;
      }
      const failures = (this.counters.get(keys[1]) ?? 0) + 1;
      this.counters.set(keys[1], failures);
      if (existingOpenTtl > 0 || failures >= Number(args[2])) {
        const openTtl = Math.max(existingOpenTtl, Number(args[4]));
        this.openTtls.set(keys[0], openTtl);
        this.stateVersion += 1;
        this.circuitExpired = false;
        this.counters.delete(keys[1]);
        return openTtl;
      }
      return 0;
    }
    if (
      script ===
      TRYON_PRODUCT_ADMISSION_GUARD_SCRIPTS_FOR_TESTS.recordInvalidProduct
    ) {
      const failures = (this.counters.get(keys[1]) ?? 0) + 1;
      this.counters.set(keys[1], failures);
      if (failures >= Number(args[1])) {
        this.openTtls.set(keys[0], Number(args[2]));
        this.counters.delete(keys[1]);
        return args[2];
      }
      return 0;
    }
    throw new Error("unexpected script");
  }
}

describe("Drape Room distributed production controls", () => {
  it("opens a provider/model circuit after three shared transient failures", async () => {
    const redis = new FakeControlRedis();
    await expect(
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    await expect(
      recordProviderCircuitFailure(
        redis,
        "google",
        "gemini-3.1-flash-image",
        "upstream_unavailable",
      ),
    ).resolves.toBe(0);
    await expect(
      recordProviderCircuitFailure(
        redis,
        "google",
        "gemini-3.1-flash-image",
        "deadline_exceeded",
      ),
    ).resolves.toBe(0);
    await expect(
      recordProviderCircuitFailure(
        redis,
        "google",
        "gemini-3.1-flash-image",
        "rate_limited",
      ),
    ).resolves.toBe(TRYON_PROVIDER_CIRCUIT_POLICY.transientOpenMs / 1_000);
    await expect(
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds:
        TRYON_PROVIDER_CIRCUIT_POLICY.transientOpenMs / 1_000,
    });
  });

  it("opens immediately for provider configuration failures and does not let a late success close it", async () => {
    const redis = new FakeControlRedis();
    await expect(
      recordProviderCircuitFailure(
        redis,
        "google",
        "gemini-3.1-flash-image",
        "authentication_failed",
      ),
    ).resolves.toBe(
      TRYON_PROVIDER_CIRCUIT_POLICY.configurationOpenMs / 1_000,
    );
    await recordProviderCircuitSuccess(
      redis,
      "google",
      "gemini-3.1-flash-image",
    );
    await expect(
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("never shortens a long configuration cooldown when a late transient failure arrives", async () => {
    const redis = new FakeControlRedis();
    await recordProviderCircuitFailure(
      redis,
      "google",
      "gemini-3.1-flash-image",
      "authentication_failed",
    );

    await expect(
      recordProviderCircuitFailure(
        redis,
        "google",
        "gemini-3.1-flash-image",
        "upstream_unavailable",
      ),
    ).resolves.toBe(
      TRYON_PROVIDER_CIRCUIT_POLICY.configurationOpenMs / 1_000,
    );
    await expect(
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds:
        TRYON_PROVIDER_CIRCUIT_POLICY.configurationOpenMs / 1_000,
    });
  });

  it("admits exactly one atomic half-open probe across concurrent instances", async () => {
    const redis = new FakeControlRedis();
    await recordProviderCircuitFailure(
      redis,
      "google",
      "gemini-3.1-flash-image",
      "authentication_failed",
    );
    redis.expireCircuit();

    const [first, second] = await Promise.all([
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ]);
    expect(first.allowed).toBe(true);
    expect(first.allowed && first.probe).toBeDefined();
    expect(second).toEqual({
      allowed: false,
      retryAfterSeconds:
        TRYON_PROVIDER_CIRCUIT_POLICY.halfOpenProbeMs / 1_000,
    });

    if (!first.allowed || !first.probe) throw new Error("expected probe");
    await recordProviderCircuitSuccess(
      redis,
      "google",
      "gemini-3.1-flash-image",
      first.probe,
    );
    await expect(
      checkProviderCircuit(redis, "google", "gemini-3.1-flash-image"),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("blocks repeated invalid-product probing using only the HMAC IP tag", async () => {
    const redis = new FakeControlRedis();
    const ipTag = "i".repeat(43);
    for (
      let attempt = 1;
      attempt <= TRYON_PRODUCT_ADMISSION_GUARD_POLICY.failureThreshold;
      attempt += 1
    ) {
      const retryAfter = await recordInvalidProductAdmission(redis, ipTag);
      expect(retryAfter).toBe(
        attempt === TRYON_PRODUCT_ADMISSION_GUARD_POLICY.failureThreshold
          ? TRYON_PRODUCT_ADMISSION_GUARD_POLICY.blockMs / 1_000
          : 0,
      );
    }
    await expect(checkProductAdmissionGuard(redis, ipTag)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds:
        TRYON_PRODUCT_ADMISSION_GUARD_POLICY.blockMs / 1_000,
    });
    expect(redis.calls.flatMap((call) => call.keys).join(" ")).not.toContain(
      "203.0.113.10",
    );
  });

  it("rejects malformed circuit and product-guard identities before Redis", async () => {
    const redis = { eval: vi.fn() } satisfies TryonRedisClient;
    await expect(
      checkProviderCircuit(redis, "google", "model with spaces"),
    ).rejects.toThrow("TRYON_INVALID_PROVIDER_CIRCUIT_INPUT");
    await expect(
      checkProductAdmissionGuard(redis, "203.0.113.10"),
    ).rejects.toThrow("TRYON_INVALID_PRODUCT_ADMISSION_GUARD_INPUT");
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
