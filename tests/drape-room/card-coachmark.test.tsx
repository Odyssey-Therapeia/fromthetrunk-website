/**
 * The product-card coach mark.
 *
 * It teaches where the Drape Room control is, which constrains it: it must not
 * cover that control, trap focus, or outlive the lesson.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("coach mark memory", () => {
  const storage = source("lib/drape-room/launch/storage.ts");

  it("keeps its own flag, separate from the teaser", () => {
    // Sharing one key would let whichever appeared first suppress the other.
    expect(drapeLaunchConfig.coachmarkCookie).toBe("ftt_drape_guide_v1");
    expect(drapeLaunchConfig.coachmarkCookie).not.toBe(
      drapeLaunchConfig.sessionKey,
    );
  });

  it("is a cookie name a browser will actually accept", () => {
    // Cookie names are tokens: the teaser's colon-separated storage key shape
    // would be silently dropped.
    expect(drapeLaunchConfig.coachmarkCookie).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it("remembers the lesson beyond the tab that taught it", () => {
    expect(storage).toContain("document.cookie");
    expect(storage).toContain("max-age=${ONE_YEAR_SECONDS}");
  });

  it("shows the guide unless the flag says it was taught", () => {
    // Absent shows it; "false" shows it again; only "true" suppresses it.
    expect(storage).toContain('const TAUGHT = "true";');
    expect(storage).toContain('const SHOW_AGAIN = "false";');
    const seen = storage.slice(
      storage.indexOf("export function hasSeenDrapeCardCoachmark"),
    );
    expect(seen.slice(0, seen.indexOf("export function mark"))).toContain(
      "=== TAUGHT",
    );
  });

  it("resets to the explicit show-again state rather than deleting", () => {
    const reset = storage.slice(
      storage.indexOf("export function clearDrapeCardCoachmarkSeen"),
    );
    expect(reset).toContain("SHOW_AGAIN");
  });

  it("treats a server render as already seen", () => {
    const seen = storage.slice(
      storage.indexOf("export function hasSeenDrapeCardCoachmark"),
    );
    // A flag that shaped SSR output would hydrate a coach mark that is not there.
    expect(seen.slice(0, seen.indexOf("export function mark"))).toContain(
      'typeof document === "undefined"',
    );
  });
});

describe("coach mark placement", () => {
  const context = source(
    "components/drape-room/launch/drape-coachmark-context.tsx",
  );
  const popover = source(
    "components/drape-room/launch/drape-card-coachmark.tsx",
  );
  const trigger = source("components/drape-room/drape-room-trigger.tsx");
  const spotlight = source(
    "components/drape-room/launch/drape-coachmark-spotlight.tsx",
  );

  it("asks the picker against the live viewport", () => {
    // Which button it lands on is covered by coachmark-target.test.ts; this
    // only pins that the provider defers to it rather than deciding itself.
    expect(context).toContain(
      "pickCoachmarkTarget(elements.current, window.innerHeight)",
    );
    expect(drapeLaunchConfig.trigger.coachmarkViewportInset).toBe(0.12);
  });

  it("keeps asking as the page scrolls rather than latching once", () => {
    // An observer fires once per crossing: a modal open at that instant would
    // have cost the lesson its only chance to land.
    expect(context).not.toContain("new IntersectionObserver");
    expect(context).toContain('window.addEventListener("scroll", schedule');
  });

  it("anchors to the real button rather than querying the DOM for it", () => {
    expect(trigger).toContain("PopoverAnchor");
    expect(trigger).toContain("ref={setButtonNode}");
    expect(context).toContain("elements.current.set");
  });

  it("is a popover, never a dialog", () => {
    // A dialog would trap focus away from the very control the coach mark is
    // pointing at, and block the tap it is asking for.
    expect(popover).toContain("PopoverContent");
    expect(popover).not.toContain("DialogContent");
  });

  it("closes on Escape even though open is controlled", () => {
    expect(popover).toContain("onEscapeKeyDown={onDismiss}");
  });

  it("leaves focus on the page", () => {
    expect(popover).toContain("onOpenAutoFocus");
    expect(popover).toContain("event.preventDefault()");
  });

  it("stays inside the viewport on a narrow screen", () => {
    expect(popover).toContain("calc(100vw-2rem)");
    expect(popover).toContain("collisionPadding");
  });

  it("does not animate repeatedly under reduced motion", () => {
    expect(popover).toContain("motion-reduce:animate-none");
  });

  it("sits above the spotlight it is explaining", () => {
    expect(popover).toContain("z-[75]");
    expect(spotlight).toContain("z-[70]");
  });

  it("holds back while a modal owns the screen, but not for a chat bubble", () => {
    // Scroll lock is the signal a real modal is up. Anything that merely
    // carries role="dialog" must not suppress the lesson forever.
    expect(context).toContain('data-scroll-locked');
    expect(context).toContain('[role="dialog"][data-state="open"]');
  });
});

describe("coach mark lifecycle", () => {
  const context = source(
    "components/drape-room/launch/drape-coachmark-context.tsx",
  );
  const trigger = source("components/drape-room/drape-room-trigger.tsx");
  const entry = source(
    "components/drape-room/launch/drape-launch-collection-entry.tsx",
  );

  it("arms itself on the catalogue after a short dwell", () => {
    // Two seconds, not a wait for the teaser: the button is already on screen.
    expect(drapeLaunchConfig.trigger.coachmarkDwellMs).toBe(2_000);
    expect(context).toContain("coachmarkDwellMs");
    expect(context).toContain("hasSeenDrapeCardCoachmark()");
  });

  it("teaches on the catalogue only", () => {
    expect(drapeLaunchConfig.coachmarkRoute).toBe("/collection");
    expect(context).toContain("drapeLaunchConfig.coachmarkRoute");
  });

  it("reads storage from an effect, never during render", () => {
    // Storage shaping SSR output would hydrate a coach mark that is not there.
    const render = context.slice(context.indexOf("const value = useMemo"));
    expect(render).not.toContain("hasSeenDrapeCardCoachmark()");
  });

  it("drops its claim on a route change without spending the lesson", () => {
    // Read back through the route it was made on, so a navigation drops it
    // with no reset to forget and no seen-flag burnt on nobody.
    expect(context).toContain("claim?.path === pathname");
    expect(context).toContain("armedOn === pathname");
  });

  it("still arms from the teaser for a shopper it reached first", () => {
    expect(entry).toContain("coachmark?.arm()");
  });

  it("holds the teaser back while the lesson is on screen", () => {
    expect(entry).toContain("!coachmark?.isShowing");
    expect(context).toContain("isShowing: claimedProductId !== null");
  });

  it("completes when the shopper taps the real control", () => {
    // The tap must open the Drape Room too — the lesson does not swallow it.
    expect(trigger).toContain("if (isCoachMarked) coachmark?.complete();");
    expect(trigger).toContain("openDrapeRoom();");
  });

  it("opens the room from its own primary action", () => {
    expect(trigger).toContain("onTryThis");
    expect(trigger).toContain("coachmark?.complete();");
  });

  it("renders plainly with no provider mounted", () => {
    expect(context).toContain("useContext(DrapeCoachmarkContext)");
    expect(trigger).toContain("if (!isCoachMarked) return trigger;");
  });
});

describe("coach mark spotlight", () => {
  const spotlight = source(
    "components/drape-room/launch/drape-coachmark-spotlight.tsx",
  );

  it("blurs the page without covering the button", () => {
    // A masked blur layer leaves the real control sharp and in place, so
    // nothing has to clone or re-parent it.
    expect(spotlight).toContain("backdrop-blur");
    expect(spotlight).toContain("WebkitMaskImage");
    expect(spotlight).toContain("radial-gradient(circle at");
  });

  it("never intercepts a tap", () => {
    // The whole point is the button underneath staying tappable.
    expect(spotlight).toContain("pointer-events-none");
  });

  it("follows the button and gives up when it leaves the viewport", () => {
    // A dark page lit on nothing would be a trap with no way out.
    expect(spotlight).toContain("requestAnimationFrame");
    expect(spotlight).toContain("onTargetLostRef.current()");
  });

  it("renders nothing before it has measured", () => {
    // Guards both SSR and the first client paint, where `document` and the
    // button's box are not available yet.
    expect(spotlight).toContain("if (!target || !rect) return null;");
  });
});
