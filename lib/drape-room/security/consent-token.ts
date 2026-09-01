import { createHmac, timingSafeEqual } from "node:crypto";

export const TRYON_CONSENT_TOKEN_HEADER = "X-FTT-Tryon-Consent-Token";
export const TRYON_CONSENT_TOKEN_TTL_MS = 5 * 60 * 1_000;

const VERSION = "v1";
const CLOCK_SKEW_MS = 60_000;
const TOKEN_LENGTH = 74;
const TOKEN_PATTERN =
  /^v1\.([1-9]\d{12})\.([1-9]\d{12})\.([A-Za-z0-9_-]{43})$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;
const MAX_IDENTITY_VALUE_BYTES = 2_048;
const MAX_IDENTITY_BYTES = 8_192;

export type TryonConsentIdentity = {
  provider: string;
  model: string;
  disclosureVersion: string;
  privacyPolicyVersion: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
  disclosure: {
    providerDisplayName: string;
    policyUrl: string;
    retentionSummary: string;
    disclosureVersion: string;
  };
};

export type TryonConsentTokenRejectionReason =
  | "missing"
  | "malformed"
  | "invalid_verification_context"
  | "invalid_lifetime"
  | "not_yet_valid"
  | "expired"
  | "signature_mismatch";

export type TryonConsentTokenVerification =
  | { valid: true }
  | { valid: false; reason: TryonConsentTokenRejectionReason };

/** Issues an opaque token bound to one signed browser session and config. */
export function issueTryonConsentToken(
  config: TryonConsentIdentity,
  hmacSecret: string,
  sessionNonce: string,
  now = Date.now(),
): string | null {
  const expiresAt = now + TRYON_CONSENT_TOKEN_TTL_MS;
  if (
    !validTimestamp(now) ||
    !validTimestamp(expiresAt) ||
    !validSecret(hmacSecret) ||
    !NONCE_PATTERN.test(sessionNonce) ||
    !serializeIdentity(config)
  ) {
    return null;
  }
  const signature = sign(config, hmacSecret, sessionNonce, now, expiresAt);
  if (!signature) return null;
  return `${VERSION}.${now}.${expiresAt}.${signature}`;
}

/** Strictly parses and verifies a token against the current session and config. */
export function verifyTryonConsentToken(
  config: TryonConsentIdentity,
  hmacSecret: string,
  sessionNonce: string,
  candidate: unknown,
  now = Date.now(),
): boolean {
  return inspectTryonConsentToken(
    config,
    hmacSecret,
    sessionNonce,
    candidate,
    now,
  ).valid;
}

/** Returns only a bounded diagnostic reason; it never exposes token material. */
export function inspectTryonConsentToken(
  config: TryonConsentIdentity,
  hmacSecret: string,
  sessionNonce: string,
  candidate: unknown,
  now = Date.now(),
): TryonConsentTokenVerification {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return { valid: false, reason: "missing" };
  }
  if (candidate.length !== TOKEN_LENGTH) {
    return { valid: false, reason: "malformed" };
  }
  if (
    !validTimestamp(now) ||
    !validSecret(hmacSecret) ||
    !NONCE_PATTERN.test(sessionNonce)
  ) {
    return { valid: false, reason: "invalid_verification_context" };
  }
  const match = TOKEN_PATTERN.exec(candidate);
  if (!match) return { valid: false, reason: "malformed" };
  const issuedAt = Number(match[1]);
  const expiresAt = Number(match[2]);
  const signature = match[3];
  if (
    !validTimestamp(issuedAt) ||
    !validTimestamp(expiresAt) ||
    expiresAt !== issuedAt + TRYON_CONSENT_TOKEN_TTL_MS
  ) {
    return { valid: false, reason: "invalid_lifetime" };
  }
  if (issuedAt > now + CLOCK_SKEW_MS) {
    return { valid: false, reason: "not_yet_valid" };
  }
  if (expiresAt <= now) return { valid: false, reason: "expired" };
  const expected = sign(
    config,
    hmacSecret,
    sessionNonce,
    issuedAt,
    expiresAt,
  );
  if (!expected) {
    return { valid: false, reason: "invalid_verification_context" };
  }
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ? { valid: true }
    : { valid: false, reason: "signature_mismatch" };
}

function sign(
  config: TryonConsentIdentity,
  hmacSecret: string,
  sessionNonce: string,
  issuedAt: number,
  expiresAt: number,
): string | null {
  const identity = serializeIdentity(config);
  if (!identity) return null;
  return createHmac("sha256", hmacSecret)
    .update("ftt-tryon-consent-token:v1\0")
    .update(String(issuedAt))
    .update("\0")
    .update(String(expiresAt))
    .update("\0")
    .update(sessionNonce)
    .update("\0")
    .update(identity)
    .digest("base64url");
}

function serializeIdentity(config: TryonConsentIdentity): string | null {
  const values = [
    config.provider,
    config.model,
    config.disclosureVersion,
    config.privacyPolicyVersion,
    config.promptVersion,
    config.engineVersion,
    config.outputVersion,
    config.disclosure.providerDisplayName,
    config.disclosure.policyUrl,
    config.disclosure.retentionSummary,
    config.disclosure.disclosureVersion,
  ];
  if (
    values.some(
      (value) =>
        typeof value !== "string" ||
        value.length === 0 ||
        Buffer.byteLength(value, "utf8") > MAX_IDENTITY_VALUE_BYTES,
    )
  ) {
    return null;
  }
  const serialized = JSON.stringify(values);
  return Buffer.byteLength(serialized, "utf8") <= MAX_IDENTITY_BYTES
    ? serialized
    : null;
}

function validSecret(secret: string): boolean {
  if (typeof secret !== "string") return false;
  const bytes = Buffer.byteLength(secret, "utf8");
  return bytes >= MIN_SECRET_BYTES && bytes <= MAX_SECRET_BYTES;
}

function validTimestamp(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= 1_000_000_000_000 && value <= 9_999_999_999_999
  );
}
