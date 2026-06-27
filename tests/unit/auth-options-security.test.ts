import { beforeEach, describe, expect, it, vi } from "vitest";

const compareMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const consumeOtpLoginTicketMock = vi.hoisted(() => vi.fn());
const createAuthSecurityEventMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const isDurableRateLimiterConfiguredMock = vi.hoisted(() => vi.fn());

vi.mock("bcryptjs", () => ({
  default: {
    compare: compareMock,
  },
}));

vi.mock("@/db/queries/users", () => ({
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
}));

vi.mock("@/db/queries/auth-otp", () => ({
  consumeOtpLoginTicket: consumeOtpLoginTicketMock,
  createAuthSecurityEvent: createAuthSecurityEventMock,
}));

vi.mock("@/lib/http/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/ports/rate-limiter", () => ({
  isDurableRateLimiterConfigured: isDurableRateLimiterConfiguredMock,
}));

vi.mock("@/lib/auth/drizzle-adapter", () => ({
  DrizzleAdapter: () => ({}),
}));

type AuthorizeFn = (credentials: Record<string, string>, request: unknown) => Promise<unknown>;

async function getCredentialsAuthorize(): Promise<AuthorizeFn> {
  const { authOptions } = await import("@/lib/auth/options");
  const provider = authOptions.providers.find((candidate) => candidate.id === "credentials");
  const providerWithAuthorize = provider as
    | {
        authorize?: AuthorizeFn;
        options?: { authorize?: AuthorizeFn };
      }
    | undefined;
  const authorize = providerWithAuthorize?.options?.authorize ?? providerWithAuthorize?.authorize;
  if (!authorize) {
    throw new Error("credentials provider not found");
  }
  return authorize;
}

describe("authOptions password credentials security", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    compareMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    consumeOtpLoginTicketMock.mockReset();
    createAuthSecurityEventMock.mockReset();
    checkRateLimitMock.mockReset().mockResolvedValue({ remaining: 4, resetAt: Date.now() + 60_000, success: true });
    isDurableRateLimiterConfiguredMock.mockReset().mockReturnValue(false);
  });

  it("rate limits password authorize before user lookup", async () => {
    checkRateLimitMock.mockResolvedValue({ remaining: 0, resetAt: Date.now() + 60_000, success: false });
    const authorize = await getCredentialsAuthorize();

    const result = await authorize(
      { email: "buyer@example.com", password: "Password123" },
      { headers: { "x-real-ip": "203.0.113.10" } }
    );

    expect(result).toBeNull();
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:password:/),
      expect.objectContaining({ limit: 5, requireDurable: true, windowSeconds: 300 })
    );
    expect(getUserByEmailMock).not.toHaveBeenCalled();
  });

  it("fails closed in production if durable rate limiting is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    isDurableRateLimiterConfiguredMock.mockReturnValue(false);
    const authorize = await getCredentialsAuthorize();

    const result = await authorize(
      { email: "buyer@example.com", password: "Password123" },
      { headers: { "x-real-ip": "203.0.113.10" } }
    );

    expect(result).toBeNull();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(getUserByEmailMock).not.toHaveBeenCalled();
  });

  it("still allows valid password sign-in when under the limit", async () => {
    getUserByEmailMock.mockResolvedValue({
      email: "buyer@example.com",
      id: "user-1",
      image: null,
      name: "Buyer",
      passwordHash: "stored-hash",
      role: "customer",
    });
    compareMock.mockResolvedValue(true);
    const authorize = await getCredentialsAuthorize();

    const result = await authorize(
      { email: "buyer@example.com", password: "Password123" },
      { headers: { "x-real-ip": "203.0.113.10" } }
    );

    expect(result).toMatchObject({
      email: "buyer@example.com",
      id: "user-1",
      role: "customer",
    });
    expect(compareMock).toHaveBeenCalledWith("Password123", "stored-hash");
  });
});
