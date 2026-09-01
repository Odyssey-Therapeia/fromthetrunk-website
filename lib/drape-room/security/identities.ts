import { createHmac } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTryonIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function deriveTryonIdempotencyHash(
  hmacSecret: string,
  sessionTag: string,
  idempotencyKey: string,
): string | null {
  if (!validSecret(hmacSecret) || !isTryonIdempotencyKey(idempotencyKey)) {
    return null;
  }
  return hmac(hmacSecret, "ftt-tryon-idempotency:v1", `${sessionTag}\0${idempotencyKey}`);
}

export function deriveTryonIpTag(
  request: Request,
  secret: string,
  nodeEnv = process.env.NODE_ENV,
): string | null {
  if (!validSecret(secret)) return null;
  const direct = normalizeIp(request.headers.get("x-real-ip"));
  const fallback =
    nodeEnv === "production"
      ? null
      : normalizeIp(request.headers.get("x-forwarded-for")?.split(",", 1)[0]);
  const ip = direct ?? fallback;
  return ip ? hmac(secret, "ftt-tryon-ip:v1", ip) : null;
}

function normalizeIp(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 64 || /[\s\0]/.test(candidate)) return null;
  // Vercel supplies a canonical x-real-ip. This admission guard deliberately
  // accepts only IP-literal characters and never stores the literal itself.
  return /^[0-9a-f:.]+$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function validSecret(secret: string): boolean {
  return Buffer.byteLength(secret, "utf8") >= 32;
}

function hmac(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret)
    .update(`${domain}\0`)
    .update(value)
    .digest("base64url");
}

