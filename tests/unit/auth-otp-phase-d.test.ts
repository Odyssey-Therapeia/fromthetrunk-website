import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeOtpLoginTicketMock = vi.hoisted(() => vi.fn());
const createAuthSecurityEventMock = vi.hoisted(() => vi.fn());
const createOtpChallengeMock = vi.hoisted(() => vi.fn());
const getOtpChallengeAuditByChallengeTokenMock = vi.hoisted(() => vi.fn());
const getOtpChallengeByChallengeTokenMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const incrementOtpChallengeAttemptMock = vi.hoisted(() => vi.fn());
const markOtpChallengeVerifiedMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const setOtpLoginTicketMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/queries/auth-otp", () => ({
  consumeOtpLoginTicket: consumeOtpLoginTicketMock,
  createAuthSecurityEvent: createAuthSecurityEventMock,
  createOtpChallenge: createOtpChallengeMock,
  getOtpChallengeAuditByChallengeToken: getOtpChallengeAuditByChallengeTokenMock,
  getOtpChallengeByChallengeToken: getOtpChallengeByChallengeTokenMock,
  incrementOtpChallengeAttempt: incrementOtpChallengeAttemptMock,
  markOtpChallengeVerified: markOtpChallengeVerifiedMock,
  setOtpLoginTicket: setOtpLoginTicketMock,
}));

vi.mock("@/db/queries/users", () => ({
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: rateLimitResponseMock,
}));

import { registerAuthOtpRoutes } from "@/api/hono/routes/auth-otp";
import { createRouteHarness } from "../helpers/route-harness";

const now = new Date("2026-07-03T09:00:00.000Z");
const challengeToken = "c".repeat(64);
const correctOtp = "123456";

const syntheticUser = {
  createdAt: now,
  defaultAddress: null,
  defaultAddressId: null,
  email: "phase-d-buyer@example.test",
  emailVerified: now,
  id: "11111111-1111-4111-8111-111111111111",
  image: null,
  metadata: null,
  name: "Phase D Buyer",
  passwordHash: "not-used",
  phone: null,
  role: "customer",
  updatedAt: now,
};

const rateLimitedResponse = () =>
  new Response(
    JSON.stringify({
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
      status: 429,
    },
  );

const makeChallenge = (overrides: Record<string, unknown> = {}) => ({
  attempts: 0,
  consumedAt: null,
  createdAt: now,
  deliveryEmail: "phase-d-buyer@example.test",
  expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  id: "22222222-2222-4222-8222-222222222222",
  identifierNormalized: "phase-d-buyer@example.test",
  identifierType: "email",
  loginTicketExpiresAt: null,
  maxAttempts: 5,
  metadata: null,
  purpose: "sign_in",
  requestIpHash: null,
  resendAvailableAt: new Date(now.getTime() + 60 * 1000),
  sendCount: 1,
  updatedAt: now,
  userAgentHash: null,
  userId: syntheticUser.id,
  verifiedAt: null,
  ...overrides,
});

const postJson = async (path: string, body: Record<string, unknown>) => {
  const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
  return request(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "phase-d-test",
      "x-real-ip": "203.0.113.10",
    },
    method: "POST",
  });
};

describe("Phase D auth OTP abuse and concurrency safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("AUTH_OTP_SECRET", "phase-d-otp-secret-at-least-32-characters");
    vi.stubEnv("AUTH_OTP_TOKEN_SECRET", "phase-d-token-secret-at-least-32-characters");
    vi.stubEnv("NEXTAUTH_SECRET", "phase-d-nextauth-secret-at-least-32-characters");

    consumeOtpLoginTicketMock.mockReset();
    createAuthSecurityEventMock.mockReset().mockResolvedValue({ id: "event-1" });
    createOtpChallengeMock.mockReset().mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve(makeChallenge(input)),
    );
    getOtpChallengeAuditByChallengeTokenMock.mockReset().mockResolvedValue(null);
    getOtpChallengeByChallengeTokenMock.mockReset();
    getUserByEmailMock.mockReset().mockResolvedValue(syntheticUser);
    getUserByIdMock.mockReset().mockResolvedValue(syntheticUser);
    incrementOtpChallengeAttemptMock.mockReset().mockResolvedValue({
      attempts: 1,
      id: "22222222-2222-4222-8222-222222222222",
      maxAttempts: 5,
    });
    markOtpChallengeVerifiedMock.mockReset();
    rateLimitResponseMock.mockReset().mockResolvedValue(null);
    sendEmailMock.mockReset().mockResolvedValue(true);
    setOtpLoginTicketMock.mockReset().mockImplementation(() =>
      Promise.resolve(
        makeChallenge({
          loginTicketExpiresAt: new Date(now.getTime() + 3 * 60 * 1000),
          verifiedAt: now,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("throttles repeated OTP starts for the same identifier without exposing the raw identifier in the rate key", async () => {
    const counts = new Map<string, number>();
    const seenPrefixes: string[] = [];
    rateLimitResponseMock.mockImplementation(async (_request, prefix: string, options) => {
      seenPrefixes.push(prefix);
      const nextCount = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, nextCount);
      return nextCount > options.limit ? rateLimitedResponse() : null;
    });

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        postJson("/start", {
          identifier: "phase-d-same@example.test",
          purpose: "sign_in",
        }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect(createOtpChallengeMock).toHaveBeenCalledTimes(5);
    expect(sendEmailMock).toHaveBeenCalledTimes(5);
    expect(seenPrefixes.some((prefix) => prefix.startsWith("auth:otp:start:sign_in:email:"))).toBe(
      true,
    );
    expect(seenPrefixes.join("\n")).not.toContain("phase-d-same@example.test");
  });

  it("throttles concurrent OTP start spraying from one IP across different identifiers", async () => {
    const counts = new Map<string, number>();
    rateLimitResponseMock.mockImplementation(async (_request, prefix: string, options) => {
      const key = prefix === "auth:otp:start:ip" ? prefix : `${prefix}:identifier`;
      const nextCount = (counts.get(key) ?? 0) + 1;
      counts.set(key, nextCount);
      return nextCount > options.limit ? rateLimitedResponse() : null;
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_value, index) =>
        postJson("/start", {
          identifier: `phase-d-ip-${index}@example.test`,
          purpose: "sign_in",
        }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(15);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    expect(createOtpChallengeMock).toHaveBeenCalledTimes(15);
    expect(sendEmailMock).toHaveBeenCalledTimes(15);
  });

  it("handles email provider failure without throwing or writing an otp_sent security event", async () => {
    sendEmailMock.mockResolvedValue(false);

    const response = await postJson("/start", {
      identifier: "phase-d-provider-fail@example.test",
      purpose: "sign_in",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "If this email or account can continue, we’ve sent a code.",
      ok: true,
    });
    expect(createOtpChallengeMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const eventTypes = createAuthSecurityEventMock.mock.calls.map(
      ([event]) => (event as { eventType?: string }).eventType,
    );
    expect(eventTypes).not.toContain("otp_sent");
  });

  it("increments challenge attempts on wrong OTP and never creates a login ticket", async () => {
    const { hashOtp } = await import("@/lib/auth/otp");
    getOtpChallengeByChallengeTokenMock.mockResolvedValue(
      makeChallenge({
        otpHash: hashOtp({ challengeToken, otp: correctOtp }),
      }),
    );

    const response = await postJson("/verify", {
      challengeToken,
      otp: "654321",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_OR_EXPIRED_OTP",
    });
    expect(incrementOtpChallengeAttemptMock).toHaveBeenCalledWith(challengeToken, now);
    expect(markOtpChallengeVerifiedMock).not.toHaveBeenCalled();
    expect(setOtpLoginTicketMock).not.toHaveBeenCalled();
  });

  it("rejects inactive consumed challenges as replay attempts", async () => {
    getOtpChallengeAuditByChallengeTokenMock.mockResolvedValue(
      makeChallenge({
        consumedAt: now,
        verifiedAt: now,
      }),
    );
    getOtpChallengeByChallengeTokenMock.mockResolvedValue(null);

    const response = await postJson("/verify", {
      challengeToken,
      otp: correctOtp,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_OR_EXPIRED_OTP",
    });
    expect(setOtpLoginTicketMock).not.toHaveBeenCalled();
  });

  it("allows only one concurrent correct OTP verify to produce a login ticket", async () => {
    const { hashOtp } = await import("@/lib/auth/otp");
    const otpHash = hashOtp({ challengeToken, otp: correctOtp });
    const activeChallenge = makeChallenge({
      otpHash,
    });
    const verifiedChallenge = makeChallenge({
      otpHash,
      verifiedAt: now,
    });

    let winnerClaimed = false;
    getOtpChallengeByChallengeTokenMock.mockResolvedValue(activeChallenge);
    markOtpChallengeVerifiedMock.mockImplementation(async () => {
      if (winnerClaimed) return null;
      winnerClaimed = true;
      return verifiedChallenge;
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        postJson("/verify", {
          challengeToken,
          otp: correctOtp,
        }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 400)).toHaveLength(19);
    expect(setOtpLoginTicketMock).toHaveBeenCalledTimes(1);
    const success = responses.find((response) => response.status === 200);
    await expect(success?.json()).resolves.toMatchObject({
      mode: "sign_in",
      ok: true,
    });
  });
});
