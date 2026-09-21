/**
 * The single verdict every commerce surface renders.
 *
 * Decided on the server because it is the only place that holds both facts —
 * the product's live hold and this shopper's own bag row. The browser used to
 * infer it, which is how a card's badge came to read "Reserved" over its own
 * "In your bag" button. A bag row alone never overrides it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReservationToken } from "@/lib/cart/reservation-token";
import * as viewerStateModule from "@/lib/commerce/viewer-state";
import {
  readViewerProductState,
  resolveViewerState,
  resolveViewerStates,
  type ViewerStateInput,
} from "@/lib/commerce/viewer-state";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const LIVE = new Date(NOW.getTime() + 30 * 60 * 1000);
const LAPSED = new Date(NOW.getTime() - 60 * 1000);
const PRODUCT = "11111111-1111-4111-8111-111111111111";

const row = (overrides: Partial<ViewerStateInput> = {}): ViewerStateInput => ({
  cartReservationToken: null,
  cartReservedUntil: null,
  cartStatus: null,
  hasPendingPayment: false,
  madeToOrderInBag: false,
  productId: PRODUCT,
  reservedUntil: null,
  stockStatus: "available",
  ...overrides,
});

const resolve = (overrides: Partial<ViewerStateInput> = {}) =>
  resolveViewerState(row(overrides), NOW);

const tokenFor = (reservedUntil: Date, productId = PRODUCT) =>
  createReservationToken({ productId, reservedUntil });

/** This viewer's bag line holding the product at exactly its expiry. */
const ownHold = (
  reservedUntil = LIVE,
  overrides: Partial<ViewerStateInput> = {},
): Partial<ViewerStateInput> => ({
  cartReservationToken: tokenFor(reservedUntil),
  cartReservedUntil: reservedUntil,
  cartStatus: "active",
  reservedUntil,
  stockStatus: "reserved",
  ...overrides,
});

/** This viewer's exact current payment hold. */
const ownPaymentHold = (
  reservedUntil = LIVE,
  overrides: Partial<ViewerStateInput> = {},
) =>
  ownHold(reservedUntil, {
    cartStatus: "payment_pending",
    hasPendingPayment: true,
    ...overrides,
  });

describe("viewer state", () => {
  beforeEach(() => vi.stubEnv("NEXTAUTH_SECRET", "test-reservation-secret"));

  it("offers an unheld saree", () => {
    expect(resolve()).toEqual({ reservedUntil: null, state: "available" });
  });

  it("reports a sold saree ahead of everything else", () => {
    expect(
      resolve(ownPaymentHold(LIVE, { madeToOrderInBag: true, stockStatus: "sold" }))
        .state,
    ).toBe("sold");
  });

  it("frees a hold whose window has passed, with no sweep", () => {
    // Correctness must never wait for a scheduled job.
    expect(
      resolve({ reservedUntil: LAPSED, stockStatus: "reserved" }),
    ).toEqual({ reservedUntil: null, state: "available" });
  });

  it("recognises the shopper's own hold as In bag with trash", () => {
    const verdict = resolve(ownHold());

    expect(verdict.state).toBe("in_my_cart");
    expect(verdict.reservedUntil).toBe(LIVE.toISOString());
  });

  it("calls a stranger's hold what it is", () => {
    expect(
      resolve({ reservedUntil: LIVE, stockStatus: "reserved" }).state,
    ).toBe("reserved_by_other");
  });

  it.each([1, 400])(
    "never lets the shopper's own line %i ms off the hold claim it",
    (driftMs) => {
      // The same exact-match rule the release path enforces, so what a shopper
      // is shown can never disagree with what they are allowed to do.
      const drifted = new Date(LIVE.getTime() - driftMs);
      expect(
        resolve({
          cartReservationToken: tokenFor(drifted),
          cartReservedUntil: drifted,
          cartStatus: "active",
          reservedUntil: LIVE,
          stockStatus: "reserved",
        }).state,
      ).toBe("reserved_by_other");
    },
  );

  it("refuses ownership on a token for a different saree", () => {
    expect(
      resolve(
        ownHold(LIVE, {
          cartReservationToken: tokenFor(
            LIVE,
            "99999999-9999-4999-8999-999999999999",
          ),
        }),
      ).state,
    ).toBe("reserved_by_other");
  });

  it("refuses an older valid token for the same saree's newer hold", () => {
    const oldExpiry = new Date(LIVE.getTime() - 5_000);
    expect(
      resolve(ownHold(LIVE, { cartReservationToken: tokenFor(oldExpiry) })).state,
    ).toBe("reserved_by_other");
  });

  it("refuses ownership on a forged token", () => {
    expect(
      resolve(ownHold(LIVE, { cartReservationToken: "not.a.real.token" })).state,
    ).toBe("reserved_by_other");
  });

  describe("payment ownership", () => {
    it("reports the exact current payment hold as payment_pending", () => {
      expect(resolve(ownPaymentHold())).toEqual({
        reservedUntil: LIVE.toISOString(),
        state: "payment_pending",
      });
    });

    it("keeps an active line In bag with trash even beside a pending order", () => {
      // A leftover pending order is not this line's payment unless the line
      // itself moved into payment at the product's exact expiry.
      expect(resolve(ownHold(LIVE, { hasPendingPayment: true })).state).toBe(
        "in_my_cart",
      );
    });

    it("never reads a row that merely says payment_pending as a payment", () => {
      expect(
        resolve(ownHold(LIVE, { cartStatus: "payment_pending" })).state,
      ).toBe("in_my_cart");
    });

    it.each([1, 400])(
      "treats a payment line %i ms off the product's expiry as someone else's claim",
      (driftMs) => {
        const drifted = new Date(LIVE.getTime() - driftMs);
        expect(
          resolve({
            cartReservationToken: tokenFor(drifted),
            cartReservedUntil: drifted,
            cartStatus: "payment_pending",
            hasPendingPayment: true,
            reservedUntil: LIVE,
            stockStatus: "reserved",
          }).state,
        ).toBe("reserved_by_other");
      },
    );

    it("keeps the viewer's exact lapsed payment protected until provider reconciliation", () => {
      expect(
        resolve(ownPaymentHold(LAPSED, { paymentProtected: true })),
      ).toEqual({
        reservedUntil: LAPSED.toISOString(),
        state: "payment_pending",
      });
    });

    it("keeps another shopper's lapsed pending-payment hold unavailable", () => {
      expect(
        resolve({
          paymentProtected: true,
          reservedUntil: LAPSED,
          stockStatus: "reserved",
        }),
      ).toEqual({
        reservedUntil: LAPSED.toISOString(),
        state: "reserved_by_other",
      });
    });

    it.each([
      ["an active line", { cartStatus: "active" }],
      ["a drifted payment line", { cartReservedUntil: new Date(LAPSED.getTime() - 1) }],
    ] as const)(
      "never gives a protected hold to the viewer through %s",
      (_label, overrides) => {
        expect(
          resolve(ownPaymentHold(LAPSED, { paymentProtected: true, ...overrides }))
            .state,
        ).toBe("reserved_by_other");
      },
    );
  });

  describe("made-to-order blouses", () => {
    it("reports a blouse in the bag as In bag, with no hold to compare", () => {
      expect(resolve({ cartStatus: "active", madeToOrderInBag: true })).toEqual({
        reservedUntil: null,
        state: "in_my_cart",
      });
    });

    it("keeps a blouse outside the bag available", () => {
      expect(resolve({ madeToOrderInBag: false }).state).toBe("available");
    });
  });

  it("resolves a whole page in one pass, keyed by product", () => {
    const verdicts = resolveViewerStates(
      [
        row({ productId: "a", stockStatus: "available" }),
        row({ productId: "b", reservedUntil: LIVE, stockStatus: "reserved" }),
        row({ productId: "c", stockStatus: "sold" }),
      ],
      NOW,
    );

    expect(verdicts.a.state).toBe("available");
    expect(verdicts.b.state).toBe("reserved_by_other");
    expect(verdicts.c.state).toBe("sold");
  });
});

describe("malformed verdicts never become + Cart", () => {
  it.each([undefined, null, "", "AVAILABLE", 1, "checking", "in bag", {}, ["available"]])(
    "rejects %j",
    (value) => {
      expect(readViewerProductState(value)).toBeNull();
    },
  );

  it.each([
    "available",
    "in_my_cart",
    "payment_pending",
    "reserved_by_other",
    "sold",
  ])("accepts the server state %s", (state) => {
    expect(readViewerProductState(state)).toBe(state);
  });
});

describe("no cart-row override", () => {
  it("offers no way to turn a bag row into a verdict", () => {
    expect(Object.keys(viewerStateModule)).not.toContain(
      "reconcileViewerStateWithServerCart",
    );
  });
});
