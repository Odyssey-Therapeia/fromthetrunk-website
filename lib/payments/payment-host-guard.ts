/**
 * Payment reliability: block LIVE Razorpay payments on unsafe hosts.
 *
 * Razorpay test-vs-live is implicit in the key prefix (`rzp_test_` / `rzp_live_`).
 * With live keys, a checkout served from a Vercel preview / `*.vercel.app` /
 * localhost host would take real money against a non-production origin (and embed
 * that origin into the payment callback). This guard rejects live-mode payments
 * on those known-unsafe hosts while leaving test-mode payments (and real custom
 * production domains) untouched.
 *
 * Design: a targeted BLOCKLIST (vercel.app / localhost), not an allowlist — so it
 * never breaks live checkout on the real custom domain even if env vars drift.
 * An explicit `ALLOW_UNSAFE_LIVE_PAYMENTS=true` escape hatch is honoured for the
 * "unless explicitly approved" case. No secret values are read or logged.
 */

const LIVE_KEY_PREFIX = "rzp_live_";

export function isLiveRazorpayKey(keyId: string | null | undefined): boolean {
  return Boolean(keyId?.startsWith(LIVE_KEY_PREFIX));
}

/** True when the configured Razorpay key is a LIVE key. */
export function isLiveRazorpayMode(): boolean {
  return (
    isLiveRazorpayKey(process.env.RAZORPAY_KEY_ID) ||
    isLiveRazorpayKey(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID)
  );
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

/** Hosts on which LIVE payments are never allowed. */
export function isUnsafeLiveHost(host: string): boolean {
  const bare = normalizeHost(host);
  return (
    bare.endsWith(".vercel.app") ||
    bare === "vercel.app" ||
    bare === "localhost" ||
    bare === "127.0.0.1" ||
    bare === "0.0.0.0" ||
    bare.endsWith(".local")
  );
}

export type HostGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Evaluates whether payments may proceed for the request URL.
 * - Test mode: always allowed (test keys are safe everywhere).
 * - Live mode: blocked on `*.vercel.app` / localhost unless explicitly overridden.
 */
export function evaluatePaymentHost(requestUrl: string): HostGuardResult {
  if (!isLiveRazorpayMode()) return { allowed: true };

  if (process.env.ALLOW_UNSAFE_LIVE_PAYMENTS === "true") {
    return { allowed: true };
  }

  let host: string;
  try {
    host = new URL(requestUrl).host;
  } catch {
    return { allowed: false, reason: "INVALID_REQUEST_HOST" };
  }

  if (isUnsafeLiveHost(host)) {
    return { allowed: false, reason: "LIVE_PAYMENT_ON_UNSAFE_HOST" };
  }

  return { allowed: true };
}
