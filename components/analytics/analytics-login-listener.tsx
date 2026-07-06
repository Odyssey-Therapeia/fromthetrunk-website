"use client";

/**
 * Invisible component that watches the NextAuth session. When a user signs in,
 * it calls posthog.identify(userId) so the previously-anonymous journey is
 * stitched to the known user id. No-op when logged out or PostHog disabled.
 */
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { isPosthogEnabled } from "@/lib/analytics/config";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics/consent";

function currentConsent(): "all" | "essential" {
  if (typeof document === "undefined") return "essential";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.split("=")[1]);
}

export function AnalyticsLoginListener() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!isPosthogEnabled()) return;
    if (currentConsent() !== "all") return;
    const userId = session.user?.id;
    if (!userId) return;
    try {
      posthog.identify(userId, {
        email: session.user?.email ?? undefined,
        name: session.user?.name ?? undefined,
      });
    } catch {
      /* posthog not ready yet — safe to ignore */
    }
  }, [status, session]);

  return null;
}
