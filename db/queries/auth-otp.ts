import {
  and,
  desc,
  eq,
  gt,
  inArray,
  InferInsertModel,
  InferSelectModel,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { authOtpChallenges, authSecurityEvents } from "@/db/schema";
import {
  getOtpChallengeExpiresAt,
  getOtpLoginTicketExpiresAt,
  getOtpMaxChallengeExpiresAt,
  hashOtp,
  hashToken,
} from "@/lib/auth/otp";

export type OtpPurpose = "checkout" | "sign_in" | "sign_up";
export type OtpIdentifierType = "email" | "phone";

type AuthOtpChallengeRecord = InferSelectModel<typeof authOtpChallenges>;
type AuthSecurityEventInsert = InferInsertModel<typeof authSecurityEvents>;

export type OtpChallenge = Omit<
  AuthOtpChallengeRecord,
  "challengeTokenHash" | "loginTicketHash" | "otpHash"
>;

type InternalOtpChallenge = AuthOtpChallengeRecord;

export type CreateOtpChallengeInput = {
  challengeToken: string;
  deliveryEmail: string;
  identifierNormalized: string;
  identifierType: OtpIdentifierType;
  maxAttempts?: number;
  metadata?: Record<string, unknown> | null;
  otp: string;
  purpose: OtpPurpose;
  requestIpHash?: null | string;
  resendAvailableAt: Date;
  sendCount?: number;
  userAgentHash?: null | string;
  userId?: null | string;
};

export type CreateAuthSecurityEventInput = Omit<
  AuthSecurityEventInsert,
  "createdAt" | "id"
>;

const publicChallengeColumns = {
  attempts: authOtpChallenges.attempts,
  consumedAt: authOtpChallenges.consumedAt,
  createdAt: authOtpChallenges.createdAt,
  deliveryEmail: authOtpChallenges.deliveryEmail,
  expiresAt: authOtpChallenges.expiresAt,
  id: authOtpChallenges.id,
  identifierNormalized: authOtpChallenges.identifierNormalized,
  identifierType: authOtpChallenges.identifierType,
  loginTicketExpiresAt: authOtpChallenges.loginTicketExpiresAt,
  maxAttempts: authOtpChallenges.maxAttempts,
  metadata: authOtpChallenges.metadata,
  purpose: authOtpChallenges.purpose,
  requestIpHash: authOtpChallenges.requestIpHash,
  resendAvailableAt: authOtpChallenges.resendAvailableAt,
  sendCount: authOtpChallenges.sendCount,
  updatedAt: authOtpChallenges.updatedAt,
  userAgentHash: authOtpChallenges.userAgentHash,
  userId: authOtpChallenges.userId,
  verifiedAt: authOtpChallenges.verifiedAt,
};

const activeChallengePredicate = (now: Date) =>
  and(
    isNull(authOtpChallenges.consumedAt),
    gt(authOtpChallenges.expiresAt, now),
    sql`${authOtpChallenges.attempts} < ${authOtpChallenges.maxAttempts}`
  );

export async function createOtpChallenge(
  input: CreateOtpChallengeInput
): Promise<OtpChallenge> {
  const now = new Date();
  const defaultExpiresAt = getOtpChallengeExpiresAt(now);
  const maxExpiresAt = getOtpMaxChallengeExpiresAt(now);
  const expiresAt =
    defaultExpiresAt.getTime() <= maxExpiresAt.getTime() ? defaultExpiresAt : maxExpiresAt;

  const created = requireFirstRow(
    await withRetry(() =>
      db
        .insert(authOtpChallenges)
        .values({
          challengeTokenHash: hashToken(input.challengeToken),
          deliveryEmail: input.deliveryEmail,
          expiresAt,
          identifierNormalized: input.identifierNormalized,
          identifierType: input.identifierType,
          maxAttempts: input.maxAttempts ?? 5,
          metadata: input.metadata ?? null,
          otpHash: hashOtp({
            challengeToken: input.challengeToken,
            otp: input.otp,
          }),
          purpose: input.purpose,
          requestIpHash: input.requestIpHash ?? null,
          resendAvailableAt: input.resendAvailableAt,
          sendCount: input.sendCount ?? 1,
          updatedAt: now,
          userAgentHash: input.userAgentHash ?? null,
          userId: input.userId ?? null,
        })
        .returning(publicChallengeColumns)
    ),
    "Failed to create OTP challenge."
  );

  return created;
}

/**
 * Internal-only lookup for OTP verification. This intentionally returns hash
 * columns because the verifier needs them; do not expose this object to clients.
 */
export async function getOtpChallengeByChallengeToken(
  challengeToken: string,
  now = new Date()
): Promise<InternalOtpChallenge | null> {
  const challengeTokenHash = hashToken(challengeToken);
  const [challenge] = await withRetry(() =>
    db
      .select()
      .from(authOtpChallenges)
      .where(
        and(
          eq(authOtpChallenges.challengeTokenHash, challengeTokenHash),
          activeChallengePredicate(now)
        )
      )
      .limit(1)
  );

  return challenge ?? null;
}

export async function getOtpChallengeAuditByChallengeToken(
  challengeToken: string
): Promise<OtpChallenge | null> {
  const [challenge] = await withRetry(() =>
    db
      .select(publicChallengeColumns)
      .from(authOtpChallenges)
      .where(eq(authOtpChallenges.challengeTokenHash, hashToken(challengeToken)))
      .limit(1)
  );

  return challenge ?? null;
}

export async function incrementOtpChallengeAttempt(
  challengeToken: string,
  now = new Date()
): Promise<Pick<OtpChallenge, "attempts" | "id" | "maxAttempts"> | null> {
  const updated = getFirstRow(
    await withRetry(() =>
      db
        .update(authOtpChallenges)
        .set({
          attempts: sql`${authOtpChallenges.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(authOtpChallenges.challengeTokenHash, hashToken(challengeToken)),
            isNull(authOtpChallenges.consumedAt),
            gt(authOtpChallenges.expiresAt, now),
            sql`${authOtpChallenges.attempts} < ${authOtpChallenges.maxAttempts}`
          )
        )
        .returning({
          attempts: authOtpChallenges.attempts,
          id: authOtpChallenges.id,
          maxAttempts: authOtpChallenges.maxAttempts,
        })
    )
  );

  return updated ?? null;
}

export async function markOtpChallengeVerified(
  challengeToken: string,
  now = new Date()
): Promise<OtpChallenge | null> {
  const updated = getFirstRow(
    await withRetry(() =>
      db
        .update(authOtpChallenges)
        .set({
          updatedAt: new Date(),
          verifiedAt: now,
        })
        .where(
          and(
            eq(authOtpChallenges.challengeTokenHash, hashToken(challengeToken)),
            isNull(authOtpChallenges.consumedAt),
            isNull(authOtpChallenges.verifiedAt),
            gt(authOtpChallenges.expiresAt, now),
            sql`${authOtpChallenges.attempts} < ${authOtpChallenges.maxAttempts}`
          )
        )
        .returning(publicChallengeColumns)
    )
  );

  return updated ?? null;
}

export async function setOtpLoginTicket(
  challengeToken: string,
  loginTicket: string,
  now = new Date(),
  ticketExpiresAt = getOtpLoginTicketExpiresAt(now),
  userId?: null | string
): Promise<OtpChallenge | null> {
  const updated = getFirstRow(
    await withRetry(() =>
      db
        .update(authOtpChallenges)
        .set({
          loginTicketExpiresAt: ticketExpiresAt,
          loginTicketHash: hashToken(loginTicket),
          updatedAt: new Date(),
          ...(userId ? { userId } : {}),
        })
        .where(
          and(
            eq(authOtpChallenges.challengeTokenHash, hashToken(challengeToken)),
            isNull(authOtpChallenges.consumedAt),
            isNotNull(authOtpChallenges.verifiedAt),
            gt(authOtpChallenges.expiresAt, now)
          )
        )
        .returning(publicChallengeColumns)
    )
  );

  return updated ?? null;
}

export async function consumeOtpLoginTicket(
  loginTicket: string,
  now = new Date(),
  expectedPurpose?: OtpPurpose | OtpPurpose[]
): Promise<OtpChallenge | null> {
  const purposePredicate =
    expectedPurpose === undefined
      ? undefined
      : Array.isArray(expectedPurpose)
        ? inArray(authOtpChallenges.purpose, expectedPurpose)
        : eq(authOtpChallenges.purpose, expectedPurpose);

  const consumed = getFirstRow(
    await withRetry(() =>
      db
        .update(authOtpChallenges)
        .set({
          consumedAt: now,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(authOtpChallenges.loginTicketHash, hashToken(loginTicket)),
            purposePredicate,
            isNull(authOtpChallenges.consumedAt),
            isNotNull(authOtpChallenges.verifiedAt),
            isNotNull(authOtpChallenges.loginTicketExpiresAt),
            gt(authOtpChallenges.loginTicketExpiresAt, now),
            gt(authOtpChallenges.expiresAt, now)
          )
        )
        .returning(publicChallengeColumns)
    )
  );

  return consumed ?? null;
}

export async function consumeOtpChallenge(
  challengeToken: string,
  now = new Date()
): Promise<OtpChallenge | null> {
  const consumed = getFirstRow(
    await withRetry(() =>
      db
        .update(authOtpChallenges)
        .set({
          consumedAt: now,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(authOtpChallenges.challengeTokenHash, hashToken(challengeToken)),
            isNull(authOtpChallenges.consumedAt),
            gt(authOtpChallenges.expiresAt, now)
          )
        )
        .returning(publicChallengeColumns)
    )
  );

  return consumed ?? null;
}

export async function pruneExpiredOtpChallenges(
  before = new Date()
): Promise<{ deleted: number }> {
  const deletedRows = await withRetry(() =>
    db
      .delete(authOtpChallenges)
      .where(lt(authOtpChallenges.expiresAt, before))
      .returning({ id: authOtpChallenges.id })
  );

  return { deleted: deletedRows.length };
}

export async function createAuthSecurityEvent(
  input: CreateAuthSecurityEventInput
): Promise<{ id: string }> {
  const created = requireFirstRow(
    await withRetry(() =>
      db
        .insert(authSecurityEvents)
        .values({
          eventType: input.eventType,
          identifierNormalized: input.identifierNormalized ?? null,
          identifierType: input.identifierType ?? null,
          ipHash: input.ipHash ?? null,
          metadata: input.metadata ?? null,
          userAgentHash: input.userAgentHash ?? null,
          userId: input.userId ?? null,
        })
        .returning({ id: authSecurityEvents.id })
    ),
    "Failed to create auth security event."
  );

  return created;
}

export async function listRecentOtpChallengesForIdentifier({
  identifierNormalized,
  limit = 10,
  purpose,
}: {
  identifierNormalized: string;
  limit?: number;
  purpose: OtpPurpose;
}): Promise<OtpChallenge[]> {
  return withRetry(() =>
    db
      .select(publicChallengeColumns)
      .from(authOtpChallenges)
      .where(
        and(
          eq(authOtpChallenges.identifierNormalized, identifierNormalized),
          eq(authOtpChallenges.purpose, purpose)
        )
      )
      .orderBy(desc(authOtpChallenges.createdAt))
      .limit(limit)
  );
}
