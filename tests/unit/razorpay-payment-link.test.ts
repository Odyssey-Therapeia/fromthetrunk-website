/**
 * The provider side of required test 9.
 *
 * The server's payment deadline is at most ten minutes and never past the
 * original cart deadline, but Razorpay refuses a Payment Link that expires
 * sooner than 15 minutes from now. Only the SDK boundary is stubbed, so the
 * real createRazorpayPaymentLink decides what Razorpay receives.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paymentLinkCreateMock = vi.hoisted(() => vi.fn());
const paymentLinkCancelMock = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => ({
  default: class {
    paymentLink = {
      cancel: paymentLinkCancelMock,
      create: paymentLinkCreateMock,
    };
  },
}));

import {
  getCartReservationExpiresAt,
  getPaymentLinkDeadline,
  PAYMENT_LINK_HOLD_MINUTES,
} from "@/lib/cart/reservation-policy";
import {
  cancelRazorpayPaymentLink,
  createRazorpayPaymentLink,
  isRazorpayBadRequest,
  RAZORPAY_PAYMENT_LINK_MIN_EXPIRY_MS,
} from "@/lib/payments/razorpay";

const MINUTE = 60_000;
const NOW = new Date("2026-09-11T10:00:00.000Z");
const RAZORPAY_MINIMUM = NOW.getTime() + 15 * MINUTE;

const createLink = (expireBy?: Date) =>
  createRazorpayPaymentLink({
    amountPaise: 125_000,
    callbackUrl:
      "https://www.fromthetrunk.shop/api/v2/payments/payment-link/callback?orderId=order-1",
    customer: { email: "shopper@example.com", name: "Shopper" },
    description: "From the Trunk order",
    expireBy,
    referenceId: "ftt_order1",
  });

/** The instant Razorpay was last asked to expire a link at. */
const sentExpiry = () => {
  const body = paymentLinkCreateMock.mock.lastCall?.[0] as { expire_by: number };
  return body.expire_by * 1000;
};

/** The spec deadline for a payment started now, on a line added that long ago. */
const serverDeadlineFor = (minutesSinceAdd: number) =>
  getPaymentLinkDeadline({
    cartDeadlines: [
      getCartReservationExpiresAt(new Date(NOW.getTime() - minutesSinceAdd * MINUTE)),
    ],
    paymentStartedAt: NOW,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_example");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "test-key-secret");
  paymentLinkCreateMock.mockReset();
  paymentLinkCancelMock.mockReset();
  paymentLinkCreateMock.mockResolvedValue({
    id: "plink_new",
    short_url: "https://rzp.io/i/new",
    status: "created",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Payment Link expire_by", () => {
  it("uses Razorpay's documented 15-minute minimum", () => {
    expect(RAZORPAY_PAYMENT_LINK_MIN_EXPIRY_MS).toBe(15 * MINUTE);
  });

  it("sends a fifteen-minute payment deadline at least 15 minutes out and keeps the deadline for the database", async () => {
    const deadline = serverDeadlineFor(5);
    expect(deadline.getTime()).toBe(
      NOW.getTime() + PAYMENT_LINK_HOLD_MINUTES * MINUTE,
    );

    await createLink(deadline);

    expect(paymentLinkCreateMock).toHaveBeenCalledOnce();
    expect(sentExpiry()).toBeGreaterThanOrEqual(RAZORPAY_MINIMUM);
    expect(sentExpiry()).toBeGreaterThan(deadline.getTime());
    // The holds are written from this same value; the provider floor never
    // leaks back into it. The link outlives the hold only by the one-minute
    // latency margin, and reconciliation cancels it at the hold's deadline.
    expect(deadline.getTime()).toBe(NOW.getTime() + 15 * MINUTE);
    expect(sentExpiry() - deadline.getTime()).toBe(MINUTE);
  });

  it("still creates a payable link when the cart deadline is only minutes away", async () => {
    const deadline = serverDeadlineFor(58);
    expect(deadline.getTime()).toBe(NOW.getTime() + 2 * MINUTE);

    await createLink(deadline);

    expect(sentExpiry()).toBeGreaterThanOrEqual(RAZORPAY_MINIMUM);
    expect(deadline.getTime()).toBe(NOW.getTime() + 2 * MINUTE);
  });

  it("meets the minimum for every second of the payment window", async () => {
    for (
      let seconds = 1;
      seconds <= PAYMENT_LINK_HOLD_MINUTES * 60;
      seconds += 1
    ) {
      await createLink(new Date(NOW.getTime() + seconds * 1000));
      expect(sentExpiry()).toBeGreaterThanOrEqual(RAZORPAY_MINIMUM);
    }
  });

  it("applies the minimum to the default window too", async () => {
    await createLink();

    expect(sentExpiry()).toBeGreaterThanOrEqual(RAZORPAY_MINIMUM);
  });

  it("never shortens a deadline already beyond the minimum", async () => {
    const deadline = new Date(NOW.getTime() + 40 * MINUTE);

    await createLink(deadline);

    expect(sentExpiry()).toBe(deadline.getTime());
  });
});

describe("cancelRazorpayPaymentLink", () => {
  it("cancels the exact link and returns Razorpay's entity", async () => {
    const cancelled = { amount_paid: 0, id: "plink_open", status: "cancelled" };
    paymentLinkCancelMock.mockResolvedValue(cancelled);

    await expect(cancelRazorpayPaymentLink("plink_open")).resolves.toEqual(
      cancelled,
    );
    expect(paymentLinkCancelMock).toHaveBeenCalledWith("plink_open");
  });
});

describe("isRazorpayBadRequest", () => {
  it.each([
    [
      "an expire_by rejection",
      {
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "timestamp must be atleast 15 minutes in future",
        },
        statusCode: 400,
      },
      true,
    ],
    [
      "a string 400 status",
      {
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "cannot cancel or expire an already paid/partially paid link",
        },
        statusCode: "400",
      },
      true,
    ],
    [
      "a 401, which Razorpay also labels BAD_REQUEST_ERROR",
      {
        error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" },
        statusCode: 401,
      },
      false,
    ],
    ["a server error", { error: { code: "SERVER_ERROR" }, statusCode: 500 }, false],
    ["a coded error without a status", { error: { code: "BAD_REQUEST_ERROR" } }, true],
    ["a timeout", new Error("socket hang up"), false],
    ["nothing", null, false],
  ])("classifies %s", (_label, error, expected) => {
    expect(isRazorpayBadRequest(error)).toBe(expected);
  });
});
