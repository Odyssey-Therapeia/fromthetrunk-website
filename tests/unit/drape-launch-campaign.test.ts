import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  drapeAnnouncementMessage,
  drapeLaunchConfig,
  isDrapeLaunchExcludedRoute,
} from "@/lib/drape-room/launch/config";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

const announcementBar = read("components/layout/announcement-bar.tsx");
const teaser = read("components/drape-room/launch/drape-launch-teaser.tsx");
const media = read("components/drape-room/launch/drape-launch-media.tsx");
const entry = read(
  "components/drape-room/launch/drape-launch-product-entry.tsx",
);
const trigger = read(
  "components/drape-room/launch/use-drape-launch-trigger.ts",
);
const slot = read("components/drape-room/launch/drape-launch-gallery-slot.tsx");
const pdp = read("app/(site)/collection/[slug]/page.tsx");
const storage = read("lib/drape-room/launch/storage.ts");

describe("Drape Room launch campaign configuration", () => {
  it("carries the exact launch and evergreen copy, switchable centrally", () => {
    expect(drapeLaunchConfig.announcementMessage.launch).toBe(
      "NEW · THE DRAPE ROOM IS OPEN — See yourself in the saree you love. Try it now →",
    );
    expect(drapeLaunchConfig.announcementMessage.evergreen).toBe(
      "THE DRAPE ROOM · Try any saree on yourself →",
    );
    expect(drapeAnnouncementMessage()).toBe(
      drapeLaunchConfig.announcementMessage[
        drapeLaunchConfig.announcementVariant
      ],
    );
  });

  it("uses the documented trigger thresholds", () => {
    expect(drapeLaunchConfig.trigger.dwellMs).toBe(7_000);
    expect(drapeLaunchConfig.trigger.scrollProgress).toBeCloseTo(0.35);
    expect(drapeLaunchConfig.trigger.distinctGalleryImages).toBe(2);
  });

  it("versions the session key so a future campaign can show again", () => {
    expect(drapeLaunchConfig.sessionKey).toBe(
      "ftt:drape-room:teaser-shown:v1",
    );
  });

  it("excludes every transactional and account route", () => {
    for (const path of [
      "/cart",
      "/checkout",
      "/checkout/confirmation",
      "/checkout/confirmation/receipt",
      "/account",
      "/account/orders",
      "/search",
      "/admin/orders",
    ]) {
      expect(isDrapeLaunchExcludedRoute(path)).toBe(true);
    }
  });

  it("permits the browsing routes the campaign targets", () => {
    for (const path of ["/", "/collection", "/collection/a-saree"]) {
      expect(isDrapeLaunchExcludedRoute(path)).toBe(false);
    }
    // A null pathname must fail closed rather than render on an unknown route.
    expect(isDrapeLaunchExcludedRoute(null)).toBe(true);
  });

  it("never promises more privacy than the pipeline delivers", () => {
    const copy = Object.values(drapeLaunchConfig.copy).flat().join(" ");
    for (const forbidden of [
      "100% safe",
      "We do not use your image",
      "No processing",
      "Exact fit",
      "Guaranteed result",
    ]) {
      expect(copy).not.toContain(forbidden);
    }
    expect(drapeLaunchConfig.copy.privacy).toContain(
      "used only to create your preview",
    );
  });
});

describe("Drape Room announcement bar", () => {
  it("keeps the existing promos and adds the campaign line from config", () => {
    expect(announcementBar).toContain("FIRST25");
    expect(announcementBar).toContain("drapeAnnouncementMessage()");
    // The copy itself must not be duplicated into the component.
    expect(announcementBar).not.toContain("THE DRAPE ROOM IS OPEN");
  });

  it("links the whole bar to the campaign destination in the same tab", () => {
    expect(announcementBar).toContain("href={drapeLaunchConfig.ctaHref}");
    expect(announcementBar).not.toContain('target="_blank"');
  });

  it("stays a server component so the layout is not client-rendered", () => {
    expect(announcementBar).not.toContain('"use client"');
  });
});

describe("Drape Room launch media", () => {
  it("serves the animated AVIFs natively, never through next/image", () => {
    expect(media).toContain("<picture>");
    expect(media).toContain("srcSet={media.mobile.src}");
    expect(media).not.toContain('from "next/image"');
    expect(media).not.toContain("<video");
  });

  it("reserves intrinsic dimensions and selects by media query, not user agent", () => {
    expect(media).toContain("width={media.desktop.width}");
    expect(media).toContain("height={media.desktop.height}");
    expect(media).toContain("max-width: ${media.mobileMaxWidthPx}px");
    expect(media).not.toContain("navigator.userAgent");
  });

  it("degrades to a neutral panel when the asset fails", () => {
    expect(media).toContain("onError={() => setFailed(true)}");
    expect(media).toContain("if (failed)");
  });
});

describe("Drape Room product teaser", () => {
  it("is lazily loaded so its media never competes for product LCP", () => {
    expect(entry).toContain("ssr: false");
    expect(entry).toContain('import("./drape-launch-teaser")');
  });

  it("enters the Drape Room through the existing store action", () => {
    expect(entry).toContain("openDrapeRoom(product, buttonRef.current)");
    // No invented route or query parameter for product selection.
    expect(entry).not.toContain('href="/drape-room');
    expect(entry).not.toContain("?product=");
  });

  it("marks the session at auto-open, not at dismissal", () => {
    const markIndex = trigger.indexOf("markDrapeTeaserSeen()");
    const stateIndex = trigger.indexOf('setState("open")');
    expect(markIndex).toBeGreaterThan(-1);
    expect(markIndex).toBeLessThan(stateIndex);
  });

  it("does not detect itself as a competing overlay", () => {
    expect(trigger).toContain(":not([data-ftt-drape-teaser])");
    expect(teaser).toContain("data-ftt-drape-teaser");
  });

  it("detects hand-rolled dialogs, not only Radix ones", () => {
    // The welcome popup sets role="dialog" with no data-state, so matching on
    // data-state alone would let two modals fight over pointer input.
    expect(trigger).toContain("[role='dialog']:not([data-ftt-drape-teaser])");
    expect(trigger).toContain('getAttribute("data-state") === "closed"');
  });

  it("hands the once-per-tab budget back when suspended", () => {
    expect(trigger).toContain("clearDrapeTeaserSeen()");
    expect(trigger).toContain("armedRef.current = false");
    expect(storage).toContain("export function clearDrapeTeaserSeen");
  });

  it("pauses the dwell timer while the tab is hidden and cleans up", () => {
    expect(trigger).toContain('document.visibilityState !== "visible"');
    expect(trigger).toContain("window.clearInterval(tick)");
    expect(trigger).toContain("window.removeEventListener(\"scroll\", onScroll)");
  });

  it("guards scroll progress against an unscrollable page", () => {
    expect(trigger).toContain("if (scrollable <= 0) return;");
    expect(trigger).toContain("requestAnimationFrame(measure)");
  });

  it("defers while another overlay is open or the shopper is typing", () => {
    expect(trigger).toContain(
      "if (anotherOverlayIsOpen() || shopperIsBusy()) return;",
    );
  });

  it("is labelled and described for assistive technology", () => {
    expect(teaser).toContain('aria-labelledby="drape-teaser-heading"');
    expect(teaser).toContain('aria-describedby="drape-teaser-body"');
    expect(teaser).toContain('id="drape-teaser-heading"');
    expect(teaser).toContain('id="drape-teaser-body"');
    expect(teaser).toContain("size-11");
  });

  it("keeps the product name out of the heading", () => {
    expect(teaser).toContain("{product ? copy.heading : copy.collectionHeading}");
    expect(teaser).toContain("line-clamp-2");
  });

  it("stays within the viewport and respects mobile safe areas", () => {
    expect(teaser).toContain("max-h-[calc(100dvh-env(safe-area-inset-top)-12px)]");
    expect(teaser).toContain("pb-[max(0.9rem,env(safe-area-inset-bottom))]");
    expect(teaser).toContain("sm:w-[min(920px,calc(100vw-48px))]");
  });

  it("shares the existing z-50 overlay layer", () => {
    expect(teaser.match(/z-50/g)?.length).toBeGreaterThanOrEqual(2);
    expect(teaser).not.toMatch(/z-\[\d{3,}\]/);
  });
});

describe("Drape Room gallery integration", () => {
  it("counts distinct images through the gallery callback, not the DOM", () => {
    expect(slot).toContain("viewedRef.current.has(index)");
    expect(slot).toContain("onActiveIndexChange={handleActiveIndexChange}");
    expect(slot).not.toContain("MutationObserver");
    expect(slot).not.toContain("querySelector");
  });

  it("renders a plain gallery when the saree is not eligible", () => {
    expect(slot).toContain(
      "if (!drapeProduct) return <ProductGallery {...galleryProps} />;",
    );
  });

  it("is mounted on the product page for eligible sarees only", () => {
    expect(pdp).toContain("<DrapeLaunchGallerySlot");
    expect(pdp).toContain(
      "!isBlouse && drapeSaree.eligible ? drapeSaree.saree : null",
    );
  });
});

describe("Drape Room catalogue teaser", () => {
  const collection = read(
    "components/drape-room/launch/drape-launch-collection-entry.tsx",
  );
  const collectionPage = read("app/(site)/collection/page.tsx");

  it("opens on dwell alone, after five seconds", () => {
    expect(drapeLaunchConfig.trigger.collectionDwellMs).toBe(5_000);
    expect(collection).toContain(
      "dwellMs: drapeLaunchConfig.trigger.collectionDwellMs",
    );
    // No saree is selected here, so scroll and gallery triggers do not apply.
    expect(collection).not.toContain("viewedGalleryCount");
  });

  it("shares one session key with the product page, so it shows once per tab", () => {
    expect(collection).not.toContain("sessionKey");
    expect(trigger).toContain("hasSeenDrapeTeaser()");
    expect(trigger).toContain("markDrapeTeaserSeen()");
  });

  it("runs the product-less variant and sends shoppers to the grid", () => {
    expect(collection).not.toContain("product={");
    expect(collection).toContain("collectionGridHref");
    expect(collectionPage).toContain("<DrapeLaunchCollectionEntry />");
    expect(collectionPage).toContain('id="collection-grid"');
  });

  it("carries copy that never assumes a chosen saree", () => {
    expect(drapeLaunchConfig.copy.collectionHeading).toBe("See a saree on you");
    expect(drapeLaunchConfig.copy.collectionHeading).not.toContain("this saree");
    expect(drapeLaunchConfig.copy.collectionBody).not.toContain("this saree");
  });
});
