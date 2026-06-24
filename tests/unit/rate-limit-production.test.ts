import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimitResponse } from "@/lib/http/rate-limit";
import { _resetRateLimiterInstance } from "@/lib/ports/rate-limiter";

describe("rateLimitResponse durable production mode", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    _resetRateLimiterInstance();
    vi.unstubAllEnvs();
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
  });

  afterEach(() => {
    _resetRateLimiterInstance();
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("fails closed in production when a mutation requires durable rate limiting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await rateLimitResponse(
      new Request("https://www.fromthetrunk.shop/api/v2/cart/reserve"),
      "cart:reserve",
      { limit: 1, requireDurable: true, windowSeconds: 60 },
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      code: "RATE_LIMITER_UNAVAILABLE",
      message: "This action is temporarily unavailable.",
    });
  });

  it("keeps development/test behavior on the in-memory limiter", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await rateLimitResponse(
      new Request("http://localhost/api/v2/cart/reserve"),
      "cart:reserve",
      { limit: 1, requireDurable: true, windowSeconds: 60 },
    );

    expect(response).toBeNull();
  });

  it("allows loopback production-start probes to use the in-memory limiter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await rateLimitResponse(
      new Request("http://127.0.0.1:3007/api/v2/cart/reserve"),
      "cart:reserve",
      { limit: 1, requireDurable: true, windowSeconds: 60 },
    );

    expect(response).toBeNull();
  });
});
