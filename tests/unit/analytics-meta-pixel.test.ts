import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapFbq,
  detectExistingPixel,
  getMetaPixelId,
  initMetaPixel,
  installedPixelIds,
  META_PIXEL_SRC,
  revokeMetaPixelConsent,
  shouldRenderMetaPixel,
  trackMetaPageView,
  type FbqFunction,
  type MetaPixelWindow,
} from "@/lib/analytics/meta-pixel";

/**
 * Browser Meta Pixel — consent gating, single-PageView accounting, and the
 * stand-down when a Google Tag Manager container already owns a Pixel.
 *
 * The runtime helpers all take the window as an argument, so the behaviour is
 * exercised against a plain object here rather than a jsdom global. The calls
 * the Pixel would make are readable straight off `fbq.queue`, which is where
 * Meta's own stub parks everything until fbevents.js arrives.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Source with its comments stripped. These assertions are about what the code
 * does, so a comment explaining why the Pixel does NOT render a noscript
 * beacon must not read as the beacon itself. The `[^:]` guard keeps `https://`
 * inside string literals intact.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PIXEL_ID = "1368141865250071";

/** A pixel someone else installed: no `fttOwned` marker. */
function foreignWindow(pixelIds: string[] = ["9999999999"]): MetaPixelWindow {
  const fbq = function () {} as FbqFunction;
  fbq.version = "2.0";
  fbq.getState = () => ({ pixels: pixelIds.map((id) => ({ id })) });
  return { fbq };
}

/** The calls parked on the stub, as plain arrays. */
const calls = (win: MetaPixelWindow): unknown[][] =>
  (win.fbq?.queue ?? []).map((entry) => [...entry]);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Meta Pixel gating (NEXT_PUBLIC_META_PIXEL_ID)", () => {
  it("is a no-op when the id is unset, empty or blank", () => {
    expect(shouldRenderMetaPixel(undefined)).toBe(false);
    expect(shouldRenderMetaPixel("")).toBe(false);
    expect(shouldRenderMetaPixel("   ")).toBe(false);
  });

  it("renders when an id is configured", () => {
    expect(shouldRenderMetaPixel(PIXEL_ID)).toBe(true);
  });

  it("reads the id from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PIXEL_ID);
    expect(getMetaPixelId()).toBe(PIXEL_ID);
  });

  it("returns undefined rather than an empty id", () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    expect(getMetaPixelId()).toBeUndefined();
  });

  it("trims a padded id so a stray space cannot become a live pixel id", () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", `  ${PIXEL_ID}  `);
    expect(getMetaPixelId()).toBe(PIXEL_ID);
  });
});

describe("fbq bootstrap", () => {
  it("creates Meta's queue stub and marks it as ours", () => {
    const win: MetaPixelWindow = {};
    const fbq = bootstrapFbq(win);

    expect(win.fbq).toBe(fbq);
    expect(win._fbq).toBe(fbq);
    expect(fbq.version).toBe("2.0");
    expect(fbq.loaded).toBe(true);
    expect(fbq.push).toBe(fbq);
    expect(fbq.queue).toEqual([]);
    expect(fbq.fttOwned).toBe(true);
  });

  it("queues calls made before fbevents.js loads", () => {
    const win: MetaPixelWindow = {};
    const fbq = bootstrapFbq(win);
    fbq("track", "PageView");
    expect(calls(win)).toEqual([["track", "PageView"]]);
  });

  it("hands queued calls to fbevents.js once it defines callMethod", () => {
    const win: MetaPixelWindow = {};
    const fbq = bootstrapFbq(win);
    const callMethod = vi.fn();
    fbq.callMethod = callMethod;

    fbq("track", "PageView");

    expect(callMethod).toHaveBeenCalledWith("track", "PageView");
    // Nothing is parked once the library is live.
    expect(calls(win)).toEqual([]);
  });

  it("never replaces a stub that already exists", () => {
    const win = foreignWindow();
    const existing = win.fbq;
    expect(bootstrapFbq(win)).toBe(existing);
  });
});

describe("existing-installation detection", () => {
  it("reports none on a clean page", () => {
    expect(detectExistingPixel({})).toBe("none");
  });

  it("reports ours after we bootstrap", () => {
    const win: MetaPixelWindow = {};
    bootstrapFbq(win);
    expect(detectExistingPixel(win)).toBe("ours");
  });

  it("reports foreign for a pixel someone else installed", () => {
    expect(detectExistingPixel(foreignWindow())).toBe("foreign");
  });

  it("reads the ids of a foreign installation for diagnostics", () => {
    expect(installedPixelIds(foreignWindow(["111", "222"]))).toEqual([
      "111",
      "222",
    ]);
  });

  it("survives a getState that is missing, throws or is reshaped", () => {
    expect(installedPixelIds({})).toEqual([]);

    const throwing = function () {} as FbqFunction;
    throwing.getState = () => {
      throw new Error("undocumented API changed");
    };
    expect(installedPixelIds({ fbq: throwing })).toEqual([]);

    const reshaped = function () {} as FbqFunction;
    reshaped.getState = () => ({ pixels: "not-an-array" });
    expect(installedPixelIds({ fbq: reshaped })).toEqual([]);
  });
});

describe("initialisation and consent", () => {
  it("revokes BEFORE init, then grants — Meta's documented ordering", () => {
    const win: MetaPixelWindow = {};
    expect(initMetaPixel(win, PIXEL_ID)).toEqual({ status: "installed" });

    expect(calls(win)).toEqual([
      ["consent", "revoke"],
      ["init", PIXEL_ID],
      ["consent", "grant"],
    ]);
  });

  it("does NOT fire PageView — the page-view tracker owns every one", () => {
    const win: MetaPixelWindow = {};
    initMetaPixel(win, PIXEL_ID);

    expect(calls(win).filter(([verb]) => verb === "track")).toEqual([]);
  });

  it("stands down when a GTM container already installed a Pixel", () => {
    const win = foreignWindow(["1368141865250071"]);
    const before = win.fbq;

    expect(initMetaPixel(win, PIXEL_ID)).toEqual({
      pixelIds: ["1368141865250071"],
      status: "skipped-foreign",
    });
    // The foreign pixel is left completely untouched.
    expect(win.fbq).toBe(before);
    expect(win.fbq?.fttInitialisedId).toBeUndefined();
  });

  it("re-grants instead of initialising twice when consent returns", () => {
    const win: MetaPixelWindow = {};
    initMetaPixel(win, PIXEL_ID);
    revokeMetaPixelConsent(win);

    expect(initMetaPixel(win, PIXEL_ID)).toEqual({
      status: "already-installed",
    });

    expect(calls(win)).toEqual([
      ["consent", "revoke"],
      ["init", PIXEL_ID],
      ["consent", "grant"],
      ["consent", "revoke"],
      ["consent", "grant"],
    ]);
    // Exactly one init, however many times consent is toggled.
    expect(calls(win).filter(([verb]) => verb === "init")).toHaveLength(1);
  });
});

describe("PageView accounting", () => {
  it("sends exactly one PageView per call, and only after init", () => {
    const win: MetaPixelWindow = {};

    // Before init there is nothing of ours to track.
    expect(trackMetaPageView(win)).toBe(false);

    initMetaPixel(win, PIXEL_ID);
    expect(trackMetaPageView(win)).toBe(true);

    expect(calls(win).filter(([verb]) => verb === "track")).toEqual([
      ["track", "PageView"],
    ]);
  });

  it("refuses to track into a foreign pixel, so GTM's PageView is not doubled", () => {
    const win = foreignWindow();
    expect(trackMetaPageView(win)).toBe(false);
  });

  it("counts one PageView per navigation across a route change", () => {
    const win: MetaPixelWindow = {};
    initMetaPixel(win, PIXEL_ID);

    trackMetaPageView(win); // landing
    trackMetaPageView(win); // client-side navigation

    expect(calls(win).filter(([verb]) => verb === "track")).toHaveLength(2);
  });
});

describe("consent withdrawal", () => {
  it("tells the Pixel to stop sending", () => {
    const win: MetaPixelWindow = {};
    initMetaPixel(win, PIXEL_ID);

    expect(revokeMetaPixelConsent(win)).toBe(true);
    expect(calls(win).at(-1)).toEqual(["consent", "revoke"]);
  });

  it("is a no-op on a clean page or a foreign pixel", () => {
    expect(revokeMetaPixelConsent({})).toBe(false);
    expect(revokeMetaPixelConsent(foreignWindow())).toBe(false);
  });
});

describe("loader wiring", () => {
  const loader = read("components/analytics/meta-pixel-loader.tsx");
  const pageView = read("components/analytics/meta-pixel-page-view.tsx");
  const gate = read("components/analytics/analytics-gate.tsx");

  it("loads the library through next/script with afterInteractive", () => {
    expect(loader).toContain('strategy="afterInteractive"');
    expect(loader).toContain("src={META_PIXEL_SRC}");
    expect(META_PIXEL_SRC).toBe(
      "https://connect.facebook.net/en_US/fbevents.js",
    );
  });

  it("renders no noscript tracking image", () => {
    expect(codeOf(loader)).not.toMatch(/noscript/i);
    expect(codeOf(gate)).not.toMatch(/noscript/i);
    // The <img> beacon that Meta's stock snippet puts inside that noscript.
    expect(codeOf(loader)).not.toContain("facebook.com/tr");
  });

  it("uses no inline script, so it needs no 'unsafe-inline'", () => {
    expect(loader).not.toContain("dangerouslySetInnerHTML");
  });

  it("revokes consent when the loader unmounts", () => {
    expect(loader).toContain("revokeMetaPixelConsent");
  });

  it("mounts the Pixel only inside the advertising-granted branch", () => {
    const advertising = gate.slice(gate.indexOf("{advertisingOn ?"));
    expect(advertising).toContain("<MetaPixelLoader />");
    expect(advertising).toContain("<MetaPixelPageView />");

    // Advertising consent is the only thing that can mount it: the analytics
    // branch and everything before it must stay Meta-free.
    const beforeAdvertising = gate.slice(0, gate.indexOf("{advertisingOn ?"));
    expect(beforeAdvertising).not.toContain("<MetaPixelLoader />");
  });

  it("keeps GTM gated on its own id and its own consent category", () => {
    expect(gate).toContain(
      "const analyticsOn = gtmConfigured && isAnalyticsAllowed(decision);",
    );
    expect(gate).toContain(
      "const advertisingOn = metaPixelConfigured && isAdvertisingAllowed(decision);",
    );
    expect(gate).toContain("if (!gtmConfigured && !metaPixelConfigured) return null;");
  });

  it("wraps the page-view tracker in Suspense, as useSearchParams requires", () => {
    expect(pageView).toContain("useSearchParams");
    const advertising = gate.slice(gate.indexOf("{advertisingOn ?"));
    expect(advertising).toMatch(
      /<Suspense fallback=\{null\}>\s*<MetaPixelPageView \/>\s*<\/Suspense>/,
    );
  });
});

describe("Content Security Policy", () => {
  const config = read("next.config.ts");
  const directive = (name: string) => {
    const match = config.match(new RegExp(`\`${name} [^\`]*\``));
    if (!match) throw new Error(`CSP directive not found: ${name}`);
    return match[0];
  };

  it("allowlists the hosts the Pixel actually uses", () => {
    expect(config).toContain(
      'const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net"',
    );
    expect(directive("script-src")).toContain("${META_PIXEL_SCRIPT_SRC}");
    expect(directive("script-src-elem")).toContain("${META_PIXEL_SCRIPT_SRC}");
    expect(directive("img-src")).toContain("${META_PIXEL_IMG_SRC}");
    expect(directive("connect-src")).toContain("${META_PIXEL_CONNECT_SRC}");
  });

  it("does not weaken the rules that were already there", () => {
    // Every pre-existing source stays in place.
    const script = directive("script-src");
    expect(script).toContain("'self'");
    expect(script).toContain("https://checkout.razorpay.com");
    expect(script).toContain("${GTM_SCRIPT_SRC}");
    expect(script).toContain("https://www.google-analytics.com");

    const img = directive("img-src");
    expect(img).toContain("${MEDIA_CSP_SRC}");
    expect(img).toContain("https://behold.pictures");
    expect(img).toContain("${GA_IMG_SRC}");

    const connect = directive("connect-src");
    expect(connect).toContain("https://api.razorpay.com");
    expect(connect).toContain("${GA_CONNECT_SRC}");
    expect(connect).toContain("${MEDIA_CSP_SRC}");

    // The locked-down directives are untouched.
    expect(config).toContain('"default-src \'self\'"');
    expect(config).toContain('"object-src \'none\'"');
    expect(config).toContain('"frame-ancestors \'self\'"');
    expect(config).toContain('"form-action \'self\'"');
    expect(config).toContain('"report-uri /api/v2/security/csp-report"');
  });

  it("adds no wildcard origin and no unsafe-eval", () => {
    for (const name of ["script-src", "script-src-elem", "img-src", "connect-src"]) {
      const value = directive(name);
      expect(value).not.toContain("'unsafe-eval'");
      // A bare `*` source, as opposed to the existing https://*.host entries.
      expect(value).not.toMatch(/\s\*[\s`]/);
    }
    // Meta is not granted a frame source; the Pixel needs none.
    expect(directive("frame-src")).not.toContain("facebook");
  });
});

describe("scope", () => {
  it("leaves server-side conversion tracking alone", () => {
    const capi = read("lib/adapters/meta-capi-sink.ts");
    expect(capi).toContain("InitiateCheckout");
    expect(capi).toContain("Purchase");

    // No browser-side conversion may exist yet: the server mints its own
    // event_id, so a client Purchase would be counted a second time. Only a
    // quoted event name would actually be sent, so that is what is asserted.
    const pixel = codeOf(read("lib/analytics/meta-pixel.ts"));
    expect(pixel).not.toMatch(
      /"(Purchase|InitiateCheckout|AddToCart|ViewContent|Lead|CompleteRegistration)"/,
    );
    // PageView is the one standard event this module may name.
    expect(pixel).toContain('"PageView"');
  });
});
