import {
  getRateLimiter,
  isDurableRateLimiterConfigured,
  type RateLimiterPort,
} from "@/lib/ports/rate-limiter";

export const TRYON_RATE_LIMITS = Object.freeze({
  sessionTenMinutes: { limit: 3, windowSeconds: 10 * 60 },
  sessionDay: { limit: 8, windowSeconds: 24 * 60 * 60 },
  ipTenMinutes: { limit: 6, windowSeconds: 10 * 60 },
  globalHour: { limit: 30, windowSeconds: 60 * 60 },
});

export type TryonRateAdmission =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

export function tryonRateLimitsReady(
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" || isDurableRateLimiterConfigured();
}

export async function checkTryonRateAdmission(
  sessionTag: string,
  ipTag: string,
  limiter: RateLimiterPort = getRateLimiter(),
  now = Date.now(),
): Promise<TryonRateAdmission> {
  const [shortSession, dailySession, ip] = await Promise.all([
    limiter.check(`ftt:tryon:v1:rate:session:10m:${sessionTag}`, {
      ...TRYON_RATE_LIMITS.sessionTenMinutes,
    }),
    limiter.check(`ftt:tryon:v1:rate:session:24h:${sessionTag}`, {
      ...TRYON_RATE_LIMITS.sessionDay,
    }),
    limiter.check(`ftt:tryon:v1:rate:ip:10m:${ipTag}`, {
      ...TRYON_RATE_LIMITS.ipTenMinutes,
    }),
  ]);
  const rejected = [shortSession, dailySession, ip].filter(
    (result) => !result.success,
  );
  if (rejected.length > 0) {
    const resetAt = Math.max(...rejected.map((result) => result.resetAt));
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
    };
  }

  const global = await limiter.check("ftt:tryon:v1:rate:global:1h", {
    ...TRYON_RATE_LIMITS.globalHour,
  });
  if (global.success) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((global.resetAt - now) / 1_000)),
  };
}
