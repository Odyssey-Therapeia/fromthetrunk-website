/**
 * Analytics identity layer — first-party cookies.
 *
 * Two cookies power user-journey analytics:
 *   - ftt_sid: session id (rolls on 30 min inactivity)
 *   - ftt_uid: anonymous visitor id (persistent, 1 year)
 *
 * Both are first-party (no third-party domain), Secure, SameSite=Lax. They are
 * ALWAYS considered "essential" — they do not require consent because they are
 * first-party pseudonymous identifiers, not cross-site tracking. Consent gates
 * whether we EMIT events (PostHog/GA4), not whether we hold the cookie.
 *
 * NOTE: cookies are WRITTEN in proxy.ts (Next.js only allows cookies().set()
 * in middleware/proxy, Server Actions, or Route Handlers — not in Server
 * Components). This module provides the shared constants + read-side helpers.
 */
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ftt_sid";
export const VISITOR_COOKIE = "ftt_uid";

/**
 * Read-only identity from the request (for route handlers and server
 * components). Returns empty strings when the cookies are absent — callers
 * should treat that as "anonymous". Does NOT extend the session.
 */
export async function readAnalyticsIdentity(): Promise<{
  sessionId: string;
  visitorId: string;
}> {
  const store = await cookies();
  return {
    sessionId: store.get(SESSION_COOKIE)?.value ?? "",
    visitorId: store.get(VISITOR_COOKIE)?.value ?? "",
  };
}
