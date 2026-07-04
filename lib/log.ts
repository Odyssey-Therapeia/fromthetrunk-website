/**
 * P2-09: Structured server-side logger.
 *
 * Usage:
 *   import { createLogger } from "@/lib/log";
 *   const log = createLogger("analytics:emit");
 *   log.error("Sink failed", { err, sinkName: "ga4" });
 *
 * Output format:
 *   - production (NODE_ENV === "production"): one JSON object per line
 *     { level, namespace, msg, ...meta, time }
 *   - development/test: human-readable text with namespace prefix
 *
 * Level filtering:
 *   Set LOG_LEVEL env var to "debug" | "info" | "warn" | "error" (default: "info").
 *   "debug" shows all; "error" shows only errors.
 *
 * Safety:
 *   All methods are wrapped in try/catch — the logger NEVER throws.
 *   Safe to use inside fire-and-forget paths.
 *
 * P6-07: error() also forwards to the error-tracker port (env-gated, never throws).
 */
import { getErrorTracker } from "@/lib/ports/error-tracker";

type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const REDACTED = "[redacted]";
const REDACTED_SQL_PARAMS = "[redacted-sql-params]";

function getMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "params" ||
    normalized === "body" ||
    normalized === "requestbody" ||
    normalized === "rawbody" ||
    normalized === "email" ||
    normalized.endsWith("email") ||
    normalized === "phone" ||
    normalized.endsWith("phone") ||
    normalized === "address" ||
    normalized.includes("addressline") ||
    normalized === "line1" ||
    normalized === "line2" ||
    normalized === "postalcode" ||
    normalized === "postcode" ||
    normalized === "otp" ||
    normalized.endsWith("otp") ||
    normalized.includes("challengetoken") ||
    normalized.includes("loginticket") ||
    normalized.includes("registrationtoken") ||
    normalized.includes("razorpay") ||
    normalized.includes("apikey") ||
    normalized.includes("apisecret") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.endsWith("token")
  );
}

function redactString(value: string): string {
  return value
    .replace(/params:\s*[\s\S]*$/i, `params: ${REDACTED_SQL_PARAMS}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?[1-9][\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(
      /(authorization|cookie|otp|challengeToken|loginTicket|registrationToken|token|razorpay[^:=\s]*|api[_-]?secret|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi,
      "$1=[redacted]"
    );
}

export function redactErrorForLog(error: Error): Error {
  const redacted = new Error(redactString(error.message));
  redacted.name = error.name;
  if (error.stack) redacted.stack = redactString(error.stack);
  return redacted;
}

export function redactForLog(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (key && isSensitiveLogKey(key)) return REDACTED;

  if (value instanceof Error) {
    return {
      message: redactString(value.message),
      name: value.name,
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, "", seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = redactForLog(entryValue, entryKey, seen);
  }
  return redacted;
}

function serializeValue(value: unknown): unknown {
  return redactForLog(value);
}

function toLogMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  return redactForLog(meta) as Record<string, unknown>;
}

function toSafeJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(redactForLog(obj), (_key, value: unknown) => serializeValue(value));
  } catch {
    // Fallback for circular references or other non-serializable values
    try {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        try {
          JSON.stringify(v);
          safe[k] = serializeValue(v);
        } catch {
          safe[k] = "[unserializable]";
        }
      }
      return JSON.stringify(safe);
    } catch {
      return JSON.stringify({ _serializationError: true });
    }
  }
}

function writeJson(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    level,
    namespace,
    msg,
    ...toLogMeta(meta),
    time: new Date().toISOString(),
  };
  process.stdout.write(toSafeJson(entry) + "\n");
}

function writeHuman(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  const prefix = `[${level.toUpperCase()}] [${namespace}]`;
  const safeMeta = toLogMeta(meta);
  const metaPart = safeMeta && Object.keys(safeMeta).length > 0
    ? ` ${JSON.stringify(safeMeta, (_key, value: unknown) => serializeValue(value))}`
    : "";
  process.stdout.write(`${prefix} ${msg}${metaPart}\n`);
}

function log(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  try {
    const minLevel = getMinLevel();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    if (isProduction()) {
      writeJson(level, namespace, msg, meta);
    } else {
      writeHuman(level, namespace, msg, meta);
    }
  } catch {
    // Never throw — swallow any logging failure silently
  }
}

/**
 * Creates a namespaced logger instance.
 *
 * @param namespace - identifies the calling module, e.g. "analytics:emit"
 * @returns Logger with debug / info / warn / error methods
 */
export function createLogger(namespace: string): Logger {
  return {
    debug(msg: string, meta?: Record<string, unknown>): void {
      log("debug", namespace, msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>): void {
      log("info", namespace, msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>): void {
      log("warn", namespace, msg, meta);
    },
    error(msg: string, meta?: Record<string, unknown>): void {
      log("error", namespace, msg, meta);
      // P6-07: forward to error-tracker port (env-gated, never throws).
      // Extract the first Error object from meta if present (typically meta.err).
	      try {
	        const tracker = getErrorTracker();
	        const errValue = meta?.err instanceof Error ? meta.err : undefined;
	        tracker.capture(errValue ? redactErrorForLog(errValue) : new Error(redactString(msg)), {
	          namespace,
	          msg: redactString(msg),
	          ...toLogMeta(meta),
	        });
	      } catch {
        // Never throw from the logging path
      }
    },
  };
}
