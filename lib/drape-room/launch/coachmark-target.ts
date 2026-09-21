/**
 * Which Drape Room button the coach mark should point at.
 *
 * Split out of the provider because it is the whole decision and none of the
 * React: given where the buttons are and how tall the viewport is, it says
 * which one the shopper is looking at. That makes it directly testable, which
 * a scroll handler wired to an effect is not.
 */
import { drapeLaunchConfig } from "./config";

/** Structural, so tests can measure plain objects instead of real elements. */
export type MeasurableTrigger = {
  getBoundingClientRect: () => {
    bottom: number;
    height: number;
    top: number;
    width: number;
  };
};

/**
 * The registered button nearest the middle of the screen, or null if none sits
 * comfortably on it.
 *
 * "Nearest the middle" rather than "first visible": a coach mark on a card the
 * shopper is scrolling past teaches less than one on the card they have
 * stopped at. The answer changes as they scroll, so the caller asks repeatedly.
 */
export function pickCoachmarkTarget(
  triggers: Map<string, MeasurableTrigger>,
  viewportHeight: number,
): null | string {
  if (viewportHeight <= 0) return null;

  // Keeps the lesson off a card half-hidden behind the sticky header or
  // clipped by the fold.
  const inset = viewportHeight * drapeLaunchConfig.trigger.coachmarkViewportInset;
  const middle = viewportHeight / 2;

  let nearest: null | string = null;
  let shortest = Number.POSITIVE_INFINITY;

  for (const [productId, trigger] of triggers) {
    const box = trigger.getBoundingClientRect();
    // A detached or hidden card measures zero and is not on screen at all.
    if (box.width === 0 || box.height === 0) continue;
    if (box.top < inset || box.bottom > viewportHeight - inset) continue;

    const distance = Math.abs(box.top + box.height / 2 - middle);
    if (distance < shortest) {
      shortest = distance;
      nearest = productId;
    }
  }

  return nearest;
}
