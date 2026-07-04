import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Phase D durable rate limiter behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/ports/rate-limiter");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("allows production requireDurable requests when the durable limiter is configured", async () => {
    const checkMock = vi.fn().mockResolvedValue({
      remaining: 4,
      resetAt: Date.now() + 60_000,
      success: true,
    });
    vi.doMock("@/lib/ports/rate-limiter", () => ({
      getRateLimiter: () => ({ check: checkMock }),
      isDurableRateLimiterConfigured: () => true,
    }));
    vi.stubEnv("NODE_ENV", "production");

    const { rateLimitResponse } = await import("@/lib/http/rate-limit");
    const response = await rateLimitResponse(
      new Request("https://www.fromthetrunk.shop/api/v2/auth/otp/start", {
        headers: { "x-real-ip": "203.0.113.20" },
      }),
      "auth:otp:start:ip",
      { limit: 15, requireDurable: true, windowSeconds: 600 },
    );

    expect(response).toBeNull();
    expect(checkMock).toHaveBeenCalledWith("auth:otp:start:ip:203.0.113.20", {
      limit: 15,
      requireDurable: true,
      windowSeconds: 600,
    });
  });

  it("returns 429 with Retry-After when the configured durable limiter rejects a request", async () => {
    const resetAt = Date.now() + 30_000;
    vi.doMock("@/lib/ports/rate-limiter", () => ({
      getRateLimiter: () => ({
        check: vi.fn().mockResolvedValue({
          remaining: 0,
          resetAt,
          success: false,
        }),
      }),
      isDurableRateLimiterConfigured: () => true,
    }));
    vi.stubEnv("NODE_ENV", "production");

    const { rateLimitResponse } = await import("@/lib/http/rate-limit");
    const response = await rateLimitResponse(
      new Request("https://www.fromthetrunk.shop/api/v2/auth/otp/verify", {
        headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.21" },
      }),
      "auth:otp:verify:phase-d-token-hash",
      { limit: 8, requireDurable: true, windowSeconds: 60 },
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(response?.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("keeps high-risk mutation routes wired with requireDurable rate limits", async () => {
    const [authOtp, cart, payments, search] = await Promise.all([
      readFile("api/hono/routes/auth-otp.ts", "utf8"),
      readFile("api/hono/routes/cart.ts", "utf8"),
      readFile("api/hono/routes/payments.ts", "utf8"),
      readFile("api/hono/routes/search.ts", "utf8"),
    ]);

    expect(authOtp).toMatch(/auth:otp:start:ip[\s\S]*?requireDurable:\s*true/);
    expect(authOtp).toMatch(/auth:otp:verify:\$\{challengeTokenHash\}[\s\S]*?requireDurable:\s*true/);
    expect(cart).toMatch(/cart:reserve[\s\S]*?requireDurable:\s*true/);
    expect(payments).toMatch(/payment:create:\$\{authUserOrResponse\.id\}[\s\S]*?requireDurable:\s*true/);
    expect(search).toMatch(/search:semantic[\s\S]*?requireDurable:\s*true/);
  });
});
