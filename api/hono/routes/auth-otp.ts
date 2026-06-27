import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import {
  completeOtpRegistrationSchema,
  startOtpSchema,
  verifyOtpSchema,
} from "@/api/hono/schemas/auth-otp";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import {
  consumeOtpLoginTicket,
  createAuthSecurityEvent,
  createOtpChallenge,
  getOtpChallengeAuditByChallengeToken,
  getOtpChallengeByChallengeToken,
  incrementOtpChallengeAttempt,
  markOtpChallengeVerified,
  setOtpLoginTicket,
  type OtpIdentifierType,
  type OtpPurpose,
} from "@/db/queries/auth-otp";
import { getUserByEmail, getUserById } from "@/db/queries/users";
import { requireFirstRow } from "@/db/results";
import { addresses, users } from "@/db/schema";
import {
  generateOtpCode,
  generateOtpToken,
  getOtpChallengeExpiresAt,
  getOtpLoginTicketExpiresAt,
  getOtpRegistrationTicketExpiresAt,
  hashIp,
  hashToken,
  hashUserAgent,
  normalizeOtpEmail,
  normalizeOtpPhone,
  OTP_EXPIRED_MESSAGE,
  OTP_EXPIRES_IN_MINUTES,
  verifyOtpHash,
} from "@/lib/auth/otp";
import { sendEmail } from "@/lib/email/send";
import { otpEmail } from "@/lib/email/templates";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { timed } from "@/lib/perf/timed";

const OTP_RESEND_SECONDS = 60;
const OTP_GENERIC_MESSAGE = "If this email or account can continue, we’ve sent a code.";
const SUPPORT_EMAIL = "hello@fromthetrunk.shop";

const emailSchema = z.string().trim().email().max(320);

const addSeconds = (date: Date, seconds: number) =>
  new Date(date.getTime() + seconds * 1000);

const randomPasswordHash = () => crypto.randomBytes(32).toString("hex");

const getRequestIp = (request: Request) => {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
};

const detectIdentifier = (
  rawIdentifier: string
):
  | { identifierNormalized: string; identifierType: OtpIdentifierType }
  | null => {
  if (rawIdentifier.includes("@")) {
    const parsed = emailSchema.safeParse(rawIdentifier);
    if (!parsed.success) return null;
    return {
      identifierNormalized: normalizeOtpEmail(parsed.data),
      identifierType: "email",
    };
  }

  try {
    return {
      identifierNormalized: normalizeOtpPhone(rawIdentifier),
      identifierType: "phone",
    };
  } catch {
    return null;
  }
};

const maskEmail = (email: null | string | undefined): string | null => {
  if (!email) return null;
  const [localPart = "", domain = ""] = email.split("@");
  if (!localPart || !domain) return null;
  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}*`
      : `${localPart.slice(0, 2)}${"*".repeat(Math.min(5, localPart.length - 2))}`;
  return `${visibleLocal}@${domain}`;
};

const genericOtpResponse = ({
  challengeToken,
  expiresAt,
  maskedEmail,
  resendAvailableAt,
}: {
  challengeToken: string;
  expiresAt: Date;
  maskedEmail: null | string;
  resendAvailableAt: Date;
}) => ({
  challengeToken,
  expiresAt: expiresAt.toISOString(),
  maskedEmail,
  message: OTP_GENERIC_MESSAGE,
  ok: true,
  resendAvailableAt: resendAvailableAt.toISOString(),
});

const securityEvent = async (
  eventType: string,
  input: {
    identifierNormalized?: null | string;
    identifierType?: null | OtpIdentifierType;
    ipHash?: null | string;
    metadata?: Record<string, unknown> | null;
    userAgentHash?: null | string;
    userId?: null | string;
  }
) => {
  try {
    await createAuthSecurityEvent({
      eventType,
      identifierNormalized: input.identifierNormalized ?? null,
      identifierType: input.identifierType ?? null,
      ipHash: input.ipHash ?? null,
      metadata: input.metadata ?? null,
      userAgentHash: input.userAgentHash ?? null,
      userId: input.userId ?? null,
    });
  } catch {
    // Security-event writes must not expose or break the auth response path.
  }
};

const findUserByPhone = async (phone: string) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  return user ?? null;
};

const getExistingUser = async (
  identifierType: OtpIdentifierType,
  identifierNormalized: string
) => {
  if (identifierType === "email") return getUserByEmail(identifierNormalized);
  const user = await findUserByPhone(identifierNormalized);
  return user ? getUserById(user.id) : null;
};

const mergeMetadata = (
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
) => ({
  ...(existing ?? {}),
  ...patch,
});

type OtpUser = NonNullable<Awaited<ReturnType<typeof getUserByEmail>>>;

const isCheckoutShellUser = (user: OtpUser) =>
  !user.passwordHash &&
  (user.metadata as Record<string, unknown> | null)?.source === "checkout";

const accountAlreadyExistsResponse = () => ({
  code: "ACCOUNT_ALREADY_EXISTS",
  message: "This email is already registered. Please sign in instead.",
});

const upgradeCheckoutShellForOtp = async (user: OtpUser, now: Date) => {
  const upgraded = requireFirstRow(
    await db
      .update(users)
      .set({
        emailVerified: user.emailVerified ?? now,
        metadata: mergeMetadata(user.metadata, {
          authMethod: "email_otp",
          source: "otp_sign_in",
        }),
        passwordHash: randomPasswordHash(),
        updatedAt: now,
      })
      .where(and(eq(users.id, user.id), isNull(users.passwordHash)))
      .returning(),
    "Failed to upgrade checkout shell user."
  );

  return upgraded;
};

const createOrLoadEmailOtpCustomer = async (email: string, now: Date) => {
  const normalizedEmail = normalizeOtpEmail(email);
  const existing = await getUserByEmail(normalizedEmail);

  if (existing) {
    if (isCheckoutShellUser(existing)) {
      return upgradeCheckoutShellForOtp(existing, now);
    }
    return existing;
  }

  try {
    return requireFirstRow(
      await db
        .insert(users)
        .values({
          email: normalizedEmail,
          emailVerified: now,
          metadata: {
            authMethod: "email_otp",
            source: "otp_sign_in",
          },
          passwordHash: randomPasswordHash(),
          role: "customer",
          updatedAt: now,
        })
        .returning(),
      "Failed to create OTP sign-in user."
    );
  } catch (error) {
    const raced = await getUserByEmail(normalizedEmail);
    if (raced) return raced;
    throw error;
  }
};

export const registerAuthOtpRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/start",
      request: {
        body: {
          content: {
            "application/json": { schema: startOtpSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "OTP request accepted" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid OTP request",
        },
      },
      tags: ["Auth OTP"],
    }),
    async (c) => {
      const body = c.req.valid("json");
      const detected = detectIdentifier(body.identifier);
      const now = new Date();
      const expiresAt = getOtpChallengeExpiresAt(now);
      const resendAvailableAt = addSeconds(now, OTP_RESEND_SECONDS);
      const requestIpHash = hashIp(getRequestIp(c.req.raw));
      const userAgentHash = hashUserAgent(c.req.header("user-agent"));

      if (!detected || (body.purpose === "sign_up" && detected.identifierType !== "email")) {
        return c.json(
          {
            code: "INVALID_OTP_REQUEST",
            message: "Invalid OTP request.",
          },
          400
        );
      }

      const ratePrefix = `auth:otp:start:${body.purpose}:${detected.identifierType}:${hashToken(
        detected.identifierNormalized
      )}`;
      const rateLimited = await timed("auth.otp.start.rateLimit", () =>
        rateLimitResponse(c.req.raw, ratePrefix, {
          limit: 5,
          requireDurable: true,
          windowSeconds: 60,
        })
      );
      if (rateLimited) {
        await timed("auth.otp.start.securityEvent.rateLimited", () =>
          securityEvent("otp_rate_limited", {
            identifierNormalized: detected.identifierNormalized,
            identifierType: detected.identifierType,
            ipHash: requestIpHash,
            metadata: { action: "start", purpose: body.purpose },
            userAgentHash,
          })
        );
        return rateLimited;
      }

      await timed("auth.otp.start.securityEvent.requested", () =>
        securityEvent("otp_requested", {
          identifierNormalized: detected.identifierNormalized,
          identifierType: detected.identifierType,
          ipHash: requestIpHash,
          metadata: { purpose: body.purpose },
          userAgentHash,
        })
      );

      const existingUser = await timed(
        "auth.otp.start.userLookup",
        () =>
          getExistingUser(
            detected.identifierType,
            detected.identifierNormalized
          ),
      );
      const isSignUp = body.purpose === "sign_up";
      const shouldCreateChallenge =
        isSignUp || detected.identifierType === "email" || existingUser !== null;

      const challengeToken = generateOtpToken();
      const maskedDeliveryEmail = maskEmail(
        existingUser?.email ??
          (detected.identifierType === "email" ? detected.identifierNormalized : null)
      );

      if (!shouldCreateChallenge) {
        return c.json(
          genericOtpResponse({
            challengeToken,
            expiresAt,
            maskedEmail: maskedDeliveryEmail,
            resendAvailableAt,
          }),
          200
        );
      }

      const otp = generateOtpCode();
      const deliveryEmail =
        existingUser?.email ??
        (detected.identifierType === "email" ? detected.identifierNormalized : null);

      if (!deliveryEmail) {
        return c.json(
          genericOtpResponse({
            challengeToken,
            expiresAt,
            maskedEmail: null,
            resendAvailableAt,
          }),
          200
        );
      }

      const challenge = await timed("auth.otp.start.createChallenge", () =>
        createOtpChallenge({
          challengeToken,
          deliveryEmail,
          identifierNormalized: detected.identifierNormalized,
          identifierType: detected.identifierType,
          metadata: {
            deliverable:
              isSignUp || detected.identifierType === "email" || existingUser !== null,
          },
          otp,
          purpose: body.purpose,
          requestIpHash,
          resendAvailableAt,
          userAgentHash,
          userId: existingUser?.id ?? null,
        })
      );

      const shouldSend = isSignUp || detected.identifierType === "email" || existingUser !== null;
      if (shouldSend) {
        const emailTemplate = otpEmail({
          expiresInMinutes: OTP_EXPIRES_IN_MINUTES,
          otp,
          purpose: body.purpose,
          supportEmail: SUPPORT_EMAIL,
        });
        const sent = await timed("auth.otp.start.sendEmail", () =>
          sendEmail({
            html: emailTemplate.html,
            subject: emailTemplate.subject,
            to: deliveryEmail,
          })
        );
        if (sent) {
          await timed("auth.otp.start.securityEvent.sent", () =>
            securityEvent("otp_sent", {
              identifierNormalized: detected.identifierNormalized,
              identifierType: detected.identifierType,
              ipHash: requestIpHash,
              metadata: {
                challengeId: challenge.id,
                purpose: body.purpose,
              },
              userAgentHash,
              userId: existingUser?.id ?? null,
            })
          );
        }
      }

      return c.json(
        genericOtpResponse({
          challengeToken,
          expiresAt: challenge.expiresAt,
          maskedEmail: maskEmail(deliveryEmail),
          resendAvailableAt,
        }),
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/verify",
      request: {
        body: {
          content: {
            "application/json": { schema: verifyOtpSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "OTP verified" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid or expired OTP",
        },
      },
      tags: ["Auth OTP"],
    }),
    async (c) => {
      const body = c.req.valid("json");
      const now = new Date();
      const requestIpHash = hashIp(getRequestIp(c.req.raw));
      const userAgentHash = hashUserAgent(c.req.header("user-agent"));
      const challengeTokenHash = hashToken(body.challengeToken);

      const rateLimited = await timed(
        "auth.otp.verify.rateLimit",
        () =>
          rateLimitResponse(
            c.req.raw,
            `auth:otp:verify:${challengeTokenHash}`,
            {
              limit: 8,
              requireDurable: true,
              windowSeconds: 60,
            }
          )
      );
      if (rateLimited) {
        await timed("auth.otp.verify.securityEvent.rateLimited", () =>
          securityEvent("otp_rate_limited", {
            ipHash: requestIpHash,
            metadata: { action: "verify" },
            userAgentHash,
          })
        );
        return rateLimited;
      }

      const auditChallenge = await timed(
        "auth.otp.verify.auditChallenge",
        () => getOtpChallengeAuditByChallengeToken(body.challengeToken),
      );
      if (auditChallenge && auditChallenge.expiresAt.getTime() < now.getTime()) {
        await timed("auth.otp.verify.securityEvent.expired", () =>
          securityEvent("otp_verify_failed", {
            identifierNormalized: auditChallenge.identifierNormalized,
            identifierType: auditChallenge.identifierType as OtpIdentifierType,
            ipHash: requestIpHash,
            metadata: {
              challengeId: auditChallenge.id,
              reason: "expired",
            },
            userAgentHash,
            userId: auditChallenge.userId,
          })
        );
        return c.json(
          {
            code: "OTP_EXPIRED",
            message: OTP_EXPIRED_MESSAGE,
          },
          400
        );
      }

      const challenge = await timed(
        "auth.otp.verify.challengeLookup",
        () => getOtpChallengeByChallengeToken(body.challengeToken, now),
      );
      if (!challenge) {
        await timed("auth.otp.verify.securityEvent.missing", () =>
          securityEvent("otp_verify_failed", {
            ipHash: requestIpHash,
            metadata: { reason: "missing_or_inactive" },
            userAgentHash,
          })
        );
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_OTP",
            message: "Invalid or expired code.",
          },
          400
        );
      }

      const isValid = verifyOtpHash({
        challengeToken: body.challengeToken,
        expectedHash: challenge.otpHash,
        otp: body.otp,
      });

      if (!isValid) {
        const attempts = await timed(
          "auth.otp.verify.incrementAttempt",
          () => incrementOtpChallengeAttempt(body.challengeToken, now),
        );
        await timed("auth.otp.verify.securityEvent.invalidCode", () =>
          securityEvent("otp_verify_failed", {
            identifierNormalized: challenge.identifierNormalized,
            identifierType: challenge.identifierType as OtpIdentifierType,
            ipHash: requestIpHash,
            metadata: {
              attempts: attempts?.attempts ?? challenge.attempts,
              challengeId: challenge.id,
              reason: "invalid_code",
            },
            userAgentHash,
            userId: challenge.userId,
          })
        );
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_OTP",
            message: "Invalid or expired code.",
          },
          400
        );
      }

      const verified = await timed(
        "auth.otp.verify.markVerified",
        () => markOtpChallengeVerified(body.challengeToken, now),
      );
      if (!verified) {
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_OTP",
            message: "Invalid or expired code.",
          },
          400
        );
      }

      let loginUserId = verified.userId;
      if (verified.purpose !== "sign_up" && verified.identifierType === "email") {
        const otpUser = await timed(
          "auth.otp.verify.ensureEmailUser",
          () => createOrLoadEmailOtpCustomer(verified.identifierNormalized, now),
        );
        loginUserId = otpUser.id;

        if (!verified.userId) {
          await timed("auth.otp.verify.securityEvent.accountCreated", () =>
            securityEvent("otp_account_ready_from_sign_in", {
              identifierNormalized: verified.identifierNormalized,
              identifierType: "email",
              ipHash: requestIpHash,
              metadata: {
                challengeId: verified.id,
                source: "verified_email_sign_in",
              },
              userAgentHash,
              userId: otpUser.id,
            })
          );
        }
      }

      const ticket = generateOtpToken();
      const ticketExpiresAt =
        verified.purpose === "sign_up"
          ? getOtpRegistrationTicketExpiresAt(now)
          : getOtpLoginTicketExpiresAt(now);
      const ticketed = await timed(
        "auth.otp.verify.setTicket",
        () =>
          setOtpLoginTicket(
            body.challengeToken,
            ticket,
            now,
            ticketExpiresAt,
            loginUserId
          ),
      );
      if (!ticketed) {
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_OTP",
            message: "Invalid or expired code.",
          },
          400
        );
      }

      await timed("auth.otp.verify.securityEvent.verified", () =>
        securityEvent("otp_verified", {
          identifierNormalized: verified.identifierNormalized,
          identifierType: verified.identifierType as OtpIdentifierType,
          ipHash: requestIpHash,
          metadata: {
            challengeId: verified.id,
            purpose: verified.purpose,
          },
          userAgentHash,
          userId: loginUserId,
        })
      );

      return c.json(
        {
          mode: verified.purpose === "sign_up" ? "sign_up" : "sign_in",
          ok: true,
          ticket,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/register/complete",
      request: {
        body: {
          content: {
            "application/json": { schema: completeOtpRegistrationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "OTP registration completed" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid registration token",
        },
      },
      tags: ["Auth OTP"],
    }),
    async (c) => {
      const body = c.req.valid("json");
      const now = new Date();
      const requestIpHash = hashIp(getRequestIp(c.req.raw));
      const userAgentHash = hashUserAgent(c.req.header("user-agent"));
      const registrationTokenHash = hashToken(body.registrationToken);

      const rateLimited = await rateLimitResponse(
        c.req.raw,
        `auth:otp:complete:${registrationTokenHash}`,
        {
          limit: 5,
          requireDurable: true,
          windowSeconds: 60,
        }
      );
      if (rateLimited) {
        await securityEvent("otp_rate_limited", {
          ipHash: requestIpHash,
          metadata: { action: "complete" },
          userAgentHash,
        });
        return rateLimited;
      }

      const registrationChallenge = await consumeOtpLoginTicket(
        body.registrationToken,
        now,
        "sign_up"
      );
      if (!registrationChallenge) {
        return c.json(
          {
            code: "INVALID_REGISTRATION_TOKEN",
            message: "Invalid or expired registration token.",
          },
          400
        );
      }

      await securityEvent("otp_consumed", {
        identifierNormalized: registrationChallenge.identifierNormalized,
        identifierType: registrationChallenge.identifierType as OtpIdentifierType,
        ipHash: requestIpHash,
        metadata: {
          challengeId: registrationChallenge.id,
          purpose: registrationChallenge.purpose,
        },
        userAgentHash,
        userId: registrationChallenge.userId,
      });

      const email = registrationChallenge.deliveryEmail.toLowerCase();
      const existing =
        registrationChallenge.userId
          ? await getUserById(registrationChallenge.userId)
          : await getUserByEmail(email);
      const metadataPatch = { authMethod: "email_otp" };

      if (existing && !isCheckoutShellUser(existing)) {
        await securityEvent("otp_register_existing_account_rejected", {
          identifierNormalized: email,
          identifierType: "email",
          ipHash: requestIpHash,
          metadata: {
            reason: "existing_real_account",
            role: existing.role,
          },
          userAgentHash,
          userId: existing.id,
        });
        return c.json(accountAlreadyExistsResponse(), 409);
      }

      const user = existing
        ? (
            await db
              .update(users)
              .set({
                metadata: mergeMetadata(existing.metadata, metadataPatch),
                name: body.fullName,
                passwordHash: randomPasswordHash(),
                phone: body.phone,
                role: "customer",
                updatedAt: new Date(),
              })
              .where(and(eq(users.id, existing.id), isNull(users.passwordHash)))
              .returning()
          )[0]
        : requireFirstRow(
            await db
              .insert(users)
              .values({
                email,
                metadata: metadataPatch,
                name: body.fullName,
                passwordHash: randomPasswordHash(),
                phone: body.phone,
                role: "customer",
                updatedAt: new Date(),
              })
              .returning(),
            "Failed to create OTP user."
          );

      if (!user) {
        await securityEvent("otp_register_existing_account_rejected", {
          identifierNormalized: email,
          identifierType: "email",
          ipHash: requestIpHash,
          metadata: {
            reason: "checkout_shell_claim_lost",
          },
          userAgentHash,
          userId: existing?.id ?? null,
        });
        return c.json(accountAlreadyExistsResponse(), 409);
      }

      if (body.address) {
        const createdAddress = requireFirstRow(
          await db
            .insert(addresses)
            .values({
              city: body.address.city,
              country: body.address.country,
              isDefault: body.address.isDefault ?? true,
              label: body.address.label,
              line1: body.address.line1,
              line2: body.address.line2 ?? "",
              name: body.address.name,
              phone: body.address.phone,
              postalCode: body.address.postalCode,
              state: body.address.state,
              userId: user.id,
            })
            .returning(),
          "Failed to create OTP registration address."
        );

        if (createdAddress.isDefault) {
          await db
            .update(addresses)
            .set({
              isDefault: false,
              updatedAt: new Date(),
            })
            .where(and(eq(addresses.userId, user.id), ne(addresses.id, createdAddress.id)));

          await db
            .update(users)
            .set({
              defaultAddressId: createdAddress.id,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
        }
      }

      const loginTicket = generateOtpToken();
      const loginChallengeToken = generateOtpToken();
      const internalOtp = generateOtpCode();
	      await createOtpChallenge({
	        challengeToken: loginChallengeToken,
	        deliveryEmail: email,
	        identifierNormalized: email,
        identifierType: "email",
        metadata: {
          source: "otp_registration_complete_login_ticket",
        },
        otp: internalOtp,
        purpose: "sign_in",
        requestIpHash,
        resendAvailableAt: now,
        userAgentHash,
        userId: user.id,
	      });
	      await markOtpChallengeVerified(loginChallengeToken, now);
	      await setOtpLoginTicket(
	        loginChallengeToken,
	        loginTicket,
	        now,
	        getOtpLoginTicketExpiresAt(now)
	      );

      await securityEvent("otp_register_completed", {
        identifierNormalized: email,
        identifierType: "email",
        ipHash: requestIpHash,
        metadata: {
          registrationChallengeId: registrationChallenge.id,
        },
        userAgentHash,
        userId: user.id,
      });

      return c.json({ loginTicket, ok: true }, 200);
    }
  );
};
