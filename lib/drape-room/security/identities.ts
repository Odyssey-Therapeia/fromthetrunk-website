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
  // Vercel overwrites both headers at the trusted platform edge. Production
  // prefers the documented Vercel chain and permits x-real-ip only as the
  // platform fallback. Generic XFF is accepted solely for local/test proxies.
  const vercelForwarded = normalizeIp(
    request.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0],
  );
  const realIp = normalizeIp(request.headers.get("x-real-ip"));
  const localForwarded =
    nodeEnv === "production"
      ? null
      : normalizeIp(request.headers.get("x-forwarded-for")?.split(",", 1)[0]);
  const ip =
    nodeEnv === "production"
      ? vercelForwarded ?? realIp
      : realIp ?? localForwarded;
  return ip ? hmac(secret, "ftt-tryon-ip:v1", ip) : null;
}

function normalizeIp(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 64 || /[\s\0]/.test(candidate)) return null;
  // Accept only IP-literal characters and never store the literal itself.
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
