// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ADVERTISING_CONSENT_COOKIE,
  clearClientConsent,
  CONSENT_COOKIE,
  CONSENT_NOTICE_COOKIE,
  CONSENT_NOTICE_VERSION,
  isAdvertisingAllowed,
  isAnalyticsAllowed,
  readAdvertisingConsent,
  readClientConsent,
  readConsentDecision,
  shouldShowConsentBanner,
  writeClientConsent,
  writeConsentDecision,
} from "@/lib/analytics/consent";

/**
 * Separate analytics and advertising consent.
 *
 * The decisive property: a visitor who accepted under the previous
 * analytics-only notice must keep analytics and must NOT get the Meta Pixel,
 * because they were never told about advertising.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const ALL_COOKIES = [
  CONSENT_COOKIE,
  ADVERTISING_CONSENT_COOKIE,
  CONSENT_NOTICE_COOKIE,
];

function expireAll() {
  for (const name of ALL_COOKIES) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

/** A visitor as they were left by the previous, analytics-only banner. */
function legacyVisitor(state: "denied" | "granted") {
  document.cookie = `${CONSENT_COOKIE}=${state}; path=/`;
}

afterEach(expireAll);

describe("cookie names", () => {
  it("keeps the original analytics cookie name so old choices survive", () => {
    // Renaming this would silently reset every stored analytics decision.
    expect(CONSENT_COOKIE).toBe("ftt_analytics_consent");
  });

  it("stores advertising separately from analytics", () => {
    expect(ADVERTISING_CONSENT_COOKIE).not.toBe(CONSENT_COOKIE);
  });
});

describe("a first-time visitor", () => {
  it("has granted nothing", () => {
    const decision = readConsentDecision();
    expect(decision).toEqual({
      advertising: "unknown",
      analytics: "unknown",
      noticeVersion: null,
    });
    expect(isAnalyticsAllowed(decision)).toBe(false);
    expect(isAdvertisingAllowed(decision)).toBe(false);
  });

  it("is asked", () => {
    expect(shouldShowConsentBanner(readConsentDecision())).toBe(true);
  });
});

describe("a visitor who accepted under the OLD analytics-only notice", () => {
  it("keeps analytics", () => {
    legacyVisitor("granted");
    expect(isAnalyticsAllowed(readConsentDecision())).toBe(true);
  });

  it("does NOT get advertising from that old grant", () => {
    legacyVisitor("granted");
    const decision = readConsentDecision();
    expect(decision.advertising).toBe("unknown");
    expect(isAdvertisingAllowed(decision)).toBe(false);
  });

  it("is shown the revised notice", () => {
    legacyVisitor("granted");
    expect(shouldShowConsentBanner(readConsentDecision())).toBe(true);
  });
});

describe("a visitor who previously rejected", () => {
  it("stays rejected for both categories", () => {
    legacyVisitor("denied");
    const decision = readConsentDecision();
    expect(isAnalyticsAllowed(decision)).toBe(false);
    expect(isAdvertisingAllowed(decision)).toBe(false);
  });

  it("is not asked again", () => {
    legacyVisitor("denied");
    expect(shouldShowConsentBanner(readConsentDecision())).toBe(false);
  });
});

describe("recording a decision", () => {
  it("accepting everything grants both and stamps the notice version", () => {
    writeConsentDecision({ advertising: "granted", analytics: "granted" });

    const decision = readConsentDecision();
    expect(decision.analytics).toBe("granted");
    expect(decision.advertising).toBe("granted");
    expect(decision.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
    expect(shouldShowConsentBanner(decision)).toBe(false);
  });

  it("rejecting everything denies both and is still recorded", () => {
    writeConsentDecision({ advertising: "denied", analytics: "denied" });

    const decision = readConsentDecision();
    expect(decision.analytics).toBe("denied");
    expect(decision.advertising).toBe("denied");
    expect(decision.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
    expect(shouldShowConsentBanner(decision)).toBe(false);
  });

  it("allows analytics without advertising", () => {
    writeConsentDecision({ advertising: "denied", analytics: "granted" });

    const decision = readConsentDecision();
    expect(isAnalyticsAllowed(decision)).toBe(true);
    expect(isAdvertisingAllowed(decision)).toBe(false);
  });

  it("allows advertising without analytics", () => {
    writeConsentDecision({ advertising: "granted", analytics: "denied" });

    const decision = readConsentDecision();
    expect(isAnalyticsAllowed(decision)).toBe(false);
    expect(isAdvertisingAllowed(decision)).toBe(true);
  });

  it("reflects the decision on the document element for first paint", () => {
    writeConsentDecision({ advertising: "denied", analytics: "granted" });
    const root = document.documentElement;
    expect(root.getAttribute("data-ftt-analytics-consent")).toBe("granted");
    expect(root.getAttribute("data-ftt-advertising-consent")).toBe("denied");
  });
});

describe("withdrawal", () => {
  it("clears every category and asks again", () => {
    writeConsentDecision({ advertising: "granted", analytics: "granted" });
    clearClientConsent();

    const decision = readConsentDecision();
    expect(decision).toEqual({
      advertising: "unknown",
      analytics: "unknown",
      noticeVersion: null,
    });
    expect(shouldShowConsentBanner(decision)).toBe(true);
  });

  it("is reachable from the footer without contacting us", () => {
    const button = read("components/analytics/cookie-settings-button.tsx");
    expect(button).toContain("clearClientConsent");
    expect(button).toContain("Cookie settings");
    // Rendering must not depend on GTM alone, or a Pixel-only configuration
    // would leave no way to withdraw advertising consent.
    expect(button).toContain("if (!getGtmId() && !getMetaPixelId()) return null;");

    const footer = read("components/layout/site-footer.tsx");
    expect(footer).toContain("<CookieSettingsButton");
  });
});

describe("backwards compatibility", () => {
  it("keeps the original analytics reader and writer working", () => {
    writeClientConsent("granted");
    expect(readClientConsent()).toBe("granted");
    writeClientConsent("denied");
    expect(readClientConsent()).toBe("denied");
  });

  it("leaves advertising untouched when only analytics is written", () => {
    writeClientConsent("granted");
    expect(readAdvertisingConsent()).toBe("unknown");
  });

  it("still gates the existing analytics call sites on the analytics cookie", () => {
    // These read readClientConsent(), which must keep meaning "analytics".
    expect(read("lib/analytics/track.ts")).toContain(
      'readClientConsent() !== "granted"',
    );
    expect(read("lib/analytics/client.ts")).toContain(
      'readClientConsent() !== "granted"',
    );
  });
});

describe("the gate wires each vendor to its own category", () => {
  const gate = read("components/analytics/analytics-gate.tsx");

  it("gates GTM on analytics and the Pixel on advertising", () => {
    expect(gate).toContain("isAnalyticsAllowed(decision)");
    expect(gate).toContain("isAdvertisingAllowed(decision)");
    expect(gate).toContain("const analyticsOn = gtmConfigured && isAnalyticsAllowed(decision);");
    expect(gate).toContain(
      "const advertisingOn = metaPixelConfigured && isAdvertisingAllowed(decision);",
    );
  });

  it("renders the Pixel only under the advertising branch", () => {
    const advertising = gate.slice(gate.indexOf("{advertisingOn ?"));
    expect(advertising).toContain("<MetaPixelLoader />");

    const analytics = gate.slice(
      gate.indexOf("{analyticsOn ?"),
      gate.indexOf("{advertisingOn ?"),
    );
    expect(analytics).toContain("<GtmLoader />");
    expect(analytics).not.toContain("<MetaPixelLoader />");
  });
});

describe("the banner", () => {
  const banner = read("components/analytics/consent-banner.tsx");
  /**
   * The banner's prose is wrapped across JSX lines, so a sentence a visitor
   * reads as one line is several in the source. Collapse whitespace (and the
   * {" "} JSX spacers) so these assertions test the words, not the formatting.
   */
  const bannerProse = banner
    .replace(/\{" "\}/g, " ")
    .replace(/<\/?strong[^>]*>/g, "")
    .replace(/\s+/g, " ");

  it("offers the three required controls", () => {
    expect(banner).toContain("Accept optional cookies");
    expect(banner).toContain("Reject optional cookies");
    expect(banner).toContain("Manage preferences");
  });

  it("names both providers and both purposes", () => {
    expect(banner).toContain("Google Analytics");
    expect(banner).toContain("Google Tag Manager");
    expect(banner).toContain("Meta Pixel");
    expect(bannerProse).toContain("Analytics (Google Analytics, via Google Tag Manager)");
    expect(bannerProse).toContain("Advertising (the Meta Pixel)");
  });

  it("separates essential cookies from optional tracking", () => {
    expect(bannerProse).toContain("Essential cookies keep the site working");
    expect(bannerProse).toContain("always on and need no consent");
  });

  it("says WHY each category exists, not just what it is", () => {
    expect(bannerProse).toContain(
      "so we can see which pages and sarees people actually look at",
    );
    expect(bannerProse).toContain(
      "whether our Instagram and Facebook ads bring anyone here",
    );
  });

  it("discloses the transfer out of India and the storage period", () => {
    expect(bannerProse).toContain("process it in the United States");
    expect(bannerProse).toContain("stored for 180 days");
  });

  it("tells the visitor how to withdraw, without email", () => {
    expect(bannerProse).toContain("Cookie settings");
    expect(bannerProse).toContain("never have to email us");
  });

  it("is 80% of the screen, and wider on a phone", () => {
    expect(banner).toContain("w-[94vw]");
    expect(banner).toContain("sm:w-[80vw]");
  });

  it("opens at a fixed short height and can never exceed the viewport", () => {
    // Three lines collapsed, so the banner is a bar rather than a wall.
    expect(banner).toContain('expanded ? "max-h-none" : "max-h-[3.75rem] sm:max-h-[4.5rem]"');
    // Read more must reveal the notice, not hand it to a scrollbar.
    expect(banner).not.toContain("overflow-y-auto text-xs");
    expect(banner).toContain("max-h-[85vh]");
  });

  it("reveals the rest through Read more rather than dropping it", () => {
    expect(banner).toContain('{expanded ? "Show less" : "Read more"}');
    expect(banner).toContain("aria-expanded={expanded}");
    expect(banner).toContain("aria-controls={textId}");
    // The notice is clamped by height, never by deleting paragraphs: every
    // disclosure the law needs is still in the markup when collapsed.
    expect(bannerProse).toContain("process it in the United States");
    expect(bannerProse).toContain("stored for 180 days");
    expect(bannerProse).toContain("Privacy policy");
  });

  it("preselects no optional category", () => {
    // Both switches are initialised to false, whatever was stored before.
    expect(banner).toContain("const [analytics, setAnalytics] = useState(false);");
    expect(banner).toContain(
      "const [advertising, setAdvertising] = useState(false);",
    );
  });
});

describe("the privacy policy", () => {
  const policies = read("lib/legal/policies.ts");
  const privacy = policies.slice(
    policies.indexOf('slug: "privacy-policy"'),
    policies.indexOf('slug: "return-refund-policy"'),
  );

  it("no longer claims analytics is aggregate-only or browser-only", () => {
    expect(privacy).not.toContain(
      "aggregate usage information used only to see how much traffic",
    );
    expect(privacy).not.toContain("Analytics runs only inside your web browser");
    expect(privacy).not.toContain(
      "it does not track your activity on other websites",
    );
  });

  it("names both providers and discloses the sharing", () => {
    expect(privacy).toContain("Meta Pixel");
    expect(privacy).toContain("Google Analytics");
    expect(privacy).toContain("Meta Platforms");
    expect(privacy).toContain("Conversions API");
  });

  it("describes the Conversions API as implemented: the event, and nothing else", () => {
    const sink = read("lib/adapters/meta-capi-sink.ts");
    // No personal-identifier block, and no blanket forwarding of the internal
    // payload — which previously leaked userId, referrer and order references.
    expect(sink).not.toContain("user_data");
    expect(sink).not.toContain("...event.payload");
    expect(privacy).toContain(
      "We do not send your name, email address, phone number, postal address, payment credentials, order or payment references, the amount you paid, which items you bought, your account identifier, or the page you came from",
    );
  });

  it("names the grievance officer with a contactable address", () => {
    expect(privacy).toContain("Grievance Officer: Dr. Meena, Founder");
    expect(privacy).toContain("privacy@fromthetrunk.shop");
    expect(privacy).not.toContain("[NAME]");
    expect(privacy).not.toContain("[DESIGNATION]");
    expect(privacy).not.toContain("[PHONE NUMBER]");
  });

  it("states that an old analytics grant is not advertising permission", () => {
    expect(privacy).toContain("Accepting analytics does not switch on advertising");
  });

  it("offers a self-service withdrawal route, not only email", () => {
    expect(privacy).toContain("you never have to email us to stop optional tracking");
  });

  it("does not promise to undo what Google or Meta already received", () => {
    expect(privacy).toContain(
      "it does not by itself undo what Google or Meta already received",
    );
  });

  it("keeps the browser-local Drape Room deletion wording intact", () => {
    expect(privacy).toContain(
      "From the Trunk cannot retrieve these browser-local images",
    );
    expect(privacy).toContain("Clear my try-on data");
  });

  it("keeps the erasure limitations intact", () => {
    expect(privacy).toContain(
      "A request for erasure does not necessarily require the deletion of every record",
    );
  });

  it("states the legal basis for each cookie category", () => {
    expect(privacy).toContain("Legal basis: we rely on your consent");
    expect(privacy).toContain("legitimate interest");
  });

  it("discloses how long the cookies last and who controls that", () => {
    expect(privacy).toContain("How long these cookies last");
    expect(privacy).toContain("180 days");
    // Durations belong to Google and Meta, so they are described as theirs.
    expect(privacy).toContain("set and controlled by the providers, not by us");
    // Verified against Google's and Meta's documented defaults, with the
    // browser caps that shorten them in practice.
    expect(privacy).toContain("up to two years");
    expect(privacy).toContain("about 90 days");
    expect(privacy).toContain("your browser often shortens this");
  });

  it("discloses the international transfer", () => {
    expect(privacy).toContain("Where this information goes");
    expect(privacy).toContain("United States");
  });

  it("explains the purpose in plain terms, including that refusing costs nothing", () => {
    expect(privacy).toContain("Why we ask at all");
    expect(privacy).toContain(
      "Neither is needed to browse, buy, or get your order",
    );
  });

  it("gives a route to complain to a data-protection authority", () => {
    expect(privacy).toContain("Data Protection Board of India");
    expect(privacy).toContain("supervisory authority");
  });

  it("records the actual edit date", () => {
    expect(privacy).toContain('lastUpdated: "September 17, 2026"');
  });
});
