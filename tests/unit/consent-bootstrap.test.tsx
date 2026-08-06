// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONSENT_BOOTSTRAP_SOURCE,
  CONSENT_DATA_ATTRIBUTE,
} from "@/components/analytics/consent-bootstrap-script";
import { ConsentBanner } from "@/components/analytics/consent-banner";
import {
  clearClientConsent,
  CONSENT_COOKIE,
  readClientConsent,
  writeClientConsent,
} from "@/lib/analytics/consent";

const expireConsentCookie = () => {
  document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0`;
  document.documentElement.removeAttribute(CONSENT_DATA_ATTRIBUTE);
};

afterEach(expireConsentCookie);

describe("consent first-paint bootstrap", () => {
  it("sets unknown deterministically for a first visit", () => {
    window.eval(CONSENT_BOOTSTRAP_SOURCE);
    expect(document.documentElement.getAttribute(CONSENT_DATA_ATTRIBUTE)).toBe(
      "unknown",
    );
    expect(readClientConsent()).toBe("unknown");
  });

  it.each(["granted", "denied"] as const)(
    "reflects a stored %s decision before the banner paints",
    (state) => {
      document.cookie = `${CONSENT_COOKIE}=${state}; path=/`;
      window.eval(CONSENT_BOOTSTRAP_SOURCE);
      expect(document.documentElement.getAttribute(CONSENT_DATA_ATTRIBUTE)).toBe(
        state,
      );
      expect(readClientConsent()).toBe(state);
    },
  );

  it("keeps the early data attribute synchronized with accept, reject, and reset", () => {
    writeClientConsent("granted");
    expect(document.documentElement.getAttribute(CONSENT_DATA_ATTRIBUTE)).toBe(
      "granted",
    );
    writeClientConsent("denied");
    expect(document.documentElement.getAttribute(CONSENT_DATA_ATTRIBUTE)).toBe(
      "denied",
    );
    clearClientConsent();
    expect(document.documentElement.getAttribute(CONSENT_DATA_ATTRIBUTE)).toBe(
      "unknown",
    );
  });

  it("renders the complete keyboard-accessible first-visit interface without late text replacement", () => {
    const html = renderToStaticMarkup(
      <ConsentBanner onAccept={() => {}} onDecline={() => {}} />,
    );
    expect(html).toContain('data-ftt-consent-banner="true"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Analytics cookie preferences"');
    expect(html).toContain('href="/policies/privacy-policy"');
    expect(html).toContain('<button');
    expect(html).toContain("Continue without cookies");
    expect(html).toContain("Allow cookies");
    expect(html).not.toContain("aria-live");
  });
});
