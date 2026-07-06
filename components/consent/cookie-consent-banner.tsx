"use client";

/**
 * Cookie consent banner. Opt-in model: PostHog + GA4 only activate after the
 * user clicks "Accept". Stays dismissed once a choice is made (ftt_consent cookie).
 *
 * Mobile-first, matches FTT brand (trunk-brown / trunk-gold). Keyboard-accessible.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConsent } from "@/lib/analytics/use-consent";

export function CookieConsentBanner() {
  const { hasChosen, setConsent } = useConsent();

  if (hasChosen) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-trunk-gold/30 bg-card/95 p-4 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          We use cookies to understand how you browse the trunk — so we can
          curate better. Only essential cookies run until you accept. See our{" "}
          <Link
            href="/privacy-policy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => setConsent("essential")}
          >
            Essential only
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => setConsent("all")}
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
