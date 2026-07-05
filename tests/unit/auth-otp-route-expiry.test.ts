import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAuthSecurityEventMock = vi.hoisted(() => vi.fn());
const createOtpChallengeMock = vi.hoisted(() => vi.fn());
const getOtpChallengeAuditByChallengeTokenMock = vi.hoisted(() => vi.fn());
const getOtpChallengeByChallengeTokenMock = vi.hoisted(() => vi.fn());
const incrementOtpChallengeAttemptMock = vi.hoisted(() => vi.fn());
const markOtpChallengeVerifiedMock = vi.hoisted(() => vi.fn());
const setOtpLoginTicketMock = vi.hoisted(() => vi.fn());
const consumeOtpLoginTicketMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
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

describe("auth OTP route expiry behavior", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");
  const challengeToken = "a".repeat(64);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-at-least-32-characters");
    createAuthSecurityEventMock.mockReset().mockResolvedValue({ id: "event-1" });
    createOtpChallengeMock.mockReset().mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({
        ...input,
        attempts: 0,
        consumedAt: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        id: "11111111-1111-4111-8111-111111111111",
        maxAttempts: 5,
        sendCount: 1,
        updatedAt: now,
        verifiedAt: null,
      })
    );
    getOtpChallengeAuditByChallengeTokenMock.mockReset();
    getOtpChallengeByChallengeTokenMock.mockReset();
    incrementOtpChallengeAttemptMock.mockReset();
    markOtpChallengeVerifiedMock.mockReset();
    setOtpLoginTicketMock.mockReset();
    consumeOtpLoginTicketMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    sendEmailMock.mockReset().mockResolvedValue(true);
    rateLimitResponseMock.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects expired OTP verification and does not create a ticket", async () => {
    getOtpChallengeAuditByChallengeTokenMock.mockResolvedValue({
      attempts: 0,
      consumedAt: null,
      deliveryEmail: "buyer@example.com",
      expiresAt: new Date(now.getTime() - 1000),
      id: "11111111-1111-4111-8111-111111111111",
      identifierNormalized: "buyer@example.com",
      identifierType: "email",
      maxAttempts: 5,
      purpose: "sign_in",
      userId: "user-1",
    });

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/verify", {
      body: JSON.stringify({ challengeToken, otp: "123456" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "OTP_EXPIRED",
      message: "This code has expired. Please request a new one.",
    });
    expect(getOtpChallengeByChallengeTokenMock).not.toHaveBeenCalled();
    expect(setOtpLoginTicketMock).not.toHaveBeenCalled();
    expect(JSON.stringify(createAuthSecurityEventMock.mock.calls)).not.toContain(challengeToken);
  });

  it("unknown sign-in email returns generic response and sends email OTP", async () => {
    getUserByEmailMock.mockResolvedValue(null);

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/start", {
      body: JSON.stringify({ identifier: "unknown@example.com", purpose: "sign_in" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, string>;
    expect(json.message).toBe("If this email or account can continue, we’ve sent a code.");
    expect(new Date(json.expiresAt).getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    expect(createOtpChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryEmail: "unknown@example.com",
        metadata: expect.objectContaining({ deliverable: true }),
        userId: null,
      })
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
