import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

/**
 * Guardrail: the browser must never emit a purchase conversion.
 *
 * Purchase / payment conversion is owned by the server-side GA4 Measurement
 * Protocol sink (currently `payment_completed`; follow-up maps it to GA4
 * `purchase`). A client-side `ftt_purchase`/`purchase` dataLayer push would
 * double-count once the server mapping lands. These source scans fail loudly if
 * anyone reintroduces client purchase tracking.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

describe("client analytics — no purchase footgun", () => {
  it("track.ts exposes no purchase helper or ftt_purchase event", () => {
    const src = read("lib/analytics/track.ts");
    expect(src).not.toMatch(/trackPurchase/);
    expect(src).not.toMatch(/ftt_purchase/);
    // A bare `purchase` string would also be suspicious in the client helper.
    expect(src.toLowerCase()).not.toContain('"purchase"');
    expect(src.toLowerCase()).not.toContain("'purchase'");
  });

  it("confirmation-analytics fires complete_flow, never purchase", () => {
    const src = read("app/(site)/checkout/confirmation/confirmation-analytics.tsx");
    expect(src).toContain("trackCompleteFlow");
    // Only allowed as prose in comments; never as an emitted event token.
    expect(src).not.toMatch(/trackEvent\(\s*["']purchase["']/);
    expect(src).not.toMatch(/event:\s*["']purchase["']/);
    expect(src).not.toMatch(/ftt_purchase/);
  });

  it("no client component pushes ftt_purchase or a purchase dataLayer event", () => {
    // Scan the wired client analytics call sites.
    const files = [
      "lib/analytics/track.ts",
      "components/analytics/whatsapp-link.tsx",
      "components/analytics/gtm-page-view.tsx",
      "components/checkout/checkout-page-client.tsx",
      "app/(site)/checkout/confirmation/confirmation-analytics.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} must not push ftt_purchase`).not.toMatch(/ftt_purchase/);
    }
  });
});
