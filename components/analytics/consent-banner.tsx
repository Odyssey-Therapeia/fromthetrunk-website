"use client";

import Link from "next/link";
import { useId, useState } from "react";

import type { ConsentBannerVariant } from "@/components/analytics/use-consent-banner-variant";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Minimal, NON-MODAL cookie consent banner.
 *
 * Shown only when no decision has been stored under the current notice version.
 * No optional tag loads until the visitor accepts: Google Analytics (through
 * Google Tag Manager) needs the analytics choice, the Meta Pixel needs the
 * advertising choice, and the two are independent.
 *
 * "Manage preferences" expands an inline panel with one switch per category.
 * Nothing is preselected — both switches start OFF, whatever the visitor chose
 * before, so saving can never grant a permission by inertia.
 *
 * Section-aware theming ONLY (no behavior change): `variant="hero"` renders the
 * light/ivory style so it reads well over the hero; `variant="default"` renders
 * a burgundy card so it never blends into ivory/light content sections.
 *
 * Non-blocking by design (must never trap the intro's "Skip Intro" button or
 * page clicks):
 *   - The fixed wrapper is `pointer-events-none` so clicks pass THROUGH it.
 *   - Only the card is `pointer-events-auto`, so just the card captures clicks.
 *   - No `role="dialog"`, no backdrop, no focus trap — this is a passive region.
 *   - `z-40` sits BELOW the intro overlay (`z-100`), so it can never overlap or
 *     block the Skip Intro button; it becomes visible once the intro reveals.
 */

const VARIANT_STYLES: Record<
  ConsentBannerVariant,
  {
    card: string;
    text: string;
    link: string;
    secondary: string;
    primary: string;
    panel: string;
    tertiary: string;
  }
> = {
  hero: {
    card: "border-[#B39152]/25 bg-[#FFFCF8]",
    text: "text-[#601D1C]/80",
    link: "text-[#601D1C] hover:text-[#B39152]",
    secondary:
      "border-[#601D1C]/20 bg-[#FDF7F1] text-[#601D1C] hover:bg-[#FDF7F1]/70",
    primary: "border-transparent bg-[#601D1C] text-[#FDF7F1] hover:bg-[#4A1614]",
    panel: "border-[#601D1C]/15 bg-[#FDF7F1]/70",
    tertiary: "text-[#601D1C] hover:text-[#B39152]",
  },
  default: {
    card: "border-[#B39152]/45 bg-[#601D1C]",
    text: "text-[#FDF7F1]/90",
    link: "text-[#E5C983] hover:text-[#FDF7F1]",
    secondary:
      "border-transparent bg-[#FDF7F1] text-[#601D1C] hover:bg-[#FDF7F1]/85",
    primary: "border-transparent bg-[#B39152] text-[#0E0D0E] hover:bg-[#C8A45F]",
    panel: "border-[#FDF7F1]/20 bg-[#4A1614]/40",
    tertiary: "text-[#E5C983] hover:text-[#FDF7F1]",
  },
};

export type ConsentSelection = {
  advertising: boolean;
  analytics: boolean;
};

export function ConsentBanner({
  variant = "default",
  onAccept,
  onDecline,
  onSave,
}: {
  variant?: ConsentBannerVariant;
  onAccept: () => void;
  onDecline: () => void;
  onSave: (selection: ConsentSelection) => void;
}) {
  const styles = VARIANT_STYLES[variant];
  const panelId = useId();
  const [showPreferences, setShowPreferences] = useState(false);

  // Never preselected: both start off regardless of any earlier decision, so a
  // visitor cannot grant a category simply by pressing Save.
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  return (
    <div
      data-ftt-consent-banner
      className="pointer-events-none fixed inset-x-0 bottom-2 z-40 flex justify-center px-2 sm:bottom-4 sm:px-4"
    >
      <section
        role="region"
        aria-label="Cookie and tracking preferences"
        className={cn(
          "pointer-events-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border p-3 [font-family:system-ui,sans-serif] shadow-[var(--ftt-soft-shadow)] sm:p-5",
          styles.card,
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div
            className={cn(
              "space-y-1 text-xs leading-5 sm:text-sm sm:leading-6",
              styles.text,
            )}
          >
            <p>
              <strong className="font-semibold">Essential cookies</strong> keep
              the site working — signing you in, remembering your bag and
              wishlist, and saving this choice. They are always on and need no
              consent.
            </p>
            <p>
              Only with your consent, we also use two separate kinds of optional
              cookie.{" "}
              <strong className="font-semibold">Analytics</strong> (Google
              Analytics, via Google Tag Manager) so we can see which pages and
              sarees people actually look at, and fix what confuses them.{" "}
              <strong className="font-semibold">Advertising</strong> (the Meta
              Pixel) so we can tell whether our Instagram and Facebook ads
              bring anyone here, and show those ads to people more likely to be
              interested.
            </p>
            <p>
              Both send information about your visit — your IP address, device
              and browser, and the pages you view — to Google and Meta, who
              process it in the United States, may link it to an account you
              hold with them, and may use it across other websites and apps.
              Your choice is stored for 180 days; you can change or withdraw it
              at any time under “Cookie settings” in the footer. Full detail is
              in our{" "}
              <Link
                href="/policies/privacy-policy"
                prefetch={false}
                className={cn(
                  "font-medium underline underline-offset-2 transition-colors",
                  styles.link,
                )}
              >
                Privacy policy
              </Link>
              .
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={onDecline}
              className={cn(
                "min-h-10 h-auto w-full whitespace-normal rounded-full border px-3 py-2 text-[11px] leading-4 transition-colors sm:h-10 sm:w-auto sm:whitespace-nowrap sm:px-5 sm:py-0 sm:text-sm",
                styles.secondary,
              )}
            >
              Reject optional cookies
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onAccept}
              className={cn(
                "min-h-10 h-auto w-full whitespace-normal rounded-full border px-3 py-2 text-[11px] leading-4 transition-colors sm:h-10 sm:w-auto sm:whitespace-nowrap sm:px-5 sm:py-0 sm:text-sm",
                styles.primary,
              )}
            >
              Accept optional cookies
            </Button>
          </div>
        </div>

        <div className="flex justify-start">
          <button
            type="button"
            aria-expanded={showPreferences}
            aria-controls={panelId}
            onClick={() => setShowPreferences((open) => !open)}
            className={cn(
              "rounded-full text-[11px] font-medium underline underline-offset-2 transition-colors sm:text-xs",
              styles.tertiary,
            )}
          >
            Manage preferences
          </button>
        </div>

        {showPreferences ? (
          <div
            id={panelId}
            className={cn("space-y-3 rounded-xl border p-3", styles.panel)}
          >
            <ConsentToggle
              checked={analytics}
              description="Google Analytics, loaded through Google Tag Manager. Purpose: to count visits and see which pages are used, so we can improve the site. Shared with Google (United States). Off by default."
              label="Analytics cookies"
              onChange={setAnalytics}
              styles={styles}
            />
            <ConsentToggle
              checked={advertising}
              description="Meta Pixel. Purpose: to measure whether our ads work and to reach people likely to be interested. Records page views and shares them with Meta (United States), which may match them to your Meta account. Off by default."
              label="Advertising cookies"
              onChange={setAdvertising}
              styles={styles}
            />
            <p className={cn("text-[11px] leading-4", styles.text)}>
              Essential cookies are not listed here because the site cannot work
              without them, so they are not optional. Both options above start
              switched off and stay off unless you turn them on. Withdrawing is
              as easy as giving: “Cookie settings” in the footer clears your
              choice and asks again — you never have to email us.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => onSave({ advertising, analytics })}
              className={cn(
                "min-h-10 h-auto w-full whitespace-normal rounded-full border px-3 py-2 text-[11px] leading-4 transition-colors sm:h-10 sm:w-auto sm:whitespace-nowrap sm:px-5 sm:py-0 sm:text-sm",
                styles.primary,
              )}
            >
              Save preferences
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ConsentToggle({
  checked,
  description,
  label,
  onChange,
  styles,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (next: boolean) => void;
  styles: (typeof VARIANT_STYLES)[ConsentBannerVariant];
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[#B39152]"
      />
      <label htmlFor={id} className={cn("text-[11px] leading-4 sm:text-xs", styles.text)}>
        <span className="block font-semibold">{label}</span>
        <span className="block">{description}</span>
      </label>
    </div>
  );
}
