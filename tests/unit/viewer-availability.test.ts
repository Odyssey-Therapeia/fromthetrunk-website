/**
 * The resolver every commerce surface reads.
 *
 * The matrix here is the contract: a shopper must never be offered a saree
 * another shopper is buying, and must never be told to wait for one already
 * sitting in their own bag.
 */
import { describe, expect, it } from "vitest";

import {
  canAddToBag,
  canAwaitReturn,
  resolveViewerAvailability,
} from "@/lib/commerce/viewer-availability";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const IN_AN_HOUR = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
const AN_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();

const resolve = (input: Parameters<typeof resolveViewerAvailability>[0]) =>
  resolveViewerAvailability({ now: NOW, ...input });

describe("viewer availability", () => {
  it("offers an unheld saree", () => {
    expect(resolve({ publicStockStatus: "available" })).toEqual({
      kind: "available",
    });
  });

  it("marks this browser's own hold as held by me", () => {
    expect(
      resolve({
        localCartItem: { reservedUntil: IN_AN_HOUR },
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "reserved",
      }),
    ).toEqual({ kind: "held-by-me", expiresAt: IN_AN_HOUR });
  });

  it("tolerates a sub-second drift between the two timestamps", () => {
    const drifted = new Date(new Date(IN_AN_HOUR).getTime() + 400).toISOString();

    expect(
      resolve({
        localCartItem: { reservedUntil: drifted },
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "reserved",
      }).kind,
    ).toBe("held-by-me");
  });

  it("treats a stale local timestamp as someone else's hold", () => {
    // The saree sits in this bag, but the live hold belongs to another
    // shopper. Offering it here would sell a piece twice.
    const theirs = new Date(new Date(IN_AN_HOUR).getTime() + 90_000).toISOString();

    expect(
      resolve({
        localCartItem: { reservedUntil: IN_AN_HOUR },
        publicReservedUntil: theirs,
        publicStockStatus: "reserved",
      }),
    ).toEqual({ kind: "held-by-other", expiresAt: theirs });
  });

  it("marks a hold with no bag line as someone else's", () => {
    expect(
      resolve({
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "reserved",
      }).kind,
    ).toBe("held-by-other");
  });

  it("frees a saree whose hold has lapsed", () => {
    expect(
      resolve({
        publicReservedUntil: AN_HOUR_AGO,
        publicStockStatus: "reserved",
      }),
    ).toEqual({ kind: "available" });
  });

  it("keeps a bag line visible when its hold lapsed", () => {
    // The shopper is still looking at their own piece; the bag's own expiry
    // sweep decides when the line goes.
    expect(
      resolve({
        localCartItem: { reservedUntil: AN_HOUR_AGO },
        publicReservedUntil: AN_HOUR_AGO,
        publicStockStatus: "reserved",
      }).kind,
    ).toBe("held-by-me");
  });

  it("shows a made-to-order blouse in the bag as held by me", () => {
    // Blouses are never reserved, so there is no timestamp to match.
    expect(
      resolve({
        localCartItem: { reservedUntil: null },
        publicStockStatus: "available",
      }).kind,
    ).toBe("held-by-me");
  });

  it("reports a release in flight before anything else", () => {
    expect(
      resolve({
        localCartItem: { reservedUntil: IN_AN_HOUR },
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "reserved",
        releasePending: true,
      }),
    ).toEqual({ kind: "releasing" });
  });

  it("reports sold ahead of any hold or bag line", () => {
    expect(
      resolve({
        localCartItem: { reservedUntil: IN_AN_HOUR },
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "sold",
      }),
    ).toEqual({ kind: "sold" });
  });

  it("survives an unparseable timestamp without offering the saree", () => {
    expect(
      resolve({
        localCartItem: { reservedUntil: "not-a-date" },
        publicReservedUntil: IN_AN_HOUR,
        publicStockStatus: "reserved",
      }).kind,
    ).toBe("held-by-other");
  });
});

describe("availability predicates", () => {
  it("permits the bag only when the piece is free", () => {
    expect(canAddToBag({ kind: "available" })).toBe(true);
    for (const availability of [
      { expiresAt: null, kind: "held-by-me" as const },
      { expiresAt: null, kind: "held-by-other" as const },
      { kind: "releasing" as const },
      { kind: "sold" as const },
    ]) {
      expect(canAddToBag(availability)).toBe(false);
    }
  });

  it("offers a wait only where the piece can actually come back", () => {
    expect(canAwaitReturn({ expiresAt: null, kind: "held-by-other" })).toBe(true);
    // A sold saree is gone for good; a hold can lapse.
    expect(canAwaitReturn({ kind: "sold" })).toBe(false);
    expect(canAwaitReturn({ kind: "available" })).toBe(false);
    expect(canAwaitReturn({ expiresAt: null, kind: "held-by-me" })).toBe(false);
  });
});
