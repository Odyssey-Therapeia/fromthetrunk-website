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
const dbInsertMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
    update: dbUpdateMock,
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

const now = new Date("2026-06-27T10:00:00.000Z");
const registrationToken = "r".repeat(64);

const registrationBody = {
  fullName: "Test User",
  phone: "+919999999999",
  registrationToken,
};

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  createdAt: now,
  defaultAddress: null,
  defaultAddressId: null,
  email: "user@example.com",
  emailVerified: null,
  id: "11111111-1111-4111-8111-111111111111",
  image: null,
  metadata: {},
  name: "Existing User",
  passwordHash: "existing-hash",
  phone: null,
  role: "customer",
  updatedAt: now,
  ...overrides,
});

const makeRegistrationChallenge = (overrides: Record<string, unknown> = {}) => ({
  attempts: 0,
  consumedAt: now,
  createdAt: now,
  deliveryEmail: "user@example.com",
  expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  id: "22222222-2222-4222-8222-222222222222",
  identifierNormalized: "user@example.com",
  identifierType: "email",
  loginTicketExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  maxAttempts: 5,
  metadata: null,
  purpose: "sign_up",
  requestIpHash: null,
  resendAvailableAt: now,
  sendCount: 1,
  updatedAt: now,
  userAgentHash: null,
  userId: null,
  verifiedAt: now,
  ...overrides,
});

const makeInsertChain = (rows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  return { returning, values };
};

const makeUpdateChain = (rows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { returning, set, where };
};

describe("auth OTP register completion account rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-at-least-32-characters");

    createAuthSecurityEventMock.mockReset().mockResolvedValue({ id: "event-1" });
    createOtpChallengeMock.mockReset().mockResolvedValue(
      makeRegistrationChallenge({
        id: "33333333-3333-4333-8333-333333333333",
        purpose: "sign_in",
      })
    );
    getOtpChallengeAuditByChallengeTokenMock.mockReset();
    getOtpChallengeByChallengeTokenMock.mockReset();
    incrementOtpChallengeAttemptMock.mockReset();
    markOtpChallengeVerifiedMock.mockReset().mockResolvedValue(makeRegistrationChallenge());
    setOtpLoginTicketMock.mockReset().mockResolvedValue(makeRegistrationChallenge());
    consumeOtpLoginTicketMock.mockReset().mockResolvedValue(makeRegistrationChallenge());
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    sendEmailMock.mockReset().mockResolvedValue(true);
    rateLimitResponseMock.mockReset().mockResolvedValue(null);
    dbInsertMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("does not reveal an existing real account before sign-up OTP verification", async () => {
    const existing = makeUser();
    getUserByEmailMock.mockResolvedValue(existing);
    createOtpChallengeMock.mockResolvedValue(
      makeRegistrationChallenge({
        userId: existing.id,
      })
    );

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/start", {
      body: JSON.stringify({ identifier: "user@example.com", purpose: "sign_up" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      message: "If this email or account can continue, we’ve sent a code.",
      ok: true,
    });
    expect(json).not.toHaveProperty("code");
    expect(createOtpChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "sign_up", userId: existing.id })
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("does not create a duplicate user for an existing real email after verification", async () => {
    getUserByEmailMock.mockResolvedValue(makeUser());

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/register/complete", {
      body: JSON.stringify(registrationBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_ALREADY_EXISTS",
    });
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(createOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("does not let an existing admin email create a customer takeover", async () => {
    const admin = makeUser({
      email: "admin@example.com",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "admin",
    });
    consumeOtpLoginTicketMock.mockResolvedValue(
      makeRegistrationChallenge({
        deliveryEmail: "admin@example.com",
        identifierNormalized: "admin@example.com",
        userId: admin.id,
      })
    );
    getUserByIdMock.mockResolvedValue(admin);

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/register/complete", {
      body: JSON.stringify(registrationBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_ALREADY_EXISTS",
    });
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(createOtpChallengeMock).not.toHaveBeenCalled();
    expect(createAuthSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "otp_register_existing_account_rejected",
        metadata: expect.objectContaining({ role: "admin" }),
        userId: admin.id,
      })
    );
  });

  it("upgrades a checkout shell in place and returns a login ticket", async () => {
    const shell = makeUser({
      metadata: { source: "checkout" },
      name: "Guest",
      passwordHash: null,
    });
    getUserByEmailMock.mockResolvedValue(shell);

    const updatedUser = makeUser({
      id: shell.id,
      metadata: { authMethod: "email_otp", source: "checkout" },
      name: registrationBody.fullName,
      phone: registrationBody.phone,
    });
    const updateChain = makeUpdateChain([updatedUser]);
    dbUpdateMock.mockReturnValue(updateChain);

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/register/complete", {
      body: JSON.stringify(registrationBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ authMethod: "email_otp", source: "checkout" }),
        name: registrationBody.fullName,
        phone: registrationBody.phone,
        role: "customer",
      })
    );
    expect(createOtpChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "sign_in",
        userId: shell.id,
      })
    );
  });

  it("creates a new customer for an unknown verified sign-up email", async () => {
    getUserByEmailMock.mockResolvedValue(null);

    const createdUser = makeUser({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      metadata: { authMethod: "email_otp" },
      name: registrationBody.fullName,
      phone: registrationBody.phone,
    });
    const insertChain = makeInsertChain([createdUser]);
    dbInsertMock.mockReturnValue(insertChain);

    const { request } = createRouteHarness({ register: registerAuthOtpRoutes });
    const response = await request("/register/complete", {
      body: JSON.stringify(registrationBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        metadata: { authMethod: "email_otp" },
        name: registrationBody.fullName,
        phone: registrationBody.phone,
        role: "customer",
      })
    );
    expect(createOtpChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "sign_in",
        userId: createdUser.id,
      })
    );
  });
});
