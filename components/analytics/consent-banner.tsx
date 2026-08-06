"use client";

import Link from "next/link";

import type { ConsentBannerVariant } from "@/components/analytics/use-consent-banner-variant";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Minimal, NON-MODAL analytics consent banner.
 *
 * Shown only when no decision has been stored yet. GTM/GA4 does not load until
 * "Allow cookies" is chosen (strict load-after-consent). "Continue without
 * cookies" persists the refusal so the banner does not reappear.
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
  { card: string; text: string; link: string; secondary: string; primary: string }
> = {
  hero: {
    card: "border-[#B39152]/25 bg-[#FFFCF8]",
    text: "text-[#601D1C]/80",
    link: "text-[#601D1C] hover:text-[#B39152]",
    secondary:
      "border-[#601D1C]/20 bg-[#FDF7F1] text-[#601D1C] hover:bg-[#FDF7F1]/70",
    primary: "border-transparent bg-[#601D1C] text-[#FDF7F1] hover:bg-[#4A1614]",
  },
  default: {
    card: "border-[#B39152]/45 bg-[#601D1C]",
    text: "text-[#FDF7F1]/90",
    link: "text-[#E5C983] hover:text-[#FDF7F1]",
    secondary:
      "border-transparent bg-[#FDF7F1] text-[#601D1C] hover:bg-[#FDF7F1]/85",
    primary: "border-transparent bg-[#B39152] text-[#0E0D0E] hover:bg-[#C8A45F]",
  },
};

export function ConsentBanner({
  variant = "default",
  onAccept,
  onDecline,
}: {
  variant?: ConsentBannerVariant;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      data-ftt-consent-banner
      className="pointer-events-none fixed inset-x-0 bottom-2 z-40 flex justify-center px-2 sm:bottom-4 sm:px-4"
    >
      <section
        role="region"
        aria-label="Analytics cookie preferences"
        className={cn(
          "pointer-events-auto flex w-full max-w-4xl flex-col gap-2 rounded-2xl border p-3 [font-family:system-ui,sans-serif] shadow-[var(--ftt-soft-shadow)] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5",
          styles.card,
        )}
      >
        <div className={cn("space-y-1 text-xs leading-5 sm:text-sm sm:leading-6", styles.text)}>
          <p>
            We use optional analytics cookies — small files stored only in your
            browser — to measure website traffic and understand how the trunk is
            browsed.
          </p>
          <p>
            Nothing loads until you choose. See how in our{" "}
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
            Continue without cookies
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
            Allow cookies
          </Button>
        </div>
      </section>
    </div>
  );
}
