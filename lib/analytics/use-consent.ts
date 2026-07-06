"use client";

/**
 * Client-side consent hook. Reads/writes the ftt_consent cookie and exposes
 * the current state + a setter that re-renders all consumers.
 *
 * Default before choice: "essential" (opt-in). Only once the user accepts do
 * PostHog + GA4 activate.
 */
import { useCallback, useState } from "react";
import {
  CONSENT_COOKIE,
  parseConsent,
  type ConsentValue,
} from "@/lib/analytics/consent";

function readCookieOnce(): { consent: ConsentValue; hasChosen: boolean } {
  if (typeof document === "undefined") {
    return { consent: "essential", hasChosen: false };
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return {
    consent: parseConsent(match?.split("=")[1]),
    hasChosen: document.cookie.includes(`${CONSENT_COOKIE}=`),
  };
}

function writeCookie(value: ConsentValue): void {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${CONSENT_COOKIE}=${value}; max-age=${maxAge}; path=/; SameSite=Lax${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function useConsent() {
  const [state, setState] = useState(readCookieOnce);

  const setConsent = useCallback((value: ConsentValue) => {
    writeCookie(value);
    setState({ consent: value, hasChosen: true });
    // Notify the rest of the app (e.g. PostHog provider) to (de)activate.
    window.dispatchEvent(new CustomEvent("ftt:consent-change", { detail: value }));
  }, []);

  return { consent: state.consent, hasChosen: state.hasChosen, setConsent };
}
