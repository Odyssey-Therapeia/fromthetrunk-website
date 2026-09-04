import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TRYON_SESSION_COOKIE = "__Host-ftt-tryon-session";
export const TRYON_DEV_SESSION_COOKIE = "ftt-tryon-session-dev";
export const TRYON_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
export const TRYON_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const VERSION = "v1";
const CLOCK_SKEW_MS = 60_000;
const TOKEN_PATTERN =
  /^v1\.([1-9]\d{12})\.([1-9]\d{12})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

export type VerifiedTryonSession = {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type IssuedTryonSession = VerifiedTryonSession & { value: string };

export function tryonSessionCookieName(
  nodeEnv = process.env.NODE_ENV,
): string {
  return nodeEnv === "production"
    ? TRYON_SESSION_COOKIE
    : TRYON_DEV_SESSION_COOKIE;
}

export function tryonSessionCookieOptions(
  nodeEnv = process.env.NODE_ENV,
) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: TRYON_SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export function readTryonSessionCookie(
  request: Request,
  nodeEnv = process.env.NODE_ENV,
): string | undefined {
  const name = tryonSessionCookieName(nodeEnv);
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

export function serializeTryonSessionCookie(
  value: string,
  nodeEnv = process.env.NODE_ENV,
): string {
  const options = tryonSessionCookieOptions(nodeEnv);
  const attributes = [
    `${tryonSessionCookieName(nodeEnv)}=${value}`,
    `Max-Age=${options.maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function issueTryonSession(
  secret: string,
  currentValue?: unknown,
  now = Date.now(),
): IssuedTryonSession | null {
  if (!validSecret(secret) || !validNow(now)) return null;
  const current = verifyTryonSession(secret, currentValue, now);
  const issuedAt = current?.issuedAt ?? now;
  const nonce = current?.nonce ?? randomBytes(32).toString("base64url");
  const absoluteExpiry =
    issuedAt + TRYON_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1_000;
  const expiresAt = Math.min(
    now + TRYON_SESSION_MAX_AGE_SECONDS * 1_000,
    absoluteExpiry,
  );
  if (expiresAt <= now) return null;
  const payload = `${VERSION}.${issuedAt}.${expiresAt}.${nonce}`;
  return {
    value: `${payload}.${sign(payload, secret)}`,
    nonce,
    issuedAt,
    expiresAt,
  };
}

export function verifyTryonSession(
  secret: string,
  candidate: unknown,
  now = Date.now(),
): VerifiedTryonSession | null {
  if (!validSecret(secret) || !validNow(now) || typeof candidate !== "string") {
    return null;
  }
  const match = TOKEN_PATTERN.exec(candidate);
  if (!match) return null;
  const [, issuedText, expiresText, nonce, signature] = match;
  const issuedAt = Number(issuedText);
  const expiresAt = Number(expiresText);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    issuedAt > now + CLOCK_SKEW_MS ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt > issuedAt + TRYON_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1_000 ||
    expiresAt > now + TRYON_SESSION_MAX_AGE_SECONDS * 1_000 + CLOCK_SKEW_MS
  ) {
    return null;
  }
  const payload = `${VERSION}.${issuedAt}.${expiresAt}.${nonce}`;
  if (!safeEqual(signature, sign(payload, secret))) return null;
  return { nonce, issuedAt, expiresAt };
}

export function deriveTryonSessionTag(
  hmacSecret: string,
  nonce: string,
): string | null {
  if (!validSecret(hmacSecret) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    return null;
  }
  return createHmac("sha256", hmacSecret)
    .update("ftt-tryon-session-tag:v1\0")
    .update(nonce)
    .digest("base64url");
}

function validSecret(secret: string): boolean {
  const bytes = Buffer.byteLength(secret, "utf8");
  return bytes >= 32 && bytes <= 4_096;
}

function validNow(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("ftt-tryon-session-cookie:v1\0")
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
