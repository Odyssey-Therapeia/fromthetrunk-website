"use client";

import {
  clearClientConsent,
  notifyConsentChanged,
} from "@/lib/analytics/consent";
import { getGtmId } from "@/lib/analytics/gtm";
import { getMetaPixelId } from "@/lib/analytics/meta-pixel";

/**
 * Footer "Cookie settings" control.
 *
 * Clears every stored decision — analytics, advertising, and the notice version
 * — so the consent banner reappears and the visitor can choose again. This is
 * the visitor's own withdrawal route: stopping optional tracking never requires
 * emailing us.
 *
 * Renders when EITHER tag is configured, so the control is never dead and never
 * missing: with only the Meta Pixel configured there would otherwise be no way
 * to withdraw advertising consent from the page.
 *
 * Note: clearing returns every category to "unknown", which stops future
 * tracking. The Meta Pixel is additionally told to stop at runtime — see
 * `MetaPixelLoader`'s effect cleanup — while an already-loaded GTM script is
 * not torn down until the next page load.
 */
export function CookieSettingsButton({
  className,
}: {
  className?: string;
}) {
  if (!getGtmId() && !getMetaPixelId()) return null;

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
