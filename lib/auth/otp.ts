import crypto from "crypto";

import { getTokenSecret } from "@/lib/security/token-secrets";

const OTP_CODE_MIN = 0;
const OTP_CODE_MAX_EXCLUSIVE = 1_000_000;
const MS_PER_MINUTE = 60 * 1000;

export const OTP_EXPIRES_IN_MINUTES = 5;
export const OTP_MAX_EXPIRES_IN_MINUTES = 10;
export const OTP_LOGIN_TICKET_EXPIRES_IN_MINUTES = 3;
export const OTP_REGISTRATION_TICKET_EXPIRES_IN_MINUTES = 5;
export const OTP_EXPIRED_MESSAGE = "This code has expired. Please request a new one.";

const getRequiredSecret = (
  envName: "AUTH_OTP_SECRET" | "AUTH_OTP_TOKEN_SECRET"
): string =>
  getTokenSecret(envName, {
    devFallbackEnvNames: ["NEXTAUTH_SECRET", "AUTH_SECRET", "PAYLOAD_SECRET"],
    purpose: "OTP authentication",
  });

const timingSafeEqualHex = (actualHex: string, expectedHex: string): boolean => {
  try {
    const actual = Buffer.from(actualHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

export function generateOtpCode(): string {
  return crypto
    .randomInt(OTP_CODE_MIN, OTP_CODE_MAX_EXCLUSIVE)
    .toString()
    .padStart(6, "0");
}

export function generateOtpToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getOtpChallengeExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_EXPIRES_IN_MINUTES * MS_PER_MINUTE);
}

export function getOtpMaxChallengeExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_MAX_EXPIRES_IN_MINUTES * MS_PER_MINUTE);
}

export function getOtpLoginTicketExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_LOGIN_TICKET_EXPIRES_IN_MINUTES * MS_PER_MINUTE);
}

export function getOtpRegistrationTicketExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_REGISTRATION_TICKET_EXPIRES_IN_MINUTES * MS_PER_MINUTE);
}

export function normalizeOtpEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeOtpPhone(phone: string): string {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("OTP phone identifiers must be normalized E.164 values.");
  }
  return normalized;
}

export function hashToken(token: string): string {
  return crypto
    .createHmac("sha256", getRequiredSecret("AUTH_OTP_TOKEN_SECRET"))
    .update(token)
    .digest("hex");
}

export function hashOtp({
  challengeToken,
  otp,
}: {
  challengeToken: string;
  otp: string;
}): string {
  return crypto
    .createHmac("sha256", getRequiredSecret("AUTH_OTP_SECRET"))
    .update(`${challengeToken}:${otp}`)
    .digest("hex");
}

export function verifyOtpHash({
  challengeToken,
  expectedHash,
  otp,
}: {
  challengeToken: string;
  expectedHash: string;
  otp: string;
}): boolean {
  const actualHash = hashOtp({ challengeToken, otp });
  return timingSafeEqualHex(actualHash, expectedHash);
}

export function hashIp(ip: null | string | undefined): string | null {
  const normalized = ip?.trim();
  if (!normalized) return null;
  return crypto
    .createHmac("sha256", getRequiredSecret("AUTH_OTP_TOKEN_SECRET"))
    .update(normalized)
    .digest("hex");
}

export function hashUserAgent(userAgent: null | string | undefined): string | null {
  const normalized = userAgent?.trim();
  if (!normalized) return null;
  return crypto
    .createHmac("sha256", getRequiredSecret("AUTH_OTP_TOKEN_SECRET"))
    .update(normalized)
    .digest("hex");
}
