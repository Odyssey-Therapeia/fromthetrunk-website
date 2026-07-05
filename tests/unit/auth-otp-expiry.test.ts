import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { CreateOtpChallengeInput } from "@/db/queries/auth-otp";

const dbInsertMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn());
const updateSetMock = vi.hoisted(() => vi.fn());
const updateWhereMock = vi.hoisted(() => vi.fn());
const returningMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
    update: dbUpdateMock,
  },
  withRetry: (fn: () => unknown) => fn(),
}));

function collectPrimitives(node: unknown, seen = new WeakSet<object>()): Array<string | Date> {
  if (node === null || node === undefined) return [];
  if (typeof node === "string" || node instanceof Date) return [node];
  if (Array.isArray(node)) return node.flatMap((item) => collectPrimitives(item, seen));
  if (typeof node !== "object") return [];
  if (seen.has(node)) return [];
  seen.add(node);
  return Object.values(node as Record<string, unknown>).flatMap((value) =>
    collectPrimitives(value, seen)
  );
}

function mockInsertReturning() {
  dbInsertMock.mockReturnValue({ values: insertValuesMock });
  insertValuesMock.mockReturnValue({ returning: returningMock });
  returningMock.mockImplementation(() => {
    const values = insertValuesMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    return Promise.resolve([
      {
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
        id: "11111111-1111-4111-8111-111111111111",
        maxAttempts: 5,
        sendCount: 1,
        updatedAt: new Date(),
        verifiedAt: null,
        ...values,
      },
    ]);
  });
}

function mockUpdateReturning() {
  dbUpdateMock.mockReturnValue({ set: updateSetMock });
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateWhereMock.mockReturnValue({ returning: returningMock });
  returningMock.mockResolvedValue([
    {
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      deliveryEmail: "buyer@example.com",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      id: "11111111-1111-4111-8111-111111111111",
      identifierNormalized: "buyer@example.com",
      identifierType: "email",
      maxAttempts: 5,
      metadata: null,
      purpose: "sign_in",
      requestIpHash: null,
      resendAvailableAt: new Date(),
      sendCount: 1,
      updatedAt: new Date(),
      userAgentHash: null,
      userId: "user-1",
      verifiedAt: new Date(),
    },
  ]);
}

describe("OTP expiry query hardening", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-at-least-32-characters");
    dbInsertMock.mockReset();
    dbUpdateMock.mockReset();
    dbSelectMock.mockReset();
    insertValuesMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    returningMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creates OTP challenges with 5 minute expiry and ignores caller-supplied long expiry", async () => {
    mockInsertReturning();
    const { createOtpChallenge } = await import("@/db/queries/auth-otp");

    await createOtpChallenge({
      challengeToken: "challenge-token",
      deliveryEmail: "buyer@example.com",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      identifierNormalized: "buyer@example.com",
      identifierType: "email",
      otp: "123456",
      purpose: "sign_in",
      resendAvailableAt: now,
    } as unknown as CreateOtpChallengeInput);

    const values = insertValuesMock.mock.calls[0]?.[0] as { expiresAt: Date };
    expect(values.expiresAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    expect(values.expiresAt.getTime()).toBeLessThanOrEqual(now.getTime() + 10 * 60 * 1000);
  });

  it("sets login tickets to expire in 3 minutes by default", async () => {
    mockUpdateReturning();
    const { setOtpLoginTicket } = await import("@/db/queries/auth-otp");

    await setOtpLoginTicket("challenge-token", "login-ticket", now);

    const values = updateSetMock.mock.calls[0]?.[0] as { loginTicketExpiresAt: Date };
    expect(values.loginTicketExpiresAt.getTime()).toBe(now.getTime() + 3 * 60 * 1000);
  });

  it("allows registration tickets to use the explicit 5 minute ticket expiry", async () => {
    mockUpdateReturning();
    const { getOtpRegistrationTicketExpiresAt } = await import("@/lib/auth/otp");
    const { setOtpLoginTicket } = await import("@/db/queries/auth-otp");

    await setOtpLoginTicket(
      "challenge-token",
      "registration-ticket",
      now,
      getOtpRegistrationTicketExpiresAt(now)
    );

    const values = updateSetMock.mock.calls[0]?.[0] as { loginTicketExpiresAt: Date };
    expect(values.loginTicketExpiresAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("atomically consumes only unexpired, unused login tickets", async () => {
    mockUpdateReturning();
    const { consumeOtpLoginTicket } = await import("@/db/queries/auth-otp");

    await consumeOtpLoginTicket("login-ticket", now, "sign_in");

    const whereArg = updateWhereMock.mock.calls[0]?.[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain("login_ticket_expires_at");
    expect(primitives).toContain("consumed_at");
    expect(primitives).toContain("sign_in");
  });
});
