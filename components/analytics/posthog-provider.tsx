"use client";

/**
 * PostHog React provider. Activates only when:
 *   1. NEXT_PUBLIC_POSTHOG_KEY is set, AND
 *   2. The user has consented to "all" cookies (ftt_consent cookie).
 *
 * Listens for the `ftt:consent-change` custom event so accepting the banner
 * mid-session immediately starts capture (no reload needed).
 *
 * On consent revoke, capture is opted-out.
 */
import { useEffect, useState } from "react";
import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { analyticsConfig, isPosthogEnabled } from "@/lib/analytics/config";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics/consent";

function currentConsent(): "all" | "essential" {
  if (typeof document === "undefined") return "essential";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.split("=")[1]);
}

export function FttPostHogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isPosthogEnabled()) return;

    const evaluate = () => {
      const ok = currentConsent() === "all";
      setActive(ok);
      if (ok) {
        if (!posthog._isIdentified) {
          posthog.init(analyticsConfig.posthog.key, {
            api_host: analyticsConfig.posthog.host,
            person_profiles: "identified_only",
            persistence: "localStorage+cookie",
            autocapture: false, // we emit explicit events; avoid noisy auto-capture
            disable_session_recording: false,
          });
        }
      } else {
        posthog.opt_out_capturing();
      }
    };

    evaluate();
    window.addEventListener("ftt:consent-change", evaluate);
    return () => window.removeEventListener("ftt:consent-change", evaluate);
  }, []);

  if (!isPosthogEnabled() || !active) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
