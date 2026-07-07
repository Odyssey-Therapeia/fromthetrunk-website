"use client";

import {
  clearClientConsent,
  notifyConsentChanged,
} from "@/lib/analytics/consent";
import { getGtmId } from "@/lib/analytics/gtm";

/**
 * Footer "Cookie settings" control.
 *
 * Resets the stored analytics-consent decision so the consent banner reappears,
 * letting the visitor change their choice. Renders nothing when analytics is
 * not configured (`NEXT_PUBLIC_GTM_ID` unset), so there is no dead control.
 *
 * Note: if the visitor previously accepted and GTM already loaded this page,
 * switching to Reject takes full effect on the next page load (the already-
 * loaded GTM script is not torn down at runtime).
 */
export function CookieSettingsButton({
  className,
}: {
  className?: string;
}) {
  if (!getGtmId()) return null;

  return (
    <button
      type="button"
      onClick={() => {
        clearClientConsent();
        notifyConsentChanged();
      }}
      className={className}
    >
      Cookie settings
    </button>
  );
}
