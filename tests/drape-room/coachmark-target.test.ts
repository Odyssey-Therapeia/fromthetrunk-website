/**
 * Which button the coach mark lands on.
 *
 * The bug this replaces was a one-shot IntersectionObserver: it fired once per
 * crossing, so anything open at that instant cost the lesson its only chance.
 * These cases assert the choice itself, not the wiring around it.
 */
import { describe, expect, it } from "vitest";

import {
  pickCoachmarkTarget,
  type MeasurableTrigger,
} from "@/lib/drape-room/launch/coachmark-target";

const VIEWPORT = 1000;
/** Matches the real button: a 44px round control. */
const SIZE = 44;

/** A trigger whose box sits with its centre at `centre` px down the viewport. */
const at = (centre: number, size = SIZE): MeasurableTrigger => ({
  getBoundingClientRect: () => ({
    top: centre - size / 2,
    bottom: centre + size / 2,
    height: size,
    width: size,
  }),
});

const grid = (entries: Record<string, MeasurableTrigger>) =>
  new Map(Object.entries(entries));

describe("picking the coach mark's button", () => {
  it("picks the button nearest the middle of the screen", () => {
    const picked = pickCoachmarkTarget(
      grid({ high: at(200), centred: at(520), low: at(860) }),
      VIEWPORT,
    );
    expect(picked).toBe("centred");
  });

  it("does not favour whichever card registered first", () => {
    // Insertion order is grid order, which has nothing to do with what the
    // shopper is looking at.
    expect(
      pickCoachmarkTarget(grid({ first: at(700), second: at(510) }), VIEWPORT),
    ).toBe("second");
  });

  it("ignores a button clipped by the sticky header", () => {
    // 12% inset on a 1000px viewport: anything above 120px is under the header.
    expect(pickCoachmarkTarget(grid({ underHeader: at(80) }), VIEWPORT)).toBe(
      null,
    );
  });

  it("ignores a button hanging below the fold", () => {
    expect(pickCoachmarkTarget(grid({ belowFold: at(950) }), VIEWPORT)).toBe(
      null,
    );
  });

  it("ignores a card that measures zero", () => {
    // Detached or display:none — on screen only in the map.
    expect(pickCoachmarkTarget(grid({ hidden: at(500, 0) }), VIEWPORT)).toBe(
      null,
    );
  });

  it("waits rather than teaching on a card that is not on screen", () => {
    // Null is the caller's cue to ask again on the next scroll frame.
    expect(pickCoachmarkTarget(grid({ far: at(-300) }), VIEWPORT)).toBe(null);
    expect(pickCoachmarkTarget(new Map(), VIEWPORT)).toBe(null);
  });

  it("answers differently as the page scrolls", () => {
    // The same grid, one screen further down: a different card is centred.
    const beforeScroll = grid({ a: at(520), b: at(1400) });
    const afterScroll = grid({ a: at(-360), b: at(520) });
    expect(pickCoachmarkTarget(beforeScroll, VIEWPORT)).toBe("a");
    expect(pickCoachmarkTarget(afterScroll, VIEWPORT)).toBe("b");
  });

  it("survives a viewport it cannot measure", () => {
    expect(pickCoachmarkTarget(grid({ a: at(500) }), 0)).toBe(null);
  });
});
